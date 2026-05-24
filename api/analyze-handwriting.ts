import { Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withKeyRotation, hasKeys } from "./_gemini";

/**
 * Deep handwriting analysis result — fed directly into HandwrittenText renderer
 */
const FALLBACK_STYLE = {
  // ── Font selection
  suggestedFont: "Homemade Apple",
  suggestedColor: "blue",

  // ── Sizing & spacing
  suggestedSize: 18,           // base font-size px
  letterSpacingEm: -0.02,     // em — negative = cramped, positive = airy
  wordSpacingPx: 6,            // px between words
  lineHeightMultiplier: 1.55, // relative to font-size

  // ── Geometry
  suggestedRotation: -1.5,    // global slant in degrees (negative = leans right)
  baselineWobbleAmp: 1.8,     // px — how much each word deviates vertically
  baselineWobbleFreq: 2.1,    // sin frequency factor
  letterRotVariance: 4.5,     // ° — random rotation per letter
  letterYVariance: 1.8,       // px — vertical jitter per letter
  letterXVariance: 0.5,       // px — horizontal jitter per letter

  // ── Stroke & ink
  penThickness: 1.4,          // stroke weight multiplier
  inkOpacityMin: 0.72,        // min opacity (light pressure)
  inkOpacityMax: 1.0,         // max opacity (heavy pressure)
  inkDrySkipRate: 0.04,       // fraction of letters that look "faded"
  inkBleedRadius: 0.15,       // blur radius for ink spread (px in SVG units)

  // ── Letter-level deformations
  messinessIntensity: 2.5,    // 0–6 overall sloppiness
  letterSizeVariance: 0.8,    // how much letters vary in size (px)
  letterCaseChaos: true,      // occasional wrong capitalisation
  enableUnreadableLetters: false,

  // ── Style tags extracted from the image
  analysisDescription: "Style écolier classique appliqué par défaut.",
  confidenceScore: 40,

  // ── Ratures / realism presets inferred from sample
  inferredRaturesRate: 0.03,
  inferredBlancoRate: 0.01,
  inferredSmudgeFreq: 0.25,   // 0–1, how often smudges appear

  // ── Per-letter shape fingerprint (16 values 0–1, used as seed offsets)
  letterShapeFingerprint: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5],
};

