import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function getAI() {
  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || "";
  if (!key || key === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({ apiKey: key, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
}

const FALLBACK = {
  suggestedFont: "Homemade Apple",
  suggestedColor: "blue",
  suggestedSize: 18,
  suggestedRotation: -2,
  analysisDescription: "Style écolier classique appliqué par défaut.",
  confidenceScore: 50,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Méthode non autorisée." });

  const { handwritingImage, studentName } = req.body || {};
  if (!handwritingImage || !String(handwritingImage).includes("base64,")) {
    return res.status(200).json({ success: true, handwritingStyle: FALLBACK });
  }

  const ai = getAI();
  if (!ai) return res.status(200).json({ success: true, handwritingStyle: FALLBACK });

  try {
    const b64 = String(handwritingImage).split("base64,")[1];
    const mime = (String(handwritingImage).split(";")[0].split(":")[1] || "image/png") as any;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { inlineData: { data: b64, mimeType: mime } },
        {
          text:
            `Analyse l'écriture manuscrite de l'élève "${studentName || "inconnu"}". ` +
            `Donne:\n` +
            `1. Police PARMI: 'Homemade Apple', 'Marck Script', 'Parisienne', 'Allura', 'La Belle Aurore', 'Bad Script'\n` +
            `2. Couleur: 'blue', 'black', 'red', ou 'green'\n` +
            `3. Taille: nombre entre 14 et 22\n` +
            `4. Angle: nombre entre -6 et 6\n` +
            `5. Description en français\n` +
            `6. Confiance: nombre entre 0 et 100\n` +
            `JSON uniquement.`,
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
          required: ["suggestedFont", "suggestedColor", "suggestedSize", "suggestedRotation", "analysisDescription", "confidenceScore"],
        },
      },
    });

    const parsed = response.text ? JSON.parse(response.text.trim()) : FALLBACK;
    return res.status(200).json({ success: true, handwritingStyle: parsed });
  } catch (err: any) {
    console.error("analyze-handwriting:", err.message);
    return res.status(200).json({ success: true, handwritingStyle: FALLBACK });
  }
}
