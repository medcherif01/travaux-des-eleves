/**
 * /api/generate-comments — Generates teacher correction comments
 */
import { GoogleGenAI, Type } from "@google/genai";
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

const TEACHER_STYLE: Record<string, string> = {
  "1-2": "Professeur sévère: 'Faux!', 'Incomplet', 'À revoir', 'Manque de détails', 'Erreur de calcul', X.",
  "3-4": "Professeur normal: 'Peut mieux faire', 'Incomplet', 'Bien mais...', 'Revoir la formule'.",
  "5-6": "Professeur bienveillant: 'Bien!', 'Correct', 'Bonne approche', 'Ajouter les unités', ✓.",
  "7-8": "Professeur très satisfait: 'Excellent!', 'Parfait', 'Très bien développé', 'Bravo', ✓✓.",
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

  const level = String(criteriaLevel || "5-6");
  const teacherStyle = TEACHER_STYLE[level] || TEACHER_STYLE["5-6"];

  if (!getGeminiKeys().length) {
    return res.status(200).json({ success: true, comments: buildFallbackComments(questions, answers, level), offline: true });
  }

  try {
    const qa = (questions as any[]).map((q: any) => ({
      id: q.id, question: q.text, answer: answers[q.id] || "(pas de réponse)",
    }));

    const rawText = await withKeys(async (ai) => {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          text:
            `Tu es un professeur français qui corrige le devoir de "${studentName || "l'élève"}".\n` +
            `Niveau: ${level}/8. Style: ${teacherStyle}\n\n` +
            `Pour chaque question/réponse, génère UN commentaire court (2-8 mots max), en français naturel d'enseignant.\n` +
            `Parfois juste un symbole (✓ ou X ou ?).\n\n` +
            qa.map((q: any, i: number) => `Q${i+1} [${q.id}]: "${q.question}"\nRéponse: "${q.answer}"`).join("\n\n") +
            `\n\nRetourne JSON avec commentaire et position pour chaque question.`,
        }],
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
                    position: { type: Type.STRING },
                    style:    { type: Type.STRING },
                  },
                  required: ["id", "text", "position"],
                },
              },
            },
            required: ["comments"],
          },
        },
      });
      return response.text || "";
    });

    let parsed: any = { comments: [] };
    if (rawText) {
      try {
        const clean = rawText.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
        parsed = JSON.parse(clean);
      } catch {
        const m = rawText.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { /* keep empty */ } }
      }
    }

    const commentsMap: Record<string, { text: string; symbol?: string; position: string; style?: string }> = {};
    for (const c of (parsed.comments || [])) {
      commentsMap[c.id] = { text: c.text, symbol: c.symbol, position: c.position || "right", style: c.style };
    }

    return res.status(200).json({ success: true, comments: commentsMap });
  } catch (err: any) {
    console.error("generate-comments:", err.message);
    return res.status(200).json({ success: true, comments: buildFallbackComments(questions, answers, level), offline: true });
  }
}

function buildFallbackComments(
  questions: any[],
  answers: Record<string, string>,
  level: string
): Record<string, { text: string; symbol?: string; position: string; style?: string }> {
  const byLevel: Record<string, string[]> = {
    "1-2": ["Faux!", "À revoir", "Incomplet", "Erreur!", "?", "Non"],
    "3-4": ["Peut mieux faire", "Incomplet", "Revoir", "Bien mais...", "?"],
    "5-6": ["Bien!", "Correct ✓", "Bonne approche", "Ok", "✓"],
    "7-8": ["Excellent!", "Parfait ✓", "Très bien", "Bravo!", "✓✓"],
  };
  const texts = byLevel[level] || byLevel["5-6"];
  const positions = ["right", "above", "margin", "below"];
  const result: Record<string, { text: string; position: string }> = {};
  (questions as any[]).forEach((q: any, i: number) => {
    if (answers[q.id]) {
      result[q.id] = { text: texts[i % texts.length], position: positions[i % positions.length] };
    }
  });
  return result;
}
