import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── Inline key rotation (Vercel cannot import from sibling api/ files) ────────
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (const name of [
    "GEMINI_API_KEY_1","GEMINI_API_KEY_2","GEMINI_API_KEY_3","GEMINI_API_KEY_4",
    "GEMINI_API_KEY_5","GEMINI_API_KEY_6","GEMINI_API_KEY_7","GEMINI_API_KEY_8",
    "GEMINI_API_KEY_9","GEMINI_API_KEY_10","GEMINI_API_KEY","GEMINI_KEY",
  ]) {
    const v = process.env[name];
    if (v && v !== "MY_GEMINI_API_KEY" && v.length > 10) keys.push(v);
  }
  return [...new Set(keys)];
}
function isRetryable(err: any): boolean {
  const msg = String(err?.message || err?.status || err || "").toLowerCase();
  return (
    msg.includes("429")               || // quota
    msg.includes("quota")             ||
    msg.includes("resource_exhausted")||
    msg.includes("rate limit")        ||
    msg.includes("too many requests") ||
    msg.includes("503")               || // server overloaded / high demand
    msg.includes("unavailable")       ||
    msg.includes("high demand")       ||
    msg.includes("overloaded")        ||
    msg.includes("spike")             ||
    msg.includes("service unavailable")||
    err?.status === 429               ||
    err?.status === 503
  );
}
const MAX_ROUNDS_DQ = 4; // increased from 3
async function withKeys<T>(fn: (ai: GoogleGenAI, round: number) => Promise<T>): Promise<T> {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error("Aucune clé Gemini configurée.");
  let last: any;
  const total = keys.length * MAX_ROUNDS_DQ;
  for (let attempt = 0; attempt < total; attempt++) {
    const i = attempt % keys.length;
    const round = Math.floor(attempt / keys.length) + 1;
    try {
      return await fn(new GoogleGenAI({ apiKey: keys[i], httpOptions: { headers: { "User-Agent": "aistudio-build" } } }), round);
    } catch (e: any) {
      if (isRetryable(e)) {
        const is503 = String(e?.message || e || "").toLowerCase().includes("503") ||
                      String(e?.message || e || "").toLowerCase().includes("unavailable") ||
                      e?.status === 503;
        console.warn(`Gemini key #${i+1} ${is503 ? "503/overloaded" : "quota"} (round ${round}) → next`);
        last = e;
        // Longer backoff for 503 (server overloaded) vs 429 (quota)
        const backoffMs = is503 ? 2500 * round : 1500 * round;
        if (i === keys.length - 1 && round < MAX_ROUNDS_DQ) await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      throw e;
    }
  }
  throw new Error(`All ${keys.length} Gemini keys exhausted (${MAX_ROUNDS_DQ} rounds). Last: ${last?.message}`);
}
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number, def: number) {
  const n = Number(v);
  if (!isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Méthode non autorisée." });

  const { pdfPagesBase64 } = req.body || {};
  if (!pdfPagesBase64 || !Array.isArray(pdfPagesBase64) || pdfPagesBase64.length === 0) {
    return res.status(400).json({ success: false, error: "Pages manquantes." });
  }

  const keys = getGeminiKeys();
  if (!keys.length) {
    return res.status(200).json({
      success: true,
      isDemo: true,
      questions: [
        { id: "demo_q1", text: "Question 1 (mode démo — configurez GEMINI_API_KEY_1)", pageIndex: 0, x: 8, y: 30, maxWidth: 82 },
        { id: "demo_q2", text: "Question 2 (mode démo)", pageIndex: 0, x: 8, y: 50, maxWidth: 82 },
        { id: "demo_q3", text: "Question 3 (mode démo)", pageIndex: 0, x: 8, y: 70, maxWidth: 82 },
      ],
    });
  }

  try {
    const parts: any[] = [];
    const count = Math.min(pdfPagesBase64.length, 6);
    for (let i = 0; i < count; i++) {
      const pg = String(pdfPagesBase64[i] || "");
      if (!pg.includes("base64,")) continue;
      const b64 = pg.split("base64,")[1];
      const mime = (pg.split(";")[0].split(":")[1] || "image/png") as any;
      parts.push({ inlineData: { data: b64, mimeType: mime } });
    }
    if (parts.length === 0) return res.status(400).json({ success: false, error: "Aucune image valide." });

    parts.push({
      text:
        `Analyse ce document scolaire. Détecte TOUTES les zones où l'élève doit écrire une réponse.\n\n` +
        `Retourne aussi la langue principale du document ("fr" pour français, "en" pour anglais, etc.).\n\n` +
        `Pour chaque zone retourne:\n` +
        `- id: identifiant unique (q1, q2, q1a, q1b...)\n` +
        `- text: texte complet de la question (dans la langue du document)\n` +
        `- pageIndex: numéro de page (0 = première)\n` +
        `- x: % horizontal (5 à 15) du début de la réponse\n` +
        `- y: % vertical de LA PREMIÈRE LIGNE VIDE où écrire (après le texte de la question)\n` +
        `  Si "Réponse :" est à 40%, mettre y=40. Si lignes pointillées commencent à 35%, mettre y=35.\n\n` +
        `Ignorer titres/objectifs/critères. Max 20 questions.\n` +
        `JSON: {"lang":"fr","questions":[...]}`,
    });

    const rawText = await withKeys(async (ai, round) => {
      // On round 3+ fall back to gemini-1.5-flash (less loaded during demand spikes)
      const model = round >= 3 ? "gemini-1.5-flash" : "gemini-2.5-flash";
      const response = await ai.models.generateContent({
        model,
        contents: parts,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lang: { type: Type.STRING, description: "Main language code: 'fr', 'en', 'ar', etc." },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id:        { type: Type.STRING },
                    text:      { type: Type.STRING },
                    pageIndex: { type: Type.NUMBER },
                    x:         { type: Type.NUMBER },
                    y:         { type: Type.NUMBER },
                  },
                  required: ["id", "text", "pageIndex", "x", "y"],
                },
              },
            },
            required: ["lang", "questions"],
          },
        },
      });
      return response.text || "";
    });

    if (!rawText) return res.status(500).json({ success: false, error: "Gemini: réponse vide." });

    let parsed: any;
    try { parsed = JSON.parse(rawText.trim()); }
    catch {
      const m = rawText.match(/\{[\s\S]*\}/);
      if (!m) return res.status(500).json({ success: false, error: "JSON invalide." });
      parsed = JSON.parse(m[0]);
    }

    // Extract detected language (default "fr")
    const detectedLang = String(parsed?.lang || "fr").toLowerCase().slice(0, 2);

    const raw = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const questions = raw
      .filter((q: any) => q && q.id && q.text)
      .map((q: any) => ({
        id:        String(q.id).replace(/[^a-zA-Z0-9_]/g, "_"),
        text:      String(q.text),
        pageIndex: clamp(q.pageIndex, 0, 20, 0),
        x:         clamp(q.x, 1, 30, 8),
        y:         clamp(q.y, 5, 95, 30),
        maxWidth:  82,
      }));

    if (questions.length === 0) return res.status(200).json({ success: false, error: "Aucune question détectée dans ce document." });
    return res.status(200).json({ success: true, questions, lang: detectedLang });
  } catch (err: any) {
    console.error("detect-questions ERROR:", err?.message || err);
    return res.status(500).json({ success: false, error: String(err?.message || "Erreur serveur") });
  }
}
