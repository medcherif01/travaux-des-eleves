/**
 * nanobanana PRO — /api/generate-answers
 * Vercel serverless function
 *
 * Architecture:
 *   Pass 1 — structured JSON via responseSchema (fastest, most reliable)
 *   Pass 2 — plain-text prompt asking for JSON (no schema → Gemini free to fill keys)
 *   Pass 3 — per-question plain-text calls (nuclear fallback)
 *
 * Both passes rotate through all available Gemini API keys on quota errors.
 * NEVER returns { success: true, answers: {} } — always validates before responding.
 */

import { GoogleGenAI, Type } from "@google/genai";
import mongoose from "mongoose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  text: string;
  pageIndex: number;
  x: number;
  y: number;
  maxWidth?: number;
}

// ── Gemini key rotation ───────────────────────────────────────────────────────

function getGeminiKeys(): string[] {
  const names = [
    "GEMINI_API_KEY_1", "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3", "GEMINI_API_KEY_4",
    "GEMINI_API_KEY",   "GEMINI_KEY",
  ];
  const keys: string[] = [];
  for (const name of names) {
    const v = process.env[name];
    if (v && v !== "MY_GEMINI_API_KEY" && v.trim().length > 10) keys.push(v.trim());
  }
  return [...new Set(keys)];
}

function isQuotaError(err: unknown): boolean {
  const msg = String(
    (err as Record<string, unknown>)?.message ||
    (err as Record<string, unknown>)?.status ||
    err || ""
  ).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    (err as Record<string, unknown>)?.status === 429
  );
}

/** Run fn with each key until one succeeds; throws if all are quota-exhausted */
async function withKeys<T>(
  fn: (ai: GoogleGenAI, keyIndex: number) => Promise<T>,
  label = ""
): Promise<T> {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error("Aucune clé Gemini configurée (GEMINI_API_KEY_1…).");

  let lastError: unknown;
  for (let i = 0; i < keys.length; i++) {
    const ai = new GoogleGenAI({
      apiKey: keys[i],
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    try {
      const result = await fn(ai, i);
      if (i > 0) console.log(`[${label}] Clé #${i + 1} a réussi`);
      return result;
    } catch (e: unknown) {
      if (isQuotaError(e)) {
        console.warn(`[${label}] Clé #${i + 1} quota épuisé → essai clé suivante`);
        lastError = e;
        continue;
      }
      // Non-quota error → rethrow immediately
      throw e;
    }
  }
  throw new Error(
    `Toutes les clés Gemini sont épuisées (quota). Dernière erreur: ${
      (lastError as Record<string, unknown>)?.message ?? String(lastError)
    }`
  );
}

// ── JSON parsing utilities ────────────────────────────────────────────────────

/** Strip markdown fences and extract the outermost JSON object. Never throws. */
function safeExtractJson(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== "string") return null;

  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  s = s.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "");

  // Find outermost { }
  const start = s.indexOf("{");
  const end   = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    // Try to salvage by removing trailing commas
    const fixed = candidate.replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(fixed) as Record<string, unknown>; }
    catch { return null; }
  }
}

/** Flatten any value to a non-empty string, or null if nothing usable */
function flattenToString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map(flattenToString).filter(Boolean);
    return parts.length ? parts.join(" ") : null;
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const key of ["answer", "text", "response", "content", "réponse", "value"]) {
      const s = flattenToString(obj[key]);
      if (s) return s;
    }
    const parts = Object.values(obj).map(flattenToString).filter(Boolean);
    return parts.length ? (parts as string[]).join(" ") : null;
  }
  return null;
}

// ── 4-tier answer ↔ question mapping ─────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_\-\.]/g, "");
}
function numericSuffix(s: string): string {
  return s.replace(/\D/g, "");
}

