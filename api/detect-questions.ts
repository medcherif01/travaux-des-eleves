import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function getAI() {
  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || "";
  if (!key || key === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({ apiKey: key, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
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
        { id: "demo_q1", text: "Question 1 (mode démo — configurez GEMINI_API_KEY)", pageIndex: 0, x: 8, y: 32, maxWidth: 82 },
        { id: "demo_q2", text: "Question 2 (mode démo)", pageIndex: 0, x: 8, y: 52, maxWidth: 82 },
        { id: "demo_q3", text: "Question 3 (mode démo)", pageIndex: 0, x: 8, y: 72, maxWidth: 82 },
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

    parts.push({
      text:
        `Tu es expert en analyse de documents scolaires. Analyse ces ${count} page(s) d'évaluation.\n\n` +

        `OBJECTIF: Trouver TOUTES les zones où l'élève doit écrire une réponse (lignes pointillées, espaces vides, cases "Réponse :", "Calcul :", etc.)\n\n` +

        `Pour chaque zone de réponse, retourne:\n` +
        `- id: identifiant unique (ex: "q1", "q1a", "q2b") — DOIT correspondre à la vraie question\n` +
        `- text: texte COMPLET de la question/consigne\n` +
        `- pageIndex: numéro de page (0 = première page)\n` +
        `- x: position horizontale % (0-100) du DÉBUT de la zone de réponse (généralement 8-15 pour ligne à gauche)\n` +
        `- y: position verticale % (0-100) de LA PREMIÈRE LIGNE VIDE où écrire — PAS le texte de la question, mais la ligne pointillée ou l'espace blanc APRÈS\n` +
        `   EXEMPLES: si "Réponse :" est à y=35%, mettre y=35. Si lignes pointillées commencent à 40%, mettre y=40\n` +
        `- maxWidth: largeur max en % (généralement 75-85)\n\n` +

        `RÈGLES IMPORTANTES:\n` +
        `1. Ignorer titres, objectifs, critères, en-têtes\n` +
        `2. Inclure sous-questions (1a, 1b, 2a...)\n` +
        `3. y doit pointer sur LA ZONE D'ÉCRITURE, pas le texte de la question\n` +
        `4. Si plusieurs lignes de réponse, pointer sur la première\n` +
        `5. Max 20 questions par page\n\n` +

        `Retourne JSON strict: {"questions": [...]}`,
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
                  maxWidth:  { type: Type.NUMBER },
                },
                required: ["id", "text", "pageIndex", "x", "y"],
              },
            },
          },
          required: ["questions"],
        },
      },
    });

    if (!response.text) return res.status(500).json({ success: false, error: "Réponse vide." });
    const parsed = JSON.parse(response.text.trim());
    const questions = (parsed.questions || []).map((q: any) => ({
      ...q,
      x:        Math.max(1,  Math.min(40,  Number(q.x)        || 8)),
      y:        Math.max(5,  Math.min(95,  Number(q.y)        || 30)),
      maxWidth: Math.max(40, Math.min(90,  Number(q.maxWidth) || 82)),
    }));
    return res.status(200).json({ success: true, questions });
  } catch (err: any) {
    console.error("detect-questions:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
