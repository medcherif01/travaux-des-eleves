/**
 * POST /api/generate-answers
 * Gemini generates unique per-student answers for detected questions
 * Saves EvaluationSession to MongoDB
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Student, EvalSession, getAIClient, Type } from "./_lib";
import mongoose from "mongoose";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Méthode non autorisée." });
  }

  const {
    questions,
    criteriaLevel,
    studentName,
    variantSeed,
    pdfPagesBase64,
    saveSession,
  } = req.body || {};

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ success: false, error: "Questions manquantes." });
  }

  const level = criteriaLevel || "5-6";
  const seed = variantSeed || 1;
  const name = studentName || "Élève";

  // Level descriptions for the prompt
  const levelDescriptions: Record<string, string> = {
    "1-2":
      "Niveau LIMITÉ (1-2/8): Réponses très courtes et imprécises. Fait quelques petites erreurs de calcul. Vocabulaire très basique. Justifications absentes ou confuses. Peut confondre les unités.",
    "3-4":
      "Niveau RUDIMENTAIRE (3-4/8): Réponses correctes mais incomplètes. Calculs souvent justes mais explications manquant de rigueur scientifique. Vocabulaire simple. Manque de justifications.",
    "5-6":
      "Niveau SATISFAISANT (5-6/8): Réponses précises avec calculs corrects. Explications claires avec termes scientifiques appropriés. Détaille les calculs mais reste concis.",
    "7-8":
      "Niveau EXCELLENT (7-8/8): Travail exemplaire. Justifications complètes. Calculs parfaitement détaillés avec toutes les étapes. Analyse critique. Compare et évalue scientifiquement.",
  };

  const levelDesc = levelDescriptions[level] || levelDescriptions["5-6"];
  const ai = getAIClient();

  // Demo fallback without API key
  if (!ai) {
    const demoAnswers: Record<string, string> = {};
    questions.forEach((q: any) => {
      const demos: Record<string, string[]> = {
        "1-2": ["Je sais pas trop, c'est compliqué", "La réponse c'est environ 135 je crois", "C'est beaucoup d'énergie"],
        "3-4": ["Le coût total est de 135 euros", "La consommation journalière est 10 kWh", "Il faut faire attention à l'énergie"],
        "5-6": ["En appliquant la formule, le coût total est 900 × 0,15 = 135 €", "La consommation moyenne est 900 ÷ 90 = 10 kWh/jour", "Les données montrent que la gestion de l'énergie est essentielle"],
        "7-8": ["En appliquant rigoureusement C = E × pu = 900 × 0,15 = 135 € + abonnement 30 € = 165 € au total", "La consommation journalière moyenne s'établit à 900 ÷ 90 = 10 kWh/jour, soit 300 kWh/mois", "L'analyse critique des données démontre que la maîtrise de la consommation énergétique est fondamentale pour réduire les émissions de CO₂"],
      };
      const arr = demos[level] || demos["5-6"];
      demoAnswers[q.id] = arr[(seed + questions.indexOf(q)) % arr.length];
    });
    return res.status(200).json({ success: true, answers: demoAnswers, isDemo: true });
  }

  try {
    const contentParts: any[] = [];

    // Include up to 4 pages as context
    if (pdfPagesBase64 && Array.isArray(pdfPagesBase64)) {
      for (let i = 0; i < Math.min(pdfPagesBase64.length, 4); i++) {
        const pageData = pdfPagesBase64[i];
        if (pageData && pageData.includes("base64,")) {
          const b64 = pageData.split("base64,")[1];
          const mime = (pageData.split(";")[0].split(":")[1] || "image/png") as any;
          contentParts.push({ inlineData: { data: b64, mimeType: mime } });
        }
      }
    }

    const questionsList = questions
      .map((q: any) => `  - ID: "${q.id}" → "${q.text}"`)
      .join("\n");

    contentParts.push({
      text:
        `Tu joues le rôle précis d'un(e) élève prénommé(e) "${name}" (variante unique: ${seed}).\n\n` +
        `${levelDesc}\n\n` +
        `RÈGLES ABSOLUES:\n` +
        `1. Tes réponses doivent être UNIQUES à "${name}" avec la variante ${seed} — formulations propres à cet élève\n` +
        `2. AUCUN markdown: pas de **, pas de -, pas de listes — texte brut uniquement\n` +
        `3. Réponses EN FRANÇAIS uniquement\n` +
        `4. Style naturel d'un élève écrivant à la main, phrases directes\n` +
        `5. Longueur appropriée au niveau (courte pour 1-2, développée pour 7-8)\n` +
        `6. Réponds à TOUTES les questions — ne saute aucune\n\n` +
        `QUESTIONS:\n${questionsList}\n\n` +
        `Retourne un JSON {"answers": {"<id>": "<réponse>", ...}} pour CHAQUE question.`,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentParts,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answers: {
              type: Type.OBJECT,
              description: "Map question_id → réponse manuscrite",
            },
          },
          required: ["answers"],
        },
      },
    });

    if (!response.text) {
      return res.status(500).json({ success: false, error: "Réponse vide de Gemini." });
    }

    const parsed = JSON.parse(response.text.trim());
    const answers = parsed.answers || {};

    // Save session to MongoDB (fire and forget — don't block response)
    if (saveSession) {
      connectDB().then(async (dbOk) => {
        if (!dbOk) return;
        try {
          const studentDoc = await Student.findOne({ name }).lean();
          await new EvalSession({
            studentId: studentDoc?._id || null,
            studentName: name,
            pdfPagesBase64: [], // Don't store full pages — too large
            detectedQuestions: questions,
            criteriaLevel: level,
            generatedAnswers: answers,
            variantSeed: seed,
          }).save();
        } catch (dbErr) {
          console.error("Session save error:", dbErr);
        }
      });
    }

    return res.status(200).json({ success: true, answers });
  } catch (err: any) {
    console.error("generate-answers error:", err);
    return res.status(500).json({ success: false, error: `Erreur Gemini: ${err.message}` });
  }
}
