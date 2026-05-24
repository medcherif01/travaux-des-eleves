/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// ─── Gemini client ────────────────────────────────────────────────────────────
function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY non définie ou placeholder.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

// ─── Route: Analyze handwriting style from image ─────────────────────────────
app.post("/api/analyze", async (req, res): Promise<any> => {
  try {
    const {
      worksheetId,
      criteriaLevel,
      customAssessmentImage,
      handwritingImage,
      studentName,
    } = req.body;

    const ai = getAIClient();
    let analyzedStyle: any = null;
    let resultAnswers: { [qId: string]: string } = {};

    // 1. Analyze handwriting sample if provided
    if (handwritingImage && handwritingImage.includes("base64,")) {
      if (ai) {
        try {
          const base64Data = handwritingImage.split("base64,")[1];
          const mimeType = handwritingImage.split(";")[0].split(":")[1] as any;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              { inlineData: { data: base64Data, mimeType: mimeType || "image/png" } },
              {
                text:
                  `Analyse cette image d'écriture manuscrite d'un élève (nom: "${studentName || "inconnu"}"). ` +
                  `Identifie ses caractéristiques clés pour paramétrer un rendu numérique fidèle:\n` +
                  `1. Police manuscrite la plus proche (UNIQUEMENT parmi: 'Homemade Apple', 'Marck Script', 'Parisienne', 'Allura', 'La Belle Aurore', 'Bad Script')\n` +
                  `2. Couleur d'encre réelle observée: 'blue', 'black', 'red', 'green'\n` +
                  `3. Taille de police estimée (entre 14 et 22, défaut 18)\n` +
                  `4. Angle de rotation/inclinaison naturelle en degrés (entre -6 et +6)\n` +
                  `5. Description en français de l'écriture (style, régularité, particularités...)\n` +
                  `6. Score de confiance (0 à 100)\n` +
                  `Retourne uniquement un JSON.`,
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

          if (response.text) {
            analyzedStyle = JSON.parse(response.text.trim());
          }
        } catch (hwError) {
          console.error("Erreur analyse écriture Gemini:", hwError);
          analyzedStyle = {
            suggestedFont: "Homemade Apple",
            suggestedColor: "blue",
            suggestedSize: 18,
            suggestedRotation: -2,
            analysisDescription: "Analyse impossible. Style manuscrit écolier classique appliqué par défaut.",
            confidenceScore: 50,
          };
        }
      } else {
        analyzedStyle = {
          suggestedFont: "Homemade Apple",
          suggestedColor: "blue",
          suggestedSize: 18,
          suggestedRotation: -2,
          analysisDescription: "Mode démo — Clé API Gemini non configurée. Style écolier par défaut.",
          confidenceScore: 100,
        };
      }
    }

    // 2. Solve custom uploaded worksheet
    if (worksheetId === "custom" && customAssessmentImage && customAssessmentImage.includes("base64,")) {
      if (ai) {
        try {
          const base64WSheet = customAssessmentImage.split("base64,")[1];
          const wsType = customAssessmentImage.split(";")[0].split(":")[1] as any;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              { inlineData: { data: base64WSheet, mimeType: wsType || "image/png" } },
              {
                text:
                  `Analyse cette image d'évaluation scolaire et génère les réponses pour un élève de niveau "${criteriaLevel}" :\n\n` +
                  `Niveaux :\n` +
                  `- "1-2" (Limité) : Réponses courtes, simples, erreurs de raisonnement basiques\n` +
                  `- "3-4" (Rudimentaire) : Réponses correctes mais sans profondeur scientifique\n` +
                  `- "5-6" (Satisfaisant) : Réponses précises, calculs corrects, définitions rigoureuses\n` +
                  `- "7-8" (Excellent) : Réponses très détaillées, analyse critique, justifications expertes\n\n` +
                  `Toutes les réponses OBLIGATOIREMENT en français.\n` +
                  `Détecte toutes les questions et génère les réponses en JSON.`,
              },
            ],
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
                      },
                      required: ["id", "text"],
                    },
                  },
                  answers: {
                    type: Type.OBJECT,
                    description: "Clé = id de question, Valeur = texte de la réponse manuscrite",
                  },
                },
                required: ["questions", "answers"],
              },
            },
          });

          if (response.text) {
            const parsed = JSON.parse(response.text.trim());
            return res.json({
              success: true,
              questions: parsed.questions,
              answers: parsed.answers,
              handwritingStyle: analyzedStyle,
            });
          }
        } catch (apiError) {
          console.error("Erreur résolution fiche Gemini:", apiError);
          return res.status(500).json({
            success: false,
            error: "Erreur lors du traitement de l'évaluation avec Gemini.",
          });
        }
      } else {
        // Demo fallback
        return res.json({
          success: true,
          questions: [
            { id: "cust_q1", text: "Question Détectée 1 (Démo)" },
            { id: "cust_q2", text: "Question Détectée 2 (Démo)" },
          ],
          answers: {
            cust_q1: `[Niveau ${criteriaLevel}] Réponse simulée — configurez votre clé API Gemini dans Settings.`,
            cust_q2: `[Niveau ${criteriaLevel}] Deuxième réponse simulée — mode démo sans clé API.`,
          },
          handwritingStyle: analyzedStyle,
          isDemo: true,
        });
      }
    }

    return res.json({ success: true, handwritingStyle: analyzedStyle });
  } catch (err: any) {
    console.error("Erreur générale /api/analyze:", err);
    res.status(500).json({ success: false, error: err?.message || "Erreur serveur interne" });
  }
});

