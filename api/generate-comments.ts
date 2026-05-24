/**
 * /api/generate-comments — Generates teacher correction comments in red
 * for each student answer. Comments are realistic, grade-level appropriate,
 * written in the style of a French teacher marking student work.
 */
import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function getAI() {
  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || "";
  if (!key || key === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({ apiKey: key, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
}

const TEACHER_STYLE: Record<string, string> = {
  "1-2": "Professeur sévère, beaucoup d'erreurs à corriger. Commentaires courts et directs : 'Faux!', 'Incomplet', 'À revoir', 'Manque de détails', 'Erreur de calcul', éventuellement un point d'interrogation ou un signe X.",
  "3-4": "Professeur normal. Quelques corrections : 'Peut mieux faire', 'Incomplet', 'Bien mais...', 'Revoir la formule', parfois une accolade ou flèche.",
  "5-6": "Professeur bienveillant. Commentaires positifs avec quelques remarques : 'Bien!', 'Correct', 'Bonne approche', 'Ajouter les unités', étoile ou coche.",
  "7-8": "Professeur très satisfait. Commentaires élogieux : 'Excellent!', 'Parfait', 'Très bien développé', 'Bravo', étoile ou double coche.",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ success: false, error: "Méthode non autorisée." });

  const { questions, answers, criteriaLevel, studentName } = req.body || {};
  if (!questions || !answers) {
    return res.status(400).json({ success: false, error: "Questions et réponses requises." });
  }

  const ai = getAI();
  const level = String(criteriaLevel || "5-6");
  const teacherStyle = TEACHER_STYLE[level] || TEACHER_STYLE["5-6"];

  // Build fallback comments locally if no AI
  if (!ai) {
    const fallbackComments = buildFallbackComments(questions, answers, level);
    return res.status(200).json({ success: true, comments: fallbackComments, offline: true });
  }

  try {
    // Build the question+answer pairs for Gemini
    const qa = (questions as any[]).map((q: any) => ({
      id: q.id,
      question: q.text,
      answer: answers[q.id] || "(pas de réponse)",
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          text:
            `Tu es un professeur de mathématiques/sciences français qui corrige le devoir de "${studentName || "l'élève"}".\n` +
            `Niveau de l'élève : ${level}/8\n` +
            `Style de correction : ${teacherStyle}\n\n` +
            `Pour chaque question/réponse ci-dessous, génère UN commentaire de correcteur manuscrit réaliste.\n` +
            `Le commentaire doit :\n` +
            `- Être COURT (2-8 mots maximum)\n` +
            `- Être en français, style naturel d'enseignant\n` +
            `- Être cohérent avec la qualité de la réponse donnée\n` +
            `- Parfois inclure des symboles : ✓ ✗ ? ! / etc.\n` +
            `- Parfois juste un symbole sans texte (✓ ou X ou ?)\n\n` +
            `Questions et réponses :\n` +
            qa.map((q: any, i: number) => `Q${i + 1} [${q.id}]: "${q.question}"\nRéponse: "${q.answer}"`).join("\n\n") +
            `\n\nRetourne un JSON avec pour chaque question son commentaire et sa position relative.`,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            comments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id:       { type: Type.STRING },
                  text:     { type: Type.STRING },
                  symbol:   { type: Type.STRING },
                  position: { type: Type.STRING }, // "above", "right", "below", "margin"
                  style:    { type: Type.STRING }, // "check", "cross", "circle", "underline", "arrow"
                },
                required: ["id", "text", "position"],
              },
            },
          },
          required: ["comments"],
        },
      },
    });

    const parsed = response.text ? JSON.parse(response.text.trim()) : { comments: [] };
    const commentsMap: Record<string, { text: string; symbol?: string; position: string; style?: string }> = {};
    for (const c of (parsed.comments || [])) {
      commentsMap[c.id] = { text: c.text, symbol: c.symbol, position: c.position || "right", style: c.style };
    }

    return res.status(200).json({ success: true, comments: commentsMap });
  } catch (err: any) {
    console.error("generate-comments:", err.message);
    const fallbackComments = buildFallbackComments(questions, answers, level);
    return res.status(200).json({ success: true, comments: fallbackComments, offline: true });
  }
}

function buildFallbackComments(
  questions: any[],
  answers: Record<string, string>,
  level: string
): Record<string, { text: string; symbol?: string; position: string; style?: string }> {
  const byLevel: Record<string, string[]> = {
    "1-2": ["Faux!", "À revoir", "Incomplet", "Erreur!", "?", "Non", "Revoir"],
    "3-4": ["Peut mieux faire", "Incomplet", "Revoir", "Bien mais...", "?", "Incomplet"],
    "5-6": ["Bien!", "Correct ✓", "Bonne approche", "Ok", "✓", "Bien vu"],
    "7-8": ["Excellent!", "Parfait ✓", "Très bien", "Bravo!", "✓✓", "Excellent travail"],
  };
  const texts = byLevel[level] || byLevel["5-6"];
  const positions = ["right", "above", "margin", "below"];
  const result: Record<string, { text: string; position: string }> = {};
  (questions as any[]).forEach((q: any, i: number) => {
    if (answers[q.id]) {
      result[q.id] = {
        text: texts[i % texts.length],
        position: positions[i % positions.length],
      };
    }
  });
  return result;
}
