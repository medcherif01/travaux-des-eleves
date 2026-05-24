import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function getAI() {
  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || "";
  if (!key || key === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({ apiKey: key, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
}

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

  const ai = getAI();
  if (!ai) {
    return res.status(200).json({
      success: true,
      isDemo: true,
      questions: [
        { id: "demo_q1", text: "Question 1 (mode démo — configurez GEMINI_API_KEY)", pageIndex: 0, x: 8, y: 30, maxWidth: 82 },
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

    if (parts.length === 0) {
      return res.status(400).json({ success: false, error: "Aucune image valide trouvée." });
    }

    parts.push({
      text:
        `Analyse ce document scolaire. Détecte TOUTES les zones où l'élève doit écrire une réponse.\n\n` +
        `Pour chaque zone de réponse retourne:\n` +
        `- id: identifiant unique (q1, q2, q1a, q1b...)\n` +
        `- text: texte complet de la question/consigne\n` +
        `- pageIndex: numéro de page (0 = première)\n` +
        `- x: % horizontal (5 à 15) du début de la zone de réponse\n` +
        `- y: % vertical (5 à 95) de LA PREMIÈRE LIGNE VIDE où écrire — APRÈS le texte de la question\n` +
        `  Exemple: si question à 30%, la ligne de réponse est à 35-38%\n` +
        `  Si "Réponse :" suivi d'une ligne est à 40%, mettre y=40\n\n` +
        `IMPORTANT: ignorer titres, objectifs, critères. Max 20 questions.\n` +
        `Répondre UNIQUEMENT avec JSON: {"questions":[...]}`,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: parts,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
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
          required: ["questions"],
        },
      },
    });

    const rawText = response.text || "";
    if (!rawText) return res.status(500).json({ success: false, error: "Gemini: réponse vide." });

    let parsed: any;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch {
      // Try extracting JSON from text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ success: false, error: "Gemini: JSON invalide." });
      parsed = JSON.parse(match[0]);
    }

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

    if (questions.length === 0) {
      return res.status(200).json({ success: false, error: "Aucune question détectée dans ce document." });
    }

    return res.status(200).json({ success: true, questions });
  } catch (err: any) {
    console.error("detect-questions ERROR:", err?.message || err);
    return res.status(500).json({ success: false, error: String(err?.message || "Erreur serveur") });
  }
}
