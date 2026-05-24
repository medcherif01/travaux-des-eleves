/**
 * POST /api/analyze-handwriting
 * Gemini analyzes a handwriting sample image and returns font/style suggestions
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAIClient, Type } from "./_lib";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Méthode non autorisée." });
  }

  const { handwritingImage, studentName } = req.body || {};

  if (!handwritingImage || !handwritingImage.includes("base64,")) {
    return res.status(400).json({ success: false, error: "Image base64 manquante." });
  }

  // Default fallback style
  const fallback = {
    suggestedFont: "Homemade Apple",
    suggestedColor: "blue",
    suggestedSize: 18,
    suggestedRotation: -2,
    analysisDescription: "Style écolier par défaut (clé API manquante).",
    confidenceScore: 50,
  };

  const ai = getAIClient();
  if (!ai) {
    return res.status(200).json({ success: true, handwritingStyle: fallback });
  }

  try {
    const base64Data = handwritingImage.split("base64,")[1];
    const mimeType = (handwritingImage.split(";")[0].split(":")[1] || "image/png") as any;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        {
          text:
            `Analyse cette image d'écriture manuscrite (élève: "${studentName || "inconnu"}"). ` +
            `Identifie les caractéristiques pour un rendu numérique fidèle:\n` +
            `1. Police manuscrite la plus proche PARMI UNIQUEMENT: 'Homemade Apple', 'Marck Script', 'Parisienne', 'Allura', 'La Belle Aurore', 'Bad Script'\n` +
            `2. Couleur d'encre observée: 'blue', 'black', 'red', ou 'green'\n` +
            `3. Taille de police estimée entre 14 et 22 (défaut 18)\n` +
            `4. Angle d'inclinaison naturelle en degrés entre -6 et +6\n` +
            `5. Description de l'écriture en français (2-3 phrases)\n` +
            `6. Score de confiance entre 0 et 100\n` +
            `Retourne uniquement un JSON valide.`,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedFont: { type: Type.STRING },
            suggestedColor: { type: Type.STRING },
            suggestedSize: { type: Type.NUMBER },
            suggestedRotation: { type: Type.NUMBER },
            analysisDescription: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER },
          },
          required: [
            "suggestedFont",
            "suggestedColor",
            "suggestedSize",
            "suggestedRotation",
            "analysisDescription",
            "confidenceScore",
          ],
        },
      },
    });

    if (!response.text) {
      return res.status(200).json({ success: true, handwritingStyle: fallback });
    }

    const parsed = JSON.parse(response.text.trim());
    return res.status(200).json({ success: true, handwritingStyle: parsed });
  } catch (err: any) {
    console.error("analyze-handwriting error:", err);
    // Always return a valid fallback — never a 500 that breaks JSON parsing
    return res.status(200).json({ success: true, handwritingStyle: fallback, warning: err.message });
  }
}
