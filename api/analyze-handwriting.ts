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

const FALLBACK_STYLE = {
  suggestedFont: "Homemade Apple",
  suggestedColor: "blue",
  suggestedSize: 18,
  letterSpacingEm: -0.02,
  wordSpacingPx: 6,
  lineHeightMultiplier: 1.55,
  suggestedRotation: -1.5,
  baselineWobbleAmp: 1.8,
  baselineWobbleFreq: 2.1,
  letterRotVariance: 4.5,
  letterYVariance: 1.8,
  letterXVariance: 0.5,
  penThickness: 1.4,
  inkOpacityMin: 0.72,
  inkOpacityMax: 1.0,
  inkDrySkipRate: 0.04,
  inkBleedRadius: 0.15,
  messinessIntensity: 2.5,
  letterSizeVariance: 0.8,
  letterCaseChaos: true,
  enableUnreadableLetters: false,
  analysisDescription: "Style écolier classique appliqué par défaut.",
  confidenceScore: 40,
  inferredRaturesRate: 0.03,
  inferredBlancoRate: 0.01,
  inferredSmudgeFreq: 0.25,
  letterShapeFingerprint: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5],
};

export type HandwritingStyle = typeof FALLBACK_STYLE;

function clamp(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ success: false, error: "Méthode non autorisée." });

  const { handwritingImage, studentName } = req.body || {};
  if (!handwritingImage || !String(handwritingImage).includes("base64,")) {
    return res.status(200).json({ success: true, handwritingStyle: FALLBACK_STYLE });
  }

  if (!getGeminiKeys().length) {
    return res.status(200).json({ success: true, handwritingStyle: FALLBACK_STYLE });
  }

  try {
    const b64 = String(handwritingImage).split("base64,")[1];
    const mime = (String(handwritingImage).split(";")[0].split(":")[1] || "image/png") as any;

    const rawText = await withKeys(async (ai) => {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { inlineData: { data: b64, mimeType: mime } },
          {
            text:
              `Tu es un expert en analyse graphologique. Analyse très précisément l'écriture manuscrite de "${studentName || "cet élève"}" dans cette image.\n\n` +
              `Extrais TOUS les paramètres suivants avec la plus grande précision possible :\n\n` +
              `suggestedFont: OBLIGATOIREMENT l'une de: "Homemade Apple", "Marck Script", "Parisienne", "Allura", "La Belle Aurore", "Bad Script"\n` +
              `suggestedColor: couleur d'encre (ex: "blue", "black", "red", "#1d3278")\n` +
              `suggestedSize: taille px (12-26)\n` +
              `letterSpacingEm: espacement inter-lettre em (-0.05 à 0.15)\n` +
              `wordSpacingPx: espacement mots px (3-15)\n` +
              `lineHeightMultiplier: interligne (1.3-2.0)\n` +
              `suggestedRotation: inclinaison degrés (-8 à +4)\n` +
              `baselineWobbleAmp: tremblement ligne px (0-4)\n` +
              `baselineWobbleFreq: fréquence tremblement (1.0-4.0)\n` +
              `letterRotVariance: variance rotation lettre degrés (0-8)\n` +
              `letterYVariance: variance verticale lettre px (0-3)\n` +
              `letterXVariance: variance horizontale lettre px (0-1.5)\n` +
              `penThickness: épaisseur trait (0.8-2.5)\n` +
              `inkOpacityMin: opacité min (0.5-0.95)\n` +
              `inkOpacityMax: opacité max (0.85-1.0)\n` +
              `inkDrySkipRate: taux encre sèche (0.0-0.12)\n` +
              `inkBleedRadius: bavure encre (0.0-0.3)\n` +
              `messinessIntensity: désordre global (0-6)\n` +
              `letterSizeVariance: variation taille lettre px (0.0-2.5)\n` +
              `letterCaseChaos: boolean - casse incorrecte\n` +
              `enableUnreadableLetters: boolean - lettres illisibles\n` +
              `inferredRaturesRate: fréquence ratures (0.0-0.15)\n` +
              `inferredBlancoRate: fréquence blanco (0.0-0.08)\n` +
              `inferredSmudgeFreq: fréquence bavures (0.0-0.8)\n` +
              `letterShapeFingerprint: tableau 16 nombres (0.0-1.0)\n` +
              `analysisDescription: description graphologique français (max 120 chars)\n` +
              `confidenceScore: confiance analyse (0-100)\n\n` +
              `Réponds UNIQUEMENT avec un JSON valide.`,
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedFont:           { type: Type.STRING },
              suggestedColor:          { type: Type.STRING },
              suggestedSize:           { type: Type.NUMBER },
              letterSpacingEm:         { type: Type.NUMBER },
              wordSpacingPx:           { type: Type.NUMBER },
              lineHeightMultiplier:    { type: Type.NUMBER },
              suggestedRotation:       { type: Type.NUMBER },
              baselineWobbleAmp:       { type: Type.NUMBER },
              baselineWobbleFreq:      { type: Type.NUMBER },
              letterRotVariance:       { type: Type.NUMBER },
              letterYVariance:         { type: Type.NUMBER },
              letterXVariance:         { type: Type.NUMBER },
              penThickness:            { type: Type.NUMBER },
              inkOpacityMin:           { type: Type.NUMBER },
              inkOpacityMax:           { type: Type.NUMBER },
              inkDrySkipRate:          { type: Type.NUMBER },
              inkBleedRadius:          { type: Type.NUMBER },
              messinessIntensity:      { type: Type.NUMBER },
              letterSizeVariance:      { type: Type.NUMBER },
              letterCaseChaos:         { type: Type.BOOLEAN },
              enableUnreadableLetters: { type: Type.BOOLEAN },
              inferredRaturesRate:     { type: Type.NUMBER },
              inferredBlancoRate:      { type: Type.NUMBER },
              inferredSmudgeFreq:      { type: Type.NUMBER },
              letterShapeFingerprint:  { type: Type.ARRAY, items: { type: Type.NUMBER } },
              analysisDescription:     { type: Type.STRING },
              confidenceScore:         { type: Type.NUMBER },
            },
            required: [
              "suggestedFont","suggestedColor","suggestedSize","letterSpacingEm",
              "wordSpacingPx","lineHeightMultiplier","suggestedRotation",
              "baselineWobbleAmp","baselineWobbleFreq","letterRotVariance",
              "letterYVariance","letterXVariance","penThickness",
              "inkOpacityMin","inkOpacityMax","inkDrySkipRate","inkBleedRadius",
              "messinessIntensity","letterSizeVariance","letterCaseChaos",
              "enableUnreadableLetters","inferredRaturesRate","inferredBlancoRate",
              "inferredSmudgeFreq","letterShapeFingerprint","analysisDescription","confidenceScore",
            ],
          },
        },
      });
      return response.text || "";
    });

    let parsed: any = FALLBACK_STYLE;
    if (rawText) {
      try {
        const clean = rawText.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
        parsed = JSON.parse(clean);
      } catch { /* keep fallback */ }
    }

    const style: HandwritingStyle = {
      suggestedFont: parsed.suggestedFont || FALLBACK_STYLE.suggestedFont,
      suggestedColor: parsed.suggestedColor || FALLBACK_STYLE.suggestedColor,
      suggestedSize: clamp(parsed.suggestedSize, 12, 28, FALLBACK_STYLE.suggestedSize),
      letterSpacingEm: clamp(parsed.letterSpacingEm, -0.08, 0.25, FALLBACK_STYLE.letterSpacingEm),
      wordSpacingPx: clamp(parsed.wordSpacingPx, 2, 18, FALLBACK_STYLE.wordSpacingPx),
      lineHeightMultiplier: clamp(parsed.lineHeightMultiplier, 1.2, 2.2, FALLBACK_STYLE.lineHeightMultiplier),
      suggestedRotation: clamp(parsed.suggestedRotation, -9, 6, FALLBACK_STYLE.suggestedRotation),
      baselineWobbleAmp: clamp(parsed.baselineWobbleAmp, 0, 6, FALLBACK_STYLE.baselineWobbleAmp),
      baselineWobbleFreq: clamp(parsed.baselineWobbleFreq, 0.5, 5, FALLBACK_STYLE.baselineWobbleFreq),
      letterRotVariance: clamp(parsed.letterRotVariance, 0, 12, FALLBACK_STYLE.letterRotVariance),
      letterYVariance: clamp(parsed.letterYVariance, 0, 4, FALLBACK_STYLE.letterYVariance),
      letterXVariance: clamp(parsed.letterXVariance, 0, 2, FALLBACK_STYLE.letterXVariance),
      penThickness: clamp(parsed.penThickness, 0.5, 3.5, FALLBACK_STYLE.penThickness),
      inkOpacityMin: clamp(parsed.inkOpacityMin, 0.4, 0.98, FALLBACK_STYLE.inkOpacityMin),
      inkOpacityMax: clamp(parsed.inkOpacityMax, 0.85, 1.0, FALLBACK_STYLE.inkOpacityMax),
      inkDrySkipRate: clamp(parsed.inkDrySkipRate, 0, 0.15, FALLBACK_STYLE.inkDrySkipRate),
      inkBleedRadius: clamp(parsed.inkBleedRadius, 0, 0.5, FALLBACK_STYLE.inkBleedRadius),
      messinessIntensity: clamp(parsed.messinessIntensity, 0, 6, FALLBACK_STYLE.messinessIntensity),
      letterSizeVariance: clamp(parsed.letterSizeVariance, 0, 3, FALLBACK_STYLE.letterSizeVariance),
      letterCaseChaos: typeof parsed.letterCaseChaos === "boolean" ? parsed.letterCaseChaos : FALLBACK_STYLE.letterCaseChaos,
      enableUnreadableLetters: typeof parsed.enableUnreadableLetters === "boolean" ? parsed.enableUnreadableLetters : FALLBACK_STYLE.enableUnreadableLetters,
      inferredRaturesRate: clamp(parsed.inferredRaturesRate, 0, 0.2, FALLBACK_STYLE.inferredRaturesRate),
      inferredBlancoRate: clamp(parsed.inferredBlancoRate, 0, 0.1, FALLBACK_STYLE.inferredBlancoRate),
      inferredSmudgeFreq: clamp(parsed.inferredSmudgeFreq, 0, 1, FALLBACK_STYLE.inferredSmudgeFreq),
      letterShapeFingerprint: Array.isArray(parsed.letterShapeFingerprint) && parsed.letterShapeFingerprint.length >= 16
        ? parsed.letterShapeFingerprint.slice(0, 16).map((v: any) => clamp(Number(v), 0, 1, 0.5))
        : FALLBACK_STYLE.letterShapeFingerprint,
      analysisDescription: parsed.analysisDescription || FALLBACK_STYLE.analysisDescription,
      confidenceScore: clamp(parsed.confidenceScore, 0, 100, FALLBACK_STYLE.confidenceScore),
    };

    return res.status(200).json({ success: true, handwritingStyle: style });
  } catch (err: any) {
    console.error("analyze-handwriting:", err.message);
    return res.status(200).json({ success: true, handwritingStyle: FALLBACK_STYLE });
  }
}