// ─── Route: Generate student-specific answers via Gemini ─────────────────────
// This endpoint generates UNIQUE answers for each student + variant seed combination
// ensuring no two students ever get the same wording.
app.post("/api/generate-student-answers", async (req, res): Promise<any> => {
  try {
    const {
      worksheetId,
      criteriaLevel,
      studentName,
      variantSeed,
      questions,
      uploadedSheetImages,
      customAssessmentImage,
    } = req.body;

    const ai = getAIClient();

    // Level descriptions for prompt context
    const levelDescriptions: Record<string, string> = {
      "1-2": "Limité : L'élève produit des réponses très courtes avec une compréhension minimale. Il peut faire des erreurs de calcul simples, utiliser un vocabulaire très basique, et ses justifications sont quasi absentes.",
      "3-4": "Rudimentaire : L'élève donne des réponses correctes mais sans approfondissement. Les calculs sont souvent justes mais les explications manquent de rigueur scientifique.",
      "5-6": "Satisfaisant : L'élève répond correctement avec des calculs précis et des explications claires. Il utilise un vocabulaire scientifique approprié mais ses analyses restent descriptives.",
      "7-8": "Excellent / Critique : L'élève produit un travail exemplaire avec des justifications complètes, des calculs parfaitement détaillés, et une analyse critique des sources d'information.",
    };

    const levelDesc = levelDescriptions[criteriaLevel] || levelDescriptions["5-6"];

    // Build the differentiation prompt — uniqueness comes from studentName + variantSeed
    const differentiationPrompt = `
Tu joues le rôle d'un élève spécifique prénommé "${studentName}" (identifiant unique de variante: ${variantSeed}).

EXIGENCES D'UNICITÉ ABSOLUE :
- Tes réponses doivent être ENTIÈREMENT DIFFÉRENTES de celles que tu générerais pour n'importe quel autre élève
- Utilise des formulations, des tournures de phrases, et des structures de réponse uniques propres à "${studentName}"
- Si la variante est ${variantSeed}, ajoute une légère variation dans le style (ex: plus d'hésitations si pair, plus direct si impair)
- N'utilise PAS de markdown (pas de gras, pas de tirets, pas de listes) — texte brut uniquement
- Les réponses doivent sembler écrites à la main par un élève de collège/lycée
- JAMAIS de formules génériques identiques entre élèves différents

NIVEAU DE L'ÉLÈVE "${studentName}" : ${criteriaLevel}/8
${levelDesc}

DIRECTIVES COMPORTEMENTALES pour "${studentName}" :
${criteriaLevel === "1-2" ? "- Fais des erreurs de calcul simples\n- Utilise des phrases très courtes\n- Confonds parfois les unités\n- Saute des étapes de raisonnement" : ""}
${criteriaLevel === "3-4" ? "- Donne des réponses correctes mais incomplètes\n- Manque parfois de justifications\n- Utilise un vocabulaire simple" : ""}
${criteriaLevel === "5-6" ? "- Réponds correctement et clairement\n- Utilise quelques termes scientifiques\n- Détaille les calculs mais reste concis" : ""}
${criteriaLevel === "7-8" ? "- Réponds de façon très détaillée et experte\n- Analyse critiquement les sources\n- Justifie chaque affirmation scientifiquement\n- Compare et évalue les approches" : ""}

Rédige TOUTES les réponses en français. Retourne un JSON structuré.
`;

    if (ai) {
      try {
        const contentParts: any[] = [];

        // If uploaded sheet images are provided, include the first one for context
        if (uploadedSheetImages && uploadedSheetImages.length > 0) {
          const imgData = uploadedSheetImages[0];
          if (imgData && imgData.includes("base64,")) {
            const b64 = imgData.split("base64,")[1];
            const mimeType = imgData.split(";")[0].split(":")[1] as any;
            contentParts.push({ inlineData: { data: b64, mimeType: mimeType || "image/png" } });
          }
        }

        // Build question list for the prompt
        const questionsList = (questions || []).map((q: any) => `- ID: "${q.id}" | Question: "${q.text}"`).join("\n");

        contentParts.push({
          text:
            differentiationPrompt +
            `\n\nVoici les questions auxquelles tu dois répondre:\n${questionsList || "(Questions issues de la fiche détectée dans l'image)"}` +
            `\n\nRetourne un JSON avec ce format exact:\n{"answers": {"<id_question>": "<texte_réponse_manuscrite>", ...}}`,
        });

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contentParts,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                answers: {
                  type: Type.OBJECT,
                  description: "Clé = id de question, Valeur = réponse manuscrite unique pour cet élève",
                },
              },
              required: ["answers"],
            },
          },
        });

        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          return res.json({ success: true, answers: parsed.answers });
        }

        return res.status(500).json({ success: false, error: "Réponse vide de Gemini." });
      } catch (genError: any) {
        console.error("Erreur génération réponses Gemini:", genError);
        // Fallback demo answers with student-specific wording
        const fallbackAnswers: { [qId: string]: string } = {};
        (questions || []).forEach((q: any) => {
          fallbackAnswers[q.id] = `[${studentName} - Var.${variantSeed} - Note ${criteriaLevel}] Réponse simulée pour cette question. Clé API Gemini requise.`;
        });
        return res.json({ success: true, answers: fallbackAnswers, isDemo: true });
      }
    } else {
      // No API key — demo mode with unique per-student placeholder
      const demoAnswers: { [qId: string]: string } = {};
      (questions || []).forEach((q: any, idx: number) => {
        const variantTexts: Record<string, string[]> = {
          "1-2": [
            `Je sais pas trop mais je crois que c'est ${900 * (0.1 + idx * 0.05).toFixed(2)} quelque chose`,
            `La réponse est environ ${(135 + idx * 7).toFixed(0)} je crois`,
            `C'est difficile cette question pour moi`,
          ],
          "3-4": [
            `La consommation est de ${900} kWh donc le coût est ${900 * 0.15} euros à peu près`,
            `Selon les données le total est ${135 + idx * 5} euros`,
            `Il faut multiplier les kWh par le tarif`,
          ],
          "5-6": [
            `D'après les données de la facture, la consommation totale de ${900} kWh au tarif de ${0.15} €/kWh donne ${900 * 0.15} € auxquels on ajoute l'abonnement fixe de 30 €, soit un total de 165 €`,
            `En appliquant la formule Coût = Consommation × Prix unitaire, on obtient ${900} × ${0.15} = ${135} € pour l'électricité`,
            `L'énergie consommée est de ${900} kWh ce qui représente ${(900 / 30).toFixed(0)} kWh par jour en moyenne`,
          ],
          "7-8": [
            `En appliquant rigoureusement la relation C = E × pu où E représente l'énergie consommée (${900} kWh) et pu le prix unitaire (${0.15} €/kWh), on obtient C = ${900 * 0.15} €. En ajoutant l'abonnement fixe de 30 €, la facture totale s'élève à ${900 * 0.15 + 30} €. Cette méthode est scientifiquement justifiée et reproductible.`,
            `L'analyse critique des deux extraits révèle une différence fondamentale : l'Extrait A provient d'un blog sans références scientifiques (source non fiable, biais d'opinion), tandis que l'Extrait B s'appuie sur les données de l'AIEA, organisme international reconnu. Cette distinction est essentielle pour évaluer la fiabilité de l'information.`,
            `La consommation journalière moyenne est ${(900 / 90).toFixed(1)} kWh/jour. Une augmentation de ${20}% conduirait à ${(900 * 0.15 * 1.2).toFixed(2)} €, soit ${(900 * 0.15 * 0.2).toFixed(2)} € supplémentaires. Cette analyse quantitative permet de prévoir l'impact économique des variations tarifaires.`,
          ],
        };
        const texts = variantTexts[criteriaLevel] || variantTexts["5-6"];
        const textIdx = (variantSeed + idx) % texts.length;
        demoAnswers[q.id] = texts[textIdx];
      });
      return res.json({ success: true, answers: demoAnswers, isDemo: true });
    }
  } catch (err: any) {
    console.error("Erreur générale /api/generate-student-answers:", err);
    res.status(500).json({ success: false, error: err?.message || "Erreur serveur interne" });
  }
});

// ─── Vite / Static serving ────────────────────────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware intégré.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serveur de fichiers statiques (prod) intégré.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur Express en écoute sur le port ${PORT}`);
  });
}

startServer();