export type HandwritingStyle = typeof FALLBACK_STYLE;

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

  if (!hasKeys()) return res.status(200).json({ success: true, handwritingStyle: FALLBACK_STYLE });

  try {
    const b64 = String(handwritingImage).split("base64,")[1];
    const mime = (String(handwritingImage).split(";")[0].split(":")[1] || "image/png") as any;

    const rawText = await withKeyRotation(async (ai) => {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { inlineData: { data: b64, mimeType: mime } },
          {
            text:
              `Tu es un expert en analyse graphologique. Analyse très précisément l'écriture manuscrite de "${studentName || "cet élève"}" dans cette image.\n\n` +
              `Extrais TOUS les paramètres suivants avec la plus grande précision possible :\n\n` +

              `== POLICE ==\n` +
              `suggestedFont: OBLIGATOIREMENT l'une de ces options EXACTES: "Homemade Apple", "Marck Script", "Parisienne", "Allura", "La Belle Aurore", "Bad Script"\n` +
              `Choisis celle dont le style se rapproche le plus de l'écriture visible.\n\n` +

              `== COULEUR ==\n` +
              `suggestedColor: couleur d'encre observée (ex: "blue", "black", "red", "green", "#1d3278")\n\n` +

              `== TAILLE ET ESPACEMENT ==\n` +
              `suggestedSize: taille de police en px (entre 12 et 26, basé sur la hauteur relative des lettres)\n` +
              `letterSpacingEm: espacement inter-lettre en em (entre -0.05 et 0.15)\n` +
              `wordSpacingPx: espacement entre mots en px (entre 3 et 15)\n` +
              `lineHeightMultiplier: interligne relatif à la taille (entre 1.3 et 2.0)\n\n` +

              `== GÉOMÉTRIE ET INCLINAISON ==\n` +
              `suggestedRotation: inclinaison globale en degrés (−8 = très penchée droite, 0 = vertical, +4 = penche gauche)\n` +
              `baselineWobbleAmp: amplitude de tremblement de ligne en px (0 = parfait, 4 = très tremblant)\n` +
              `baselineWobbleFreq: fréquence du tremblement (entre 1.0 et 4.0)\n` +
              `letterRotVariance: variance de rotation par lettre en degrés (0 = uniforme, 8 = très irrégulier)\n` +
              `letterYVariance: variance verticale par lettre en px (0–3)\n` +
              `letterXVariance: variance horizontale par lettre en px (0–1.5)\n\n` +

              `== ENCRE ET PRESSION ==\n` +
              `penThickness: épaisseur du trait (0.8 = fin comme gel, 2.5 = épais comme feutre)\n` +
              `inkOpacityMin: opacité minimale (pression légère), entre 0.5 et 0.95\n` +
              `inkOpacityMax: opacité maximale (pression forte), entre 0.85 et 1.0\n` +
              `inkDrySkipRate: taux de lettres à l'encre "sèche"/pâle (entre 0.0 et 0.12)\n` +
              `inkBleedRadius: rayon de bavure d'encre (0.0 = propre, 0.3 = beaucoup de bavures)\n\n` +

              `== DÉSORDRE GLOBAL ==\n` +
              `messinessIntensity: intensité globale du désordre (0 = parfait, 6 = très bâclé)\n` +
              `letterSizeVariance: variation de taille par lettre en px (0.0 = uniforme, 2.5 = très variable)\n` +
              `letterCaseChaos: true si certaines lettres ont une casse incorrecte (majuscule/minuscule mélangée)\n` +
              `enableUnreadableLetters: true si certaines lettres sont vraiment illisibles\n\n` +

              `== RÉALISME INFÉRÉ ==\n` +
              `inferredRaturesRate: fréquence de ratures/corrections dans l'écriture (0.0–0.15)\n` +
              `inferredBlancoRate: fréquence d'utilisation de correcteur blanc (0.0–0.08)\n` +
              `inferredSmudgeFreq: fréquence de bavures/taches (0.0–0.8)\n\n` +

              `== EMPREINTE FORME ==\n` +
              `letterShapeFingerprint: tableau de 16 nombres entre 0.0 et 1.0 représentant l'empreinte unique de cette écriture.\n` +
              `Ces valeurs seront utilisées comme seed de déformation. Varies-les selon les caractéristiques observées:\n` +
              `[inclinaison_a, inclinaison_e, hauteur_t, boucle_l, pression_finale_mot, uniformite_o, taille_majuscule, espace_inter_mot, tremblement_h, jonction_lettres, fermeture_boucles, lignes_obliques, dechirement_papier, contact_baseline, progression_haut, regularite_globale]\n\n` +

              `== DESCRIPTION ==\n` +
              `analysisDescription: description graphologique en français (max 120 chars)\n` +
              `confidenceScore: confiance de l'analyse entre 0 et 100\n\n` +

              `Réponds UNIQUEMENT avec un JSON valide, aucun autre texte.`,
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
              letterShapeFingerprint: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
              },
              analysisDescription:     { type: Type.STRING },
              confidenceScore:         { type: Type.NUMBER },
            },
            required: [
              "suggestedFont", "suggestedColor", "suggestedSize", "letterSpacingEm",
              "wordSpacingPx", "lineHeightMultiplier", "suggestedRotation",
              "baselineWobbleAmp", "baselineWobbleFreq", "letterRotVariance",
              "letterYVariance", "letterXVariance", "penThickness",
              "inkOpacityMin", "inkOpacityMax", "inkDrySkipRate", "inkBleedRadius",
              "messinessIntensity", "letterSizeVariance", "letterCaseChaos",
              "enableUnreadableLetters", "inferredRaturesRate", "inferredBlancoRate",
              "inferredSmudgeFreq", "letterShapeFingerprint",
              "analysisDescription", "confidenceScore",
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

    // Clamp & sanitise all values to prevent rendering glitches
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

function clamp(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