function mapAnswersToQuestions(
  rawAnswers: Record<string, unknown>,
  questions: Question[]
): Record<string, string> {
  console.log("[map] Raw keys:", Object.keys(rawAnswers));
  console.log("[map] Question IDs:", questions.map(q => q.id));

  const used = new Set<string>();
  const result: Record<string, string> = {};

  for (const q of questions) {
    // Tier 1: exact match
    if (q.id in rawAnswers && !used.has(q.id)) {
      const s = flattenToString(rawAnswers[q.id]);
      if (s) { result[q.id] = s; used.add(q.id); continue; }
    }

    // Tier 2: case-insensitive
    const t2 = Object.keys(rawAnswers).find(
      k => !used.has(k) && k.toLowerCase() === q.id.toLowerCase()
    );
    if (t2) {
      const s = flattenToString(rawAnswers[t2]);
      if (s) { result[q.id] = s; used.add(t2); continue; }
    }

    // Tier 3: normalise symbols (q_1 == q1 == q-1 == q.1)
    const qNorm = normalizeKey(q.id);
    const t3 = Object.keys(rawAnswers).find(
      k => !used.has(k) && normalizeKey(k) === qNorm
    );
    if (t3) {
      const s = flattenToString(rawAnswers[t3]);
      if (s) { result[q.id] = s; used.add(t3); continue; }
    }

    // Tier 3b: numeric suffix only (q1 ~ question_1, both → "1")
    const qNum = numericSuffix(q.id);
    if (qNum) {
      const t3b = Object.keys(rawAnswers).find(
        k => !used.has(k) && numericSuffix(k) === qNum
      );
      if (t3b) {
        const s = flattenToString(rawAnswers[t3b]);
        if (s) { result[q.id] = s; used.add(t3b); continue; }
      }
    }
  }

  // Tier 4: positional — assign remaining unclaimed values in order
  const unmappedQs    = questions.filter(q => !(q.id in result));
  const unmappedVals  = Object.entries(rawAnswers)
    .filter(([k]) => !used.has(k))
    .map(([, v]) => flattenToString(v))
    .filter((s): s is string => s !== null);

  unmappedQs.forEach((q, i) => {
    if (unmappedVals[i]) {
      result[q.id] = unmappedVals[i];
      console.log(`[map] Tier-4 positional: ${q.id} ← index ${i}`);
    }
  });

  console.log(`[map] Result: ${Object.keys(result).length}/${questions.length} answers mapped`);
  return result;
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Returns the number of genuinely non-empty answers */
function countValid(answers: Record<string, string>): number {
  return Object.values(answers).filter(v => typeof v === "string" && v.trim().length > 0).length;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

const LEVEL_DESC: Record<string, string> = {
  "1-2": "Niveau LIMITÉ (1-2/8): Réponses très courtes, quelques erreurs, vocabulaire basique.",
  "3-4": "Niveau RUDIMENTAIRE (3-4/8): Réponses correctes mais incomplètes, manque de rigueur.",
  "5-6": "Niveau SATISFAISANT (5-6/8): Réponses précises, calculs corrects, termes scientifiques.",
  "7-8": "Niveau EXCELLENT (7-8/8): Justifications complètes, calculs détaillés, analyse critique.",
};

function buildPromptParts(
  questions: Question[],
  name: string,
  seed: number,
  level: string,
  pdfPagesBase64: string[]
): unknown[] {
  const parts: unknown[] = [];

  // Attach up to 4 PDF page images as context
  for (let i = 0; i < Math.min(pdfPagesBase64.length, 4); i++) {
    const pg = String(pdfPagesBase64[i] || "");
    if (!pg.includes("base64,")) continue;
    parts.push({
      inlineData: {
        data: pg.split("base64,")[1],
        mimeType: (pg.split(";")[0].split(":")[1] || "image/png") as string,
      },
    });
  }

  const levelDesc = LEVEL_DESC[level] || LEVEL_DESC["5-6"];
  const ids       = questions.map(q => `"${q.id}"`).join(", ");
  const qLines    = questions
    .map((q, i) => `  [${i + 1}] CLE="${q.id}" | QUESTION: "${q.text}"`)
    .join("\n");

  parts.push({
    text:
      `Tu joues le rôle de l'élève "${name}" (variante ${seed}).\n\n` +
      `${levelDesc}\n\n` +
      `RÈGLES ABSOLUES:\n` +
      `1. Réponses UNIQUES propres à "${name}" (variante ${seed})\n` +
      `2. AUCUN markdown — texte brut uniquement\n` +
      `3. Français uniquement, style naturel d'élève\n` +
      `4. Réponds à TOUTES les ${questions.length} questions\n\n` +
      `QUESTIONS (utilise les CLÉs exactes dans le JSON):\n${qLines}\n\n` +
      `⚠️ CRITIQUE: Dans le JSON retourné, les clés DOIVENT ÊTRE EXACTEMENT: ${ids}\n` +
      `Exemple de format attendu:\n` +
      `{\n  "answers": {\n` +
      questions.slice(0, 2).map(q => `    "${q.id}": "ta réponse ici"`).join(",\n") +
      `\n  }\n}\n\n` +
      `Retourne uniquement ce JSON. Aucun texte avant ou après.`,
  });

  return parts;
}

// ── Pass 1: structured generation with responseSchema ────────────────────────

async function pass1Structured(
  questions: Question[],
  name: string,
  seed: number,
  level: string,
  pdfPagesBase64: string[]
): Promise<Record<string, string> | null> {
  console.log("[Pass-1] Démarrage génération structurée");

  const parts = buildPromptParts(questions, name, seed, level, pdfPagesBase64);

  const rawText = await withKeys(async (ai, ki) => {
    console.log(`[Pass-1] Tentative clé #${ki + 1}`);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: parts as any[],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answers: {
              type: Type.OBJECT,
              description:
                "Un objet où chaque clé est l'identifiant EXACT de la question et la valeur est la réponse complète de l'élève.",
            },
          },
          required: ["answers"],
        },
      },
    });
    const text = response.text ?? "";
    console.log(`[Pass-1] Clé #${ki + 1} — raw length: ${text.length}, preview: ${text.substring(0, 200)}`);
    return text;
  }, "Pass-1");

  if (!rawText || rawText.trim().length < 5) {
    console.warn("[Pass-1] Réponse vide ou trop courte");
    return null;
  }

  const parsed = safeExtractJson(rawText);
  if (!parsed) {
    console.warn("[Pass-1] JSON non parseable:", rawText.substring(0, 300));
    return null;
  }

  console.log("[Pass-1] JSON parsé, clés:", Object.keys(parsed));

  // Extract answers from parsed object
  let rawAnswers: Record<string, unknown> = {};

  if (parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)) {
    rawAnswers = parsed.answers as Record<string, unknown>;
  } else {
    // Gemini sometimes returns root-level keys without the "answers" wrapper
    const knownNonAnswerKeys = new Set(["answers", "success", "error", "questions"]);
    rawAnswers = Object.fromEntries(
      Object.entries(parsed).filter(([k]) => !knownNonAnswerKeys.has(k))
    );
    if (Object.keys(rawAnswers).length > 0) {
      console.warn("[Pass-1] 'answers' wrapper absent — utilisation des clés racines");
    }
  }

  console.log("[Pass-1] rawAnswers keys:", Object.keys(rawAnswers), "count:", Object.keys(rawAnswers).length);

  if (Object.keys(rawAnswers).length === 0) {
    console.warn("[Pass-1] answers objet vide — Pass-1 échoue");
    return null;
  }

  const mapped = mapAnswersToQuestions(rawAnswers, questions);
  if (countValid(mapped) === 0) {
    console.warn("[Pass-1] Mapping a produit 0 réponse valide");
    return null;
  }

  console.log(`[Pass-1] ✅ ${countValid(mapped)}/${questions.length} réponses valides`);
  return mapped;
}

