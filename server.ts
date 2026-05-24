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

// Enable CORS and body parsers with generous limits for base64 uploads
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Lazy initializer for Google GenAI client
function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY environment variable is not defined or is placeholder.");
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API Route: Analyze custom worksheet or student handwriting style
app.post("/api/analyze", async (req, res): Promise<any> => {
  try {
    const { worksheetId, criteriaLevel, customAssessmentImage, handwritingImage } = req.body;
    const ai = getAIClient();

    let resultAnswers: { [qId: string]: string } = {};
    let analyzedStyle = null;

    // 1. Analyze Handwriting style if provided
    if (handwritingImage && handwritingImage.includes("base64,")) {
      if (ai) {
        try {
          const base64Data = handwritingImage.split("base64,")[1];
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: "image/png",
                },
              },
              {
                text: "Analyze this image of student handwriting. Identify its key traits to map them to the closest digital parameters:\n" +
                  "1. Suggested font name (Choose from: 'Caveat', 'Kalam', 'Shadows Into Light', 'Indie Flower', 'Architects Daughter', 'Schoolbell').\n" +
                  "2. Best suggested ink color (Output exactly 'blue', 'black', 'red', or 'green').\n" +
                  "3. Suggested font size scale factor (choose between 14 and 22, default 18).\n" +
                  "4. Jitter / Slant rotation angle in degrees (offset between -6 and +6, indicating hand writing rotation/imperfections).\n" +
                  "5. Friendly summary description of the handwriting style in French (e.g. 'Une écriture cursive fluide et dynamique...', 'Style script régulier et espacé...').\n" +
                  "6. Confidence rating (0 to 100).\n" +
                  "Return a JSON object with keys: suggestedFont, suggestedColor, suggestedSize, suggestedRotation, analysisDescription, confidenceScore.",
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
          console.error("Error analyzing handwriting via Gemini:", hwError);
          // Standard fallback style
          analyzedStyle = {
            suggestedFont: "Caveat",
            suggestedColor: "blue",
            suggestedSize: 18,
            suggestedRotation: -2,
            analysisDescription: "Analyse impossible sans clé API active. Style d'écriture manuscrite écolier classique appliqué.",
            confidenceScore: 50,
          };
        }
      } else {
        // Fallback description when API key is missing
        analyzedStyle = {
          suggestedFont: "Caveat",
          suggestedColor: "blue",
          suggestedSize: 18,
          suggestedRotation: -2,
          analysisDescription: "Mode démo (aucune clé API configurée) : Écriture cursive de style éolienne appliquée par défaut.",
          confidenceScore: 100,
        };
      }
    }

    // 2. Solve Custom Worksheet if uploaded
    if (worksheetId === "custom" && customAssessmentImage && customAssessmentImage.includes("base64,")) {
      if (ai) {
        try {
          const base64WSheet = customAssessmentImage.split("base64,")[1];
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                inlineData: {
                  data: base64WSheet,
                  mimeType: "image/png",
                },
              },
              {
                text: `Analysez cette image d'évaluation ou de devoir de niveau scolaire (PEI 4 ou similaire). 
                Générez des réponses manuscrites directement adaptées pour répondre aux questions identifiées sur la feuille.
                Le niveau requis pour rédiger les réponses doit correspondre exactement aux critères de notation pour la note "${criteriaLevel}" :
                
                - Si la note demandée est "1-2" (Limité) : Produisez des réponses courtes, très simples, avec une interprétation minimale ou de légères erreurs de calcul/raisonnement simples.
                - Si la note demandée est "3-4" (Rudimentaire) : Produisez des équations mathématiques simples mais correctes, des explications rudimentaires mais compréhensibles sans justification scientifique poussée.
                - Si la note demandée est "5-6" (Satisfaisant) : Produisez des réponses très claires, des résolutions d'exercices calculées avec précision, des définitions rigoureuses et scientifiquement fondées.
                - Si la note demandée est "7-8" (Excellent / Critique) : Produisez des réponses très détaillées, complètes et formulées de manière experte. Justifiez avec précision tous les termes scientifiques et évaluez de manière critique les limites de l'approche ou des sources.
                
                Rédigez TOUTES les réponses impérativement en français.
                Retournez un objet JSON structuré contenant les questions détectées avec leurs réponses rédigées. Le JSON doit suivre ce format :
                {
                  "questions": [
                    { "id": "q1", "text": "Intitulé résumé de la question 1" },
                    { "id": "q2", "text": "Intitulé résumé de la question 2" }
                  ],
                  "answers": {
                    "q1": "Le texte de la réponse manuscrite proposée pour q1...",
                    "q2": "Le texte de la réponse manuscrite proposée pour q2..."
                  }
                }`,
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
                    description: "Clé-valeur associant l'id de la question au texte de la réponse.",
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
          console.error("Error generating custom answers via Gemini:", apiError);
          return res.status(500).json({
            success: false,
            error: "Erreur lors du traitement de l'image de l'évaluation avec Gemini.",
          });
        }
      } else {
        // Mock fallback for custom uploaded sheet when API key is missing
        return res.json({
          success: true,
          questions: [
            { id: "cust_q1", text: "Question Détectée 1 (Exemple)" },
            { id: "cust_q2", text: "Question Détectée 2 (Exemple)" },
          ],
          answers: {
            cust_q1: `[Niveau ${criteriaLevel}] Réponse simulée à la question 1. Veuillez configurer votre clé API Gemini dans le panneau Settings > Secrets de Google AI Studio pour une résolution réelle 100% automatisée de vos propres fiches !`,
            cust_q2: `[Niveau ${criteriaLevel}] Réponse simulée à la question 2. La formule a bien été développée et résolue par Nanobanana !`,
          },
          handwritingStyle: analyzedStyle,
          isDemo: true,
        });
      }
    }

    // Default response (this is handled when template worksheets are selected, which uses our pre-baked templates.ts rubrics!)
    return res.json({
      success: true,
      handwritingStyle: analyzedStyle,
    });
  } catch (err: any) {
    console.error("General API Error in evaluate:", err);
    res.status(500).json({ success: false, error: err?.message || "Internal Server Error" });
  }
});

// Configure Vite and Asset Fallback handling
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Mount Vite development server as middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated.");
  } else {
    // Serve static files in production from dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Production static files server integrated.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express dev server actively listening on port ${PORT}`);
  });
}

startServer();
