/**
 * /api/generate-comments — Generates teacher correction comments
 * Speed: tries Groq first (1-3s, free, 14 400 req/day), falls back to Gemini.
 */
import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";

// ── Inline key rotation (Vercel cannot import from sibling api/ files) ────────
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (const name of ["GEMINI_API_KEY_1","GEMINI_API_KEY_2","GEMINI_API_KEY_3","GEMINI_API_KEY_4","GEMINI_API_KEY","GEMINI_KEY"]) {
    const v = process.env[name];
    if (v && v !== "MY_GEMINI_API_KEY" && v.length > 10) keys.push(v);
  }
  return [...new Set(keys)];
}

function getGroqKeys(): string[] {
  const keys: string[] = [];
  for (const n of ["GROQ_API_KEY_1","GROQ_API_KEY_2","GROQ_API_KEY_3","GROQ_API_KEY_4","GROQ_API_KEY_5","GROQ_API_KEY"]) {
    const v = process.env[n]; if (v && v.trim().length > 10) keys.push(v.trim());
  }
  return [...new Set(keys)];
}

async function groqChatComments(apiKey: string, model: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model, temperature: 0.5, max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const timer = setTimeout(() => reject(new Error("Groq timeout")), 18_000);
    const req = https.request(
      { hostname: "api.groq.com", path: "/openai/v1/chat/completions", method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let data = ""; res.on("data", (c: Buffer) => { data += c.toString(); });
        res.on("end", () => {
          clearTimeout(timer);
          try { const j = JSON.parse(data); if (j.error) { reject(new Error(j.error.message)); return; } resolve(j.choices?.[0]?.message?.content ?? ""); }
          catch { reject(new Error("Groq parse error")); }
        });
      }
    );
    req.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    req.write(body); req.end();
  });
}
function isQuota(err: any): boolean {
  const msg = String(err?.message || err?.status || err || "").toLowerCase();
  return (
    msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") ||
    msg.includes("rate limit") || msg.includes("too many requests") ||
    msg.includes("503") || msg.includes("unavailable") || msg.includes("high demand") ||
    msg.includes("overloaded") || msg.includes("spike") ||
    err?.status === 429 || err?.status === 503
  );
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

const TEACHER_STYLE: Record<string, Record<string, string>> = {
  fr: {
    "1-2": "Professeur sévère: 'Faux!', 'Incomplet', 'À revoir', 'Manque de détails', 'Erreur de calcul', X.",
    "3-4": "Professeur normal: 'Peut mieux faire', 'Incomplet', 'Bien mais...', 'Revoir la formule'.",
    "5-6": "Professeur bienveillant: 'Bien!', 'Correct', 'Bonne approche', 'Ajouter les unités', ✓.",
    "7-8": "Professeur très satisfait: 'Excellent!', 'Parfait', 'Très bien développé', 'Bravo', ✓✓.",
  },
  en: {
    "1-2": "Strict teacher: 'Wrong!', 'Incomplete', 'Redo this', 'Missing details', 'Calculation error', X.",
    "3-4": "Normal teacher: 'Could do better', 'Incomplete', 'Good but...', 'Review the formula'.",
    "5-6": "Supportive teacher: 'Good!', 'Correct', 'Good approach', 'Add units', ✓.",
    "7-8": "Very satisfied teacher: 'Excellent!', 'Perfect', 'Very well developed', 'Bravo', ✓✓.",
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ success: false, error: "Méthode non autorisée." });

  const { questions, answers, criteriaLevel, studentName, lang: rawLang } = req.body || {};
  if (!questions || !answers) {
    return res.status(400).json({ success: false, error: "Questions et réponses requises." });
  }

  const level = String(criteriaLevel || "5-6");
  const lang_ = String(rawLang || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
  const teacherStyleMap = TEACHER_STYLE[lang_] || TEACHER_STYLE["fr"];
  const teacherStyle = teacherStyleMap[level] || teacherStyleMap["5-6"];

  const geminiKeys = getGeminiKeys();
  const groqKeys   = getGroqKeys();

  if (!geminiKeys.length && !groqKeys.length) {
    return res.status(200).json({ success: true, comments: buildFallbackComments(questions, answers, level, lang_), offline: true });
  }

  const qa = (questions as any[]).map((q: any) => ({
    id: q.id, question: q.text, answer: answers[q.id] || "(pas de réponse)",
  }));
  const isEn = lang_ === "en";

  const buildPromptText = () => isEn
    ? `You are an English teacher marking the work of "${studentName || "the student"}". Level: ${level}/8. Style: ${teacherStyle}\n\nFor each question/answer, generate ONE short teacher comment (2-8 words max), in natural English.\nSometimes just a symbol (✓ or X or ?).\n\n` +
      qa.map((q: any, i: number) => `Q${i+1} [${q.id}]: "${q.question}"\nAnswer: "${q.answer}"`).join("\n\n") +
      `\n\nReturn a JSON object with a "comments" array. Each item: {id, text, position} where position is "right"|"above"|"below"|"margin".`
    : `Tu es un professeur français qui corrige le devoir de "${studentName || "l'élève"}".\nNiveau: ${level}/8. Style: ${teacherStyle}\n\nPour chaque question/réponse, génère UN commentaire court (2-8 mots max), en français naturel d'enseignant.\nParfois juste un symbole (✓ ou X ou ?).\n\n` +
      qa.map((q: any, i: number) => `Q${i+1} [${q.id}]: "${q.question}"\nRéponse: "${q.answer}"`).join("\n\n") +
      `\n\nRetourne un objet JSON avec un tableau "comments". Chaque item: {id, text, position} où position est "right"|"above"|"below"|"margin".`;

  // ── Pass 0: Groq (ultra-fast, 1-3s, free) ─────────────────────────────────
  if (groqKeys.length) {
    const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768"];
    for (const key of groqKeys) {
      for (const model of GROQ_MODELS) {
        try {
          const raw = await groqChatComments(key, model, buildPromptText());
          if (raw && raw.length > 5) {
            let parsed: any = {};
            try { parsed = JSON.parse(raw.trim()); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
            if (parsed?.comments?.length) {
              const map: Record<string, { text: string; symbol?: string; position: string }> = {};
              for (const c of parsed.comments) map[c.id] = { text: c.text, symbol: c.symbol, position: c.position || "right" };
              console.log(`[generate-comments] ✅ Groq ${model}: ${parsed.comments.length} commentaires`);
              return res.status(200).json({ success: true, comments: map });
            }
          }
        } catch (e: unknown) {
          const msg = ((e as Error)?.message ?? "").toLowerCase();
          if (msg.includes("rate") || msg.includes("429") || msg.includes("quota") || msg.includes("limit")) continue;
          console.warn("[generate-comments] Groq error:", msg.slice(0, 80));
        }
      }
    }
    console.warn("[generate-comments] Groq épuisé → fallback Gemini");
  }

  if (!geminiKeys.length) {
    return res.status(200).json({ success: true, comments: buildFallbackComments(questions, answers, level, lang_), offline: true });
  }

  try {
    const rawText = await withKeys(async (ai) => {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ text: buildPromptText() }],
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
    return res.status(200).json({ success: true, comments: buildFallbackComments(questions, answers, level, lang_), offline: true });
  }
}

function buildFallbackComments(
  questions: any[],
  answers: Record<string, string>,
  level: string,
  lang = "fr"
): Record<string, { text: string; symbol?: string; position: string; style?: string }> {
  const byLevel: Record<string, Record<string, string[]>> = {
    fr: {
      "1-2": ["Faux!", "À revoir", "Incomplet", "Erreur!", "?", "Non"],
      "3-4": ["Peut mieux faire", "Incomplet", "Revoir", "Bien mais...", "?"],
      "5-6": ["Bien!", "Correct ✓", "Bonne approche", "Ok", "✓"],
      "7-8": ["Excellent!", "Parfait ✓", "Très bien", "Bravo!", "✓✓"],
    },
    en: {
      "1-2": ["Wrong!", "Redo this", "Incomplete", "Error!", "?", "No"],
      "3-4": ["Could do better", "Incomplete", "Review", "Good but...", "?"],
      "5-6": ["Good!", "Correct ✓", "Good approach", "Ok", "✓"],
      "7-8": ["Excellent!", "Perfect ✓", "Very good", "Bravo!", "✓✓"],
    },
  };
  const langMap = byLevel[lang.startsWith("en") ? "en" : "fr"] || byLevel["fr"];
  const texts = langMap[level] || langMap["5-6"];
  const positions = ["right", "above", "margin", "below"];
  const result: Record<string, { text: string; position: string }> = {};
  (questions as any[]).forEach((q: any, i: number) => {
    if (answers[q.id]) {
      result[q.id] = { text: texts[i % texts.length], position: positions[i % positions.length] };
    }
  });
  return result;
}