// ── Pass 2: plain-text generation (no schema) ─────────────────────────────────

async function pass2PlainText(
  questions: Question[],
  name: string,
  seed: number,
  level: string,
  pdfPagesBase64: string[]
): Promise<Record<string, string> | null> {
  console.log("[Pass-2] Démarrage génération texte libre (sans schema)");

  const parts = buildPromptParts(questions, name, seed, level, pdfPagesBase64);

  const rawText = await withKeys(async (ai, ki) => {
    console.log(`[Pass-2] Tentative clé #${ki + 1}`);
    // No responseSchema — Gemini generates freely
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: parts as any[],
      config: {
        temperature: 0.7,
      },
    });
    const text = response.text ?? "";
    console.log(`[Pass-2] Clé #${ki + 1} — raw length: ${text.length}, preview: ${text.substring(0, 200)}`);
    return text;
  }, "Pass-2");

  if (!rawText || rawText.trim().length < 5) {
    console.warn("[Pass-2] Réponse vide");
    return null;
  }

  // Try to extract JSON from free-text response
  const parsed = safeExtractJson(rawText);
  if (parsed) {
    console.log("[Pass-2] JSON trouvé dans la réponse libre");
    let rawAnswers: Record<string, unknown> = {};

    if (parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)) {
      rawAnswers = parsed.answers as Record<string, unknown>;
    } else {
      const knownNonAnswerKeys = new Set(["answers", "success", "questions"]);
      rawAnswers = Object.fromEntries(
        Object.entries(parsed).filter(([k]) => !knownNonAnswerKeys.has(k))
      );
    }

    if (Object.keys(rawAnswers).length > 0) {
      const mapped = mapAnswersToQuestions(rawAnswers, questions);
      if (countValid(mapped) > 0) {
        console.log(`[Pass-2] ✅ via JSON: ${countValid(mapped)}/${questions.length} réponses`);
        return mapped;
      }
    }
  }

  // No JSON found — try to parse as plain numbered list / key-value text
  console.warn("[Pass-2] Pas de JSON valide — tentative de parsing texte brut");
  const lines = rawText
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 3);

  const result: Record<string, string> = {};

  // Try "q1: answer" or "1. answer" patterns
  for (const q of questions) {
    for (const line of lines) {
      const patterns = [
        new RegExp(`^${q.id}\\s*[:\\-]\\s*(.+)$`, "i"),
        new RegExp(`^["']?${q.id}["']?\\s*[:\\-]\\s*(.+)$`, "i"),
      ];
      for (const pat of patterns) {
        const m = line.match(pat);
        if (m && m[1].trim().length > 2) {
          result[q.id] = m[1].trim();
          break;
        }
      }
    }
  }

  // Positional fallback: if numbered list matches question count
  if (Object.keys(result).length === 0) {
    const filteredLines = lines.filter(l => !l.match(/^(json|\{|\}|answers|"|{)/i));
    questions.forEach((q, i) => {
      if (filteredLines[i]) {
        // Strip leading "1." "q1:" etc.
        const clean = filteredLines[i].replace(/^[\d]+[.)]\s*/, "").replace(/^[a-z]\d*[.:]\s*/i, "");
        if (clean.length > 3) result[q.id] = clean;
      }
    });
  }

  if (countValid(result) > 0) {
    console.log(`[Pass-2] ✅ via texte brut: ${countValid(result)}/${questions.length} réponses`);
    return result;
  }

  console.warn("[Pass-2] Échec — aucune réponse extraite");
  return null;
}

// ── Pass 3: per-question individual calls (nuclear fallback) ──────────────────

async function pass3PerQuestion(
  questions: Question[],
  name: string,
  seed: number,
  level: string,
  pdfPagesBase64: string[]
): Promise<Record<string, string> | null> {
  console.log("[Pass-3] Démarrage appels par question (fallback nucléaire)");

  const levelDesc = LEVEL_DESC[level] || LEVEL_DESC["5-6"];
  const result: Record<string, string> = {};

  // Only attach first page image for per-question calls (keep payload small)
  const imageParts: unknown[] = [];
  if (pdfPagesBase64.length > 0) {
    const pg = String(pdfPagesBase64[0] || "");
    if (pg.includes("base64,")) {
      imageParts.push({
        inlineData: {
          data: pg.split("base64,")[1],
          mimeType: (pg.split(";")[0].split(":")[1] || "image/png") as string,
        },
      });
    }
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`[Pass-3] Question ${i + 1}/${questions.length}: "${q.id}"`);

    try {
      const text = await withKeys(async (ai, ki) => {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            ...imageParts,
            {
              text:
                `Tu joues le rôle de l'élève "${name}" (variante ${seed}). ${levelDesc}\n` +
                `Réponds UNIQUEMENT à cette question en texte brut (pas de markdown):\n` +
                `"${q.text}"\n` +
                `Réponds comme un vrai élève écrirait à la main. Réponse directe sans préambule.`,
            },
          ] as any[],
        });
        return response.text ?? "";
      }, `Pass-3-q${i + 1}`);

      const clean = text.trim().replace(/^["']|["']$/g, "");
      if (clean.length > 2) {
        result[q.id] = clean;
        console.log(`[Pass-3] ✅ ${q.id}: "${clean.substring(0, 60)}…"`);
      }
    } catch (e: unknown) {
      console.error(`[Pass-3] Échec ${q.id}:`, (e as Record<string, unknown>)?.message ?? e);
    }
  }

  if (countValid(result) > 0) {
    console.log(`[Pass-3] ✅ ${countValid(result)}/${questions.length} réponses`);
    return result;
  }
  return null;
}

