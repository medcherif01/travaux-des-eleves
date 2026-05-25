/**
 * /api/generate-teacher-note
 * Generates a context-aware teacher evaluation comment.
 * Uses page 1 image (grading grid) + student answers as context.
 * Detects language from the document and responds in the same language.
 */

import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (const name of [
    "GEMINI_API_KEY_1","GEMINI_API_KEY_2","GEMINI_API_KEY_3","GEMINI_API_KEY_4",
    "GEMINI_API_KEY_5","GEMINI_API_KEY_6","GEMINI_API_KEY_7","GEMINI_API_KEY_8",
    "GEMINI_API_KEY_9","GEMINI_API_KEY_10","GEMINI_API_KEY","GEMINI_KEY",
  ]) {
    const v = process.env[name];
    if (v && v !== "MY_GEMINI_API_KEY" && v.trim().length > 10) keys.push(v.trim());
  }
  return [...new Set(keys)];
}

function isRetryable(err: unknown): boolean {
  const msg = String(
    (err as Record<string, unknown>)?.message ||
    (err as Record<string, unknown>)?.status ||
    err || ""
  ).toLowerCase();
  return (
    msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") ||
    msg.includes("rate limit") || msg.includes("too many requests") ||
    msg.includes("503") || msg.includes("unavailable") || msg.includes("high demand") ||
    msg.includes("overloaded") || msg.includes("spike") || msg.includes("service unavailable") ||
    (err as Record<string, unknown>)?.status === 429 ||
    (err as Record<string, unknown>)?.status === 503
  );
}

const MAX_ROUNDS = 4;

async function withKeys<T>(fn: (ai: GoogleGenAI, round: number) => Promise<T>): Promise<T> {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error("No Gemini keys configured.");
  let lastError: unknown;
  const total = keys.length * MAX_ROUNDS;
  for (let attempt = 0; attempt < total; attempt++) {
    const i = attempt % keys.length;
    const round = Math.floor(attempt / keys.length) + 1;
    const ai = new GoogleGenAI({ apiKey: keys[i], httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
    try {
      return await fn(ai, round);
    } catch (e: unknown) {
      if (isRetryable(e)) {
        lastError = e;
        const is503 = String((e as Record<string,unknown>)?.message || "").toLowerCase().includes("503");
        if (i === keys.length - 1 && round < MAX_ROUNDS) {
          await new Promise(r => setTimeout(r, is503 ? 3000 * round : 1500 * round));
        }
        continue;
      }
      throw e;
    }
  }
  throw new Error(`All keys exhausted. Last: ${(lastError as Record<string,unknown>)?.message ?? lastError}`);
}

const LEVEL_LABELS: Record<string, Record<string, string>> = {
  fr: {
    "1-2": "LIMITÉ (1-2/8)",
    "3-4": "RUDIMENTAIRE (3-4/8)",
    "5-6": "SATISFAISANT (5-6/8)",
    "7-8": "EXCELLENT (7-8/8)",
  },
  en: {
    "1-2": "LIMITED (1-2/8)",
    "3-4": "BASIC (3-4/8)",
    "5-6": "SATISFACTORY (5-6/8)",
    "7-8": "EXCELLENT (7-8/8)",
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });

  const {
    studentName,
    criteriaLevel,
    answers,     // Record<questionId, answerText>
    questions,   // array of {id, text}
    page1Base64, // base64 of page 1 (grading grid)
    lang,        // "fr" | "en" | undefined
  } = req.body || {};

  const name   = String(studentName || "Élève").trim() || "Élève";
  const level  = String(criteriaLevel || "5-6");
  const lang_  = String(lang || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
  const ansMap = (typeof answers === "object" && answers) ? answers as Record<string, string> : {};
  const qArr   = Array.isArray(questions) ? questions as Array<{id: string; text: string}> : [];

  // Build the answers summary
  const answerLines = qArr
    .filter(q => ansMap[q.id] && String(ansMap[q.id]).trim())
    .map(q => `• ${q.text}\n  → ${ansMap[q.id]}`)
    .join("\n\n");

  const levelLabel = (LEVEL_LABELS[lang_] || LEVEL_LABELS["fr"])[level] || level;

  const prompt = lang_ === "en"
    ? `You are a professional and encouraging teacher. Write an evaluation comment of 2-3 sentences for student "${name}" who achieved level ${levelLabel}.\n\n` +
      (answerLines ? `The student's answers:\n${answerLines}\n\n` : "") +
      (page1Base64 ? `Refer to the grading grid visible in the image (page 1) to justify this level. ` : "") +
      `Be specific, pedagogical, and encouraging. Plain text only, no markdown, no bullet points.`
    : `Tu es un enseignant bienveillant et précis. Rédige un commentaire d'évaluation de 2-3 phrases pour l'élève "${name}" qui a obtenu le niveau ${levelLabel}.\n\n` +
      (answerLines ? `Réponses de l'élève :\n${answerLines}\n\n` : "") +
      (page1Base64 ? `Appuie-toi sur la grille de notation visible dans l'image (page 1) pour justifier ce niveau. ` : "") +
      `Sois précis, pédagogique et bienveillant. Texte brut uniquement, sans markdown ni puces.`;

  // Build content parts — add page 1 image if available
  const parts: unknown[] = [];
  if (page1Base64 && String(page1Base64).includes("base64,")) {
    const b64  = String(page1Base64).split("base64,")[1];
    const mime = (String(page1Base64).split(";")[0].split(":")[1] || "image/png") as string;
    parts.push({ inlineData: { data: b64, mimeType: mime } });
  }
  parts.push({ text: prompt });

  // Demo mode (no keys)
  const keys = getGeminiKeys();
  if (!keys.length) {
    const demo = lang_ === "en"
      ? `${name} demonstrates a ${levelLabel} level of understanding. Their answers show good effort and engagement with the material. Keep up the good work!`
      : `${name} démontre un niveau ${levelLabel} de compréhension. Ses réponses témoignent d'un bon effort et d'une bonne implication. Continuez ainsi !`;
    return res.status(200).json({ success: true, text: demo, isDemo: true });
  }

  try {
    const text = await withKeys(async (ai, round) => {
      const model = round >= 3 ? "gemini-1.5-flash" : "gemini-2.5-flash";
      const response = await ai.models.generateContent({
        model,
        contents: parts as any[],
      });
      return (response.text ?? "").trim();
    });

    if (!text || text.length < 10) {
      return res.status(500).json({ success: false, error: "Gemini returned empty comment." });
    }

    // Strip any accidental markdown
    const clean = text.replace(/^#{1,3}\s*/gm, "").replace(/\*\*/g, "").replace(/\*/g, "").trim();
    return res.status(200).json({ success: true, text: clean });

  } catch (err: unknown) {
    console.error("[generate-teacher-note] Error:", (err as Record<string,unknown>)?.message ?? err);
    return res.status(500).json({
      success: false,
      error: `Gemini error: ${(err as Record<string,unknown>)?.message ?? String(err)}`,
    });
  }
}
