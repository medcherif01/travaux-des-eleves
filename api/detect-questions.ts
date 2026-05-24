/**
 * POST /api/detect-questions
 * Gemini reads all uploaded evaluation pages and detects all questions with positions
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

  const { pdfPagesBase64 } = req.body || {};

  if (!pdfPagesBase64 || !Array.isArray(pdfPagesBase64) || pdfPagesBase64.length === 0) {
    return res.status(400).json({ success: false, error: "Pages d'évaluation manquantes." });
  }

  const ai = getAIClient();

  // Demo fallback when no API key
  if (!ai) {
    return res.status(200).json({
      success: true,
      isDemo: true,
      questions: [
        { id: "demo_q1", text: "Question 1 (mode démo — configurez GEMINI_API_KEY)", pageIndex: 0, x: 10, y: 28 },
        { id: "demo_q2", text: "Question 2 (mode démo)", pageIndex: 0, x: 10, y: 48 },
        { id: "demo_q3", text: "Question 3 (mode démo)", pageIndex: 0, x: 10, y: 68 },
      ],
    });
  }

  try {
    const contentParts: any[] = [];
    const pageCount = Math.min(pdfPagesBase64.length, 6);

    // Send all pages to Gemini for complete detection
    for (let i = 0; i < pageCount; i++) {
      const pageData = pdfPagesBase64[i];
      if (pageData && pageData.includes("base64,")) {
        const b64 = pageData.split("base64,")[1];
        const mime = (pageData.split(";")[0].split(":")[1] || "image/png") as any;
        contentParts.push({ inlineData: { data: b64, mimeType: mime } });
      }
    }

    contentParts.push({
      text:
        `Tu es un expert en analyse de documents scolaires.\n` +
        `Analyse ces ${pageCount} image(s) d'évaluation scolaire.\n` +
        `Détecte TOUTES les questions auxquelles l'élève doit écrire une réponse.\n\n` +
        `Pour chaque question/zone de réponse, fournis:\n` +
        `- id: identifiant unique court (ex: "q1", "q2a", "ex3_q2")\n` +
        `- text: texte COMPLET de la question telle qu'elle apparaît dans le document\n` +
        `- pageIndex: index de la page (0 = première image)\n` +
        `- x: position horizontale en pourcentage (0-100) du bord gauche de la page\n` +
        `- y: position verticale en pourcentage (0-100) du haut de la page — PLACE LA RÉPONSE SOUS LA QUESTION (ajoute 5-8% par rapport à la position de la question)\n\n` +
        `RÈGLES IMPORTANTES:\n` +
        `- Inclure UNIQUEMENT les zones où l'élève doit écrire (lignes vides, cases de réponse)\n` +
        `- Placer y APRÈS la question (sur les lignes vides prévues)\n` +
        `- Ignorer: titres, consignes générales, en-têtes, noms/prénoms\n` +
        `- Inclure les sous-questions (a), b), c) séparément\n` +
        `- Maximum 15 questions\n` +
        `Retourne un JSON {"questions": [...]}`,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentParts,
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
                  id: { type: Type.STRING },
                  text: { type: Type.STRING },
                  pageIndex: { type: Type.NUMBER },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                },
                required: ["id", "text", "pageIndex", "x", "y"],
              },
            },
          },
          required: ["questions"],
        },
      },
    });

    if (!response.text) {
      return res.status(500).json({ success: false, error: "Réponse vide de Gemini." });
    }

    const parsed = JSON.parse(response.text.trim());
    return res.status(200).json({ success: true, questions: parsed.questions || [] });
  } catch (err: any) {
    console.error("detect-questions error:", err);
    return res.status(500).json({ success: false, error: `Erreur Gemini: ${err.message}` });
  }
}