// ── MongoDB session ───────────────────────────────────────────────────────────

const SessionSchema = new mongoose.Schema(
  {
    studentName:       { type: String, required: true },
    detectedQuestions: mongoose.Schema.Types.Mixed,
    criteriaLevel:     { type: String, default: "5-6" },
    generatedAnswers:  mongoose.Schema.Types.Mixed,
    variantSeed:       { type: Number, default: 1 },
  },
  { timestamps: true }
);
function getSessionModel() {
  return mongoose.models.EvalSession || mongoose.model("EvalSession", SessionSchema);
}
async function tryConnectDB(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) return true;
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI || "";
  if (!uri) return false;
  try {
    await mongoose.connect(uri, { dbName: "nanobanana", serverSelectionTimeoutMS: 4000 });
    return true;
  } catch {
    return false;
  }
}

// ── Demo mode (no API key) ────────────────────────────────────────────────────

const DEMO_ANSWERS: Record<string, string[]> = {
  "1-2": [
    "Je sais pas trop c'est compliqué",
    "La réponse est environ 135 je crois",
    "C'est beaucoup d'énergie",
    "Je pense que c'est vrai",
    "Ça dépend du contexte",
  ],
  "3-4": [
    "Le coût total est de 135 euros environ",
    "La consommation journalière est autour de 10 kWh",
    "Il faut faire attention à l'énergie électrique",
    "La formule donne un résultat d'environ 45",
    "Les données montrent une augmentation progressive",
  ],
  "5-6": [
    "En appliquant la formule: 900 × 0,15 = 135 €",
    "La consommation moyenne est 900 ÷ 90 = 10 kWh/jour",
    "Les données montrent que la gestion de l'énergie est essentielle pour réduire les coûts",
    "En utilisant E = P × t, on obtient 2 × 3 = 6 kWh",
    "L'analyse montre une relation proportionnelle entre les deux grandeurs",
  ],
  "7-8": [
    "En appliquant rigoureusement C = E × pu = 900 × 0,15 = 135 € auquel s'ajoute l'abonnement de 30 € soit 165 € au total",
    "La consommation journalière moyenne s'établit à 900 ÷ 90 = 10 kWh/j, soit 300 kWh/mois, ce qui est cohérent avec les données fournies",
    "L'analyse critique démontre que la maîtrise de la consommation énergétique est fondamentale tant sur le plan économique qu'environnemental",
    "En appliquant la relation E = P × t = 2 kW × 3 h = 6 kWh, puis le coût C = 6 × 0,15 = 0,90 €",
    "Les deux grandeurs sont proportionnelles: quand l'une double, l'autre double aussi, ce qui confirme la relation linéaire",
  ],
};

