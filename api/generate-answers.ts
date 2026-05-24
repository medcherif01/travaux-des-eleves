import { GoogleGenAI, Type } from "@google/genai";
import mongoose from "mongoose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── Inline key rotation (Vercel cannot import from sibling api/ files) ────────
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (const name of ["GEMINI_API_KEY_1","GEMINI_API_KEY_2","GEMINI_API_KEY_3","GEMINI_API_KEY_4","GEMINI_API_KEY","GEMINI_KEY"]) {
    const v = process.env[name];
    if (v && v !== "MY_GEMINI_API_KEY" && v.length > 10) keys.push(v);
  }
  return [...new Set(keys)];
}
function isQuota(err: any): boolean {
  const msg = String(err?.message || err?.status || err || "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("rate limit") || err?.status === 429;
}
async function withKeys<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error("Aucune clé Gemini configurée.");
  let last: any;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await fn(new GoogleGenAI({ apiKey: keys[i], httpOptions: { headers: { "User-Agent": "aistudio-build" } } }));
    } catch (e: any) {
      if (isQuota(e)) { console.warn(`Gemini key #${i+1} quota → next`); last = e; continue; }
      throw e;
    }
  }
  throw new Error(`All Gemini keys exhausted. Last: ${last?.message}`);
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Inline MongoDB session schema ─────────────────────────────────────────────
const EvalSessionSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true },
    detectedQuestions: mongoose.Schema.Types.Mixed,
    criteriaLevel: { type: String, default: "5-6" },
    generatedAnswers: mongoose.Schema.Types.Mixed,
    variantSeed: { type: Number, default: 1 },
  },
  { timestamps: true }
);
function getSessionModel() {
  return mongoose.models.EvalSession || mongoose.model("EvalSession", EvalSessionSchema);
}
async function connectDB(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) return true;
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI || "";
  if (!uri) return false;
  try {
    await mongoose.connect(uri, { dbName: "nanobanana", serverSelectionTimeoutMS: 5000 });
    return true;
  } catch { return false; }
}

const LEVEL_DESC: Record<string, string> = {
  "1-2": "Niveau LIMITÉ (1-2/8): Très courtes réponses imprécises, quelques erreurs de calcul, vocabulaire très basique, justifications absentes.",
  "3-4": "Niveau RUDIMENTAIRE (3-4/8): Réponses correctes mais incomplètes, manque de rigueur, vocabulaire simple.",
  "5-6": "Niveau SATISFAISANT (5-6/8): Réponses précises, calculs corrects, termes scientifiques appropriés, bien détaillé.",
  "7-8": "Niveau EXCELLENT (7-8/8): Travail exemplaire, justifications complètes, calculs avec toutes les étapes, analyse critique.",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Méthode non autorisée." });

  const { questions, criteriaLevel, studentName, variantSeed, pdfPagesBase64, saveSession } = req.body || {};

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ success: false, error: "Questions manquantes." });
  }

  const level = String(criteriaLevel || "5-6");
  const seed  = Number(variantSeed || 1);
  const name  = String(studentName || "Élève");
  const levelDesc = LEVEL_DESC[level] || LEVEL_DESC["5-6"];

  const keys = getGeminiKeys();
  if (!keys.length) {
    const DEMO: Record<string, string[]> = {
      "1-2": ["Je sais pas trop c'est compliqué", "La réponse est environ 135 je crois", "C'est beaucoup d'énergie"],
      "3-4": ["Le coût total est de 135 euros", "La consommation journalière est 10 kWh", "Il faut faire attention à l'énergie"],
      "5-6": ["En appliquant la formule: 900 × 0,15 = 135 €", "La consommation moyenne est 900 ÷ 90 = 10 kWh/jour", "Les données montrent que la gestion de l'énergie est essentielle"],
      "7-8": ["En appliquant rigoureusement C = E × pu = 900 × 0,15 = 135 € + abonnement 30 € = 165 € total", "La consommation journalière moyenne s'établit à 900 ÷ 90 = 10 kWh/jour soit 300 kWh/mois", "L'analyse critique démontre que la maîtrise de la consommation énergétique est fondamentale"],
    };
    const arr = DEMO[level] || DEMO["5-6"];
    const answers: Record<string, string> = {};
    questions.forEach((q: any, i: number) => { answers[q.id] = arr[(seed + i) % arr.length]; });
    return res.status(200).json({ success: true, answers, isDemo: true });
  }

  try {
    const parts: any[] = [];
    if (Array.isArray(pdfPagesBase64)) {
      for (let i = 0; i < Math.min(pdfPagesBase64.length, 4); i++) {
        const pg = String(pdfPagesBase64[i] || "");
        if (!pg.includes("base64,")) continue;
        const b64  = pg.split("base64,")[1];
        const mime = (pg.split(";")[0].split(":")[1] || "image/png") as any;
        parts.push({ inlineData: { data: b64, mimeType: mime } });
      }
    }

    const qList = questions.map((q: any) => `  - ID:"${q.id}" → "${q.text}"`).join("\n");
    parts.push({
      text:
        `Tu joues le rôle de l'élève "${name}" (variante ${seed}).\n\n` +
        `${levelDesc}\n\n` +
        `RÈGLES ABSOLUES:\n` +
        `1. Réponses UNIQUES propres à "${name}" variante ${seed}\n` +
        `2. AUCUN markdown (pas de **, tirets, listes) — texte brut uniquement\n` +
        `3. Français uniquement\n` +
        `4. Style naturel d'élève écrivant à la main\n` +
        `5. Réponds à TOUTES les questions\n\n` +
        `QUESTIONS:\n${qList}\n\n` +
        `JSON: {"answers": {"<id>": "<réponse>", ...}}`,
    });

    const rawText = await withKeys(async (ai) => {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: parts,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { answers: { type: Type.OBJECT } },
            required: ["answers"],
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

    const answers = parsed.answers || {};

    if (saveSession) {
      connectDB().then(async (ok) => {
        if (!ok) return;
        try {
          const M = getSessionModel();
          await new M({ studentName: name, detectedQuestions: questions, criteriaLevel: level, generatedAnswers: answers, variantSeed: seed }).save();
        } catch { /* ignore */ }
      });
    }

    return res.status(200).json({ success: true, answers });
  } catch (err: any) {
    console.error("generate-answers:", err?.message || err);
    return res.status(500).json({ success: false, error: String(err?.message || "Erreur serveur") });
  }
}