function buildDemoAnswers(questions: Question[], level: string, seed: number): Record<string, string> {
  const arr = DEMO_ANSWERS[level] || DEMO_ANSWERS["5-6"];
  const result: Record<string, string> = {};
  questions.forEach((q, i) => {
    result[q.id] = arr[(seed + i) % arr.length];
  });
  return result;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Méthode non autorisée." });
  }

  const {
    questions: rawQuestions,
    criteriaLevel,
    studentName,
    variantSeed,
    pdfPagesBase64,
    saveSession,
  } = req.body || {};

  // ── Input validation ───────────────────────────────────────────────────────
  if (!rawQuestions || !Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return res.status(400).json({ success: false, error: "Questions manquantes ou invalides." });
  }

  const questions: Question[] = rawQuestions.map((q: any) => ({
    id:        String(q.id || ""),
    text:      String(q.text || ""),
    pageIndex: Number(q.pageIndex ?? 0),
    x:         Number(q.x ?? 10),
    y:         Number(q.y ?? 30),
    maxWidth:  Number(q.maxWidth ?? 82),
  })).filter(q => q.id && q.text);

  if (questions.length === 0) {
    return res.status(400).json({ success: false, error: "Aucune question valide après nettoyage." });
  }

  const level = String(criteriaLevel || "5-6");
  const seed  = Math.max(1, Number(variantSeed || 1));
  const name  = String(studentName || "Élève").trim() || "Élève";
  const pages = Array.isArray(pdfPagesBase64) ? pdfPagesBase64.map(String) : [];

  console.log(`\n[generate-answers] START — ${questions.length} questions, élève="${name}", niveau=${level}, seed=${seed}`);
  console.log("[generate-answers] Question IDs:", questions.map(q => q.id));

  // ── Demo mode ──────────────────────────────────────────────────────────────
  const keys = getGeminiKeys();
  if (!keys.length) {
    console.log("[generate-answers] Mode DÉMO (aucune clé API)");
    const answers = buildDemoAnswers(questions, level, seed);
    return res.status(200).json({ success: true, answers, isDemo: true });
  }

  // ── Pass 1: structured JSON via responseSchema ─────────────────────────────
  let answers: Record<string, string> | null = null;

  try {
    answers = await pass1Structured(questions, name, seed, level, pages);
    if (answers && countValid(answers) > 0) {
      console.log(`[generate-answers] Pass-1 réussit: ${countValid(answers)} réponses`);
    } else {
      console.warn("[generate-answers] Pass-1 insuffisant, passage à Pass-2");
      answers = null;
    }
  } catch (e: unknown) {
    console.error("[generate-answers] Pass-1 exception:", (e as Record<string, unknown>)?.message ?? e);
    answers = null;
  }

  // ── Pass 2: plain-text (no schema) ────────────────────────────────────────
  if (!answers) {
    try {
      answers = await pass2PlainText(questions, name, seed, level, pages);
      if (answers && countValid(answers) > 0) {
        console.log(`[generate-answers] Pass-2 réussit: ${countValid(answers)} réponses`);
      } else {
        console.warn("[generate-answers] Pass-2 insuffisant, passage à Pass-3");
        answers = null;
      }
    } catch (e: unknown) {
      console.error("[generate-answers] Pass-2 exception:", (e as Record<string, unknown>)?.message ?? e);
      answers = null;
    }
  }

  // ── Pass 3: per-question nuclear fallback ─────────────────────────────────
  if (!answers) {
    try {
      answers = await pass3PerQuestion(questions, name, seed, level, pages);
      if (answers && countValid(answers) > 0) {
        console.log(`[generate-answers] Pass-3 réussit: ${countValid(answers)} réponses`);
      } else {
        answers = null;
      }
    } catch (e: unknown) {
      console.error("[generate-answers] Pass-3 exception:", (e as Record<string, unknown>)?.message ?? e);
      answers = null;
    }
  }

  // ── STRICT validation: NEVER return success with 0 answers ────────────────
  if (!answers || countValid(answers) === 0) {
    const msg =
      "Gemini n'a produit aucune réponse exploitable après 3 passes (structurée + texte libre + par question). " +
      "Vérifiez que vos clés Gemini ne sont pas toutes en quota.";
    console.error("[generate-answers] ❌ ÉCHEC TOTAL:", msg);
    return res.status(500).json({ success: false, error: msg });
  }

  // Fill in any missing questions with a contextual placeholder
  // (partial success is better than no success)
  for (const q of questions) {
    if (!answers[q.id] || !answers[q.id].trim()) {
      answers[q.id] = `[Réponse non générée pour: ${q.text.substring(0, 40)}]`;
    }
  }

  console.log(`[generate-answers] ✅ SUCCÈS: ${countValid(answers)}/${questions.length} réponses`);

  // ── Optional: save session to MongoDB ─────────────────────────────────────
  if (saveSession) {
    tryConnectDB().then(async (ok) => {
      if (!ok) return;
      try {
        const M = getSessionModel();
        await new M({
          studentName:       name,
          detectedQuestions: questions,
          criteriaLevel:     level,
          generatedAnswers:  answers,
          variantSeed:       seed,
        }).save();
        console.log(`[generate-answers] Session MongoDB sauvée pour ${name}`);
      } catch (dbErr) {
        console.error("[generate-answers] Erreur MongoDB:", dbErr);
      }
    });
  }

  return res.status(200).json({ success: true, answers });
}
