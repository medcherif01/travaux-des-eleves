/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * nanobanana PRO — Server
 * Express + MongoDB/Mongoose + Gemini 2.5 Flash
 */

import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import mongoose, { Schema, Document, model } from "mongoose";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ─── MongoDB connection ────────────────────────────────────────────────────────
async function connectMongoDB() {
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.warn("⚠️  MONGO_URL non définie — mode localStorage uniquement.");
    return;
  }
  try {
    await mongoose.connect(uri, { dbName: "nanobanana" });
    console.log("✅ MongoDB connecté.");
  } catch (err) {
    console.error("❌ Erreur MongoDB:", err);
  }
}

// ─── Mongoose Schemas ─────────────────────────────────────────────────────────

// Student profile schema
interface IStudent extends Document {
  name: string;
  fontKey: string;
  inkColor: string;
  fontSize: number;
  rotationAngle: number;
  skewAngle: number;
  wordDrift: number;
  letterSpacing: number;
  messinessIntensity: number;
  enableUnreadableLetters: boolean;
  letterCaseChaos: boolean;
  inkDrySkipping: boolean;
  penThickness: number;
  penType: string;
  pencilHardness: string;
  hwImageBase64: string;
  hwImageName: string;
  analysisDescription: string;
  confidenceScore: number;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>({
  name: { type: String, required: true, unique: true, trim: true },
  fontKey: { type: String, default: "homemade-apple" },
  inkColor: { type: String, default: "#1d3278" },
  fontSize: { type: Number, default: 18 },
  rotationAngle: { type: Number, default: -0.5 },
  skewAngle: { type: Number, default: -3 },
  wordDrift: { type: Number, default: 1.5 },
  letterSpacing: { type: Number, default: -0.5 },
  messinessIntensity: { type: Number, default: 2.5 },
  enableUnreadableLetters: { type: Boolean, default: true },
  letterCaseChaos: { type: Boolean, default: true },
  inkDrySkipping: { type: Boolean, default: true },
  penThickness: { type: Number, default: 1.5 },
  penType: { type: String, default: "ballpoint" },
  pencilHardness: { type: String, default: "HB" },
  hwImageBase64: { type: String, default: "" },
  hwImageName: { type: String, default: "" },
  analysisDescription: { type: String, default: "" },
  confidenceScore: { type: Number, default: 0 },
}, { timestamps: true });

const Student = mongoose.models.Student || model<IStudent>("Student", StudentSchema);

// Evaluation session schema
interface IEvalSession extends Document {
  studentId: mongoose.Types.ObjectId | null;
  studentName: string;
  pdfPagesBase64: string[];
  detectedQuestions: Array<{ id: string; text: string; pageIndex: number; x: number; y: number }>;
  criteriaLevel: string;
  generatedAnswers: Record<string, string>;
  variantSeed: number;
  createdAt: Date;
}

const EvalSessionSchema = new Schema<IEvalSession>({
  studentId: { type: Schema.Types.ObjectId, ref: "Student", default: null },
  studentName: { type: String, required: true },
  pdfPagesBase64: [{ type: String }],
  detectedQuestions: [{
    id: String,
    text: String,
    pageIndex: { type: Number, default: 0 },
    x: { type: Number, default: 10 },
    y: { type: Number, default: 30 },
  }],
  criteriaLevel: { type: String, default: "5-6" },
  generatedAnswers: { type: Schema.Types.Mixed, default: {} },
  variantSeed: { type: Number, default: 1 },
}, { timestamps: true });

const EvalSession = mongoose.models.EvalSession || model<IEvalSession>("EvalSession", EvalSessionSchema);

// ─── Gemini client ────────────────────────────────────────────────────────────
function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("⚠️  GEMINI_API_KEY non définie ou placeholder.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — Students CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/students — list all students
app.get("/api/students", async (req, res): Promise<any> => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, students: [], offline: true });
    }
    const students = await Student.find({}).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, students });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/students — create or update a student profile
app.post("/api/students", async (req, res): Promise<any> => {
  try {
    const profileData = req.body;
    if (!profileData?.name?.trim()) {
      return res.status(400).json({ success: false, error: "Nom manquant." });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, student: profileData, offline: true });
    }

    const student = await Student.findOneAndUpdate(
      { name: profileData.name.trim() },
      {
        ...profileData,
        name: profileData.name.trim(),
        hwImageBase64: profileData.hwImage || profileData.hwImageBase64 || "",
        hwImageName: profileData.hwImageName || "",
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    return res.json({ success: true, student });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/students/:name — delete student by name
app.delete("/api/students/:name", async (req, res): Promise<any> => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, offline: true });
    }
    await Student.deleteOne({ name: req.params.name });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/students/:name/handwriting — save Gemini-analyzed handwriting to student
app.post("/api/students/:name/handwriting", async (req, res): Promise<any> => {
  try {
    const { hwImageBase64, hwImageName, analysisDescription, confidenceScore,
      fontKey, inkColor, fontSize, rotationAngle } = req.body;

    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, offline: true });
    }

    const student = await Student.findOneAndUpdate(
      { name: req.params.name },
      { hwImageBase64, hwImageName, analysisDescription, confidenceScore,
        fontKey, inkColor, fontSize, rotationAngle },
      { new: true }
    ).lean();

    if (!student) {
      return res.status(404).json({ success: false, error: "Élève introuvable." });
    }
    return res.json({ success: true, student });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE — Analyze handwriting sample
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/analyze-handwriting", async (req, res): Promise<any> => {
  try {
    const { handwritingImage, studentName } = req.body;
    const ai = getAIClient();

    if (!handwritingImage || !handwritingImage.includes("base64,")) {
      return res.status(400).json({ success: false, error: "Image manquante." });
    }

    const base64Data = handwritingImage.split("base64,")[1];
    const mimeType = handwritingImage.split(";")[0].split(":")[1] as any;

    let analyzedStyle: any = {
      suggestedFont: "Homemade Apple",
      suggestedColor: "blue",
      suggestedSize: 18,
      suggestedRotation: -2,
      analysisDescription: "Mode démo — style écolier par défaut.",
      confidenceScore: 50,
    };

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            { inlineData: { data: base64Data, mimeType: mimeType || "image/png" } },
            {
              text:
                `Analyse cette image d'écriture manuscrite (élève: "${studentName || "inconnu"}"). ` +
                `Identifie ses caractéristiques pour un rendu numérique fidèle:\n` +
                `1. Police manuscrite la plus proche PARMI: 'Homemade Apple', 'Marck Script', 'Parisienne', 'Allura', 'La Belle Aurore', 'Bad Script'\n` +
                `2. Couleur d'encre: 'blue', 'black', 'red', 'green'\n` +
                `3. Taille de police (14-22, défaut 18)\n` +
                `4. Angle d'inclinaison en degrés (-6 à +6)\n` +
                `5. Description de l'écriture en français\n` +
                `6. Score de confiance (0-100)\n` +
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
      } catch (e) {
        console.error("Erreur analyse écriture Gemini:", e);
      }
    }

    return res.json({ success: true, handwritingStyle: analyzedStyle });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE — Core: Gemini reads questions from uploaded eval pages
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/detect-questions", async (req, res): Promise<any> => {
  try {
    const { pdfPagesBase64 } = req.body;
    const ai = getAIClient();

    if (!pdfPagesBase64 || !Array.isArray(pdfPagesBase64) || pdfPagesBase64.length === 0) {
      return res.status(400).json({ success: false, error: "Pages d'évaluation manquantes." });
    }

    // Demo fallback
    if (!ai) {
      return res.json({
        success: true,
        questions: [
          { id: "demo_q1", text: "Question 1 détectée (mode démo)", pageIndex: 0, x: 10, y: 25 },
          { id: "demo_q2", text: "Question 2 détectée (mode démo)", pageIndex: 0, x: 10, y: 45 },
        ],
        isDemo: true,
      });
    }

    // Build content parts: send ALL pages to Gemini for full detection
    const contentParts: any[] = [];
    for (let i = 0; i < Math.min(pdfPagesBase64.length, 6); i++) {
      const pageData = pdfPagesBase64[i];
      if (pageData && pageData.includes("base64,")) {
        const b64 = pageData.split("base64,")[1];
        const mime = pageData.split(";")[0].split(":")[1] as any;
        contentParts.push({
          inlineData: { data: b64, mimeType: mime || "image/png" }
        });
      }
    }

    contentParts.push({
      text:
        `Tu es un expert en analyse de documents scolaires.\n` +
        `Analyse CES ${Math.min(pdfPagesBase64.length, 6)} IMAGES d'évaluation scolaire.\n` +
        `Détecte TOUTES les questions auxquelles l'élève doit répondre.\n\n` +
        `Pour chaque question, donne:\n` +
        `- id: identifiant unique (ex: "q1", "q2_a", "ex3_q2")\n` +
        `- text: texte COMPLET de la question telle qu'elle apparaît\n` +
        `- pageIndex: numéro de la page (0 = première image, 1 = deuxième, etc.)\n` +
        `- x: position horizontale estimée en % (0-100) du bord gauche\n` +
        `- y: position verticale estimée en % (0-100) du haut de la page\n\n` +
        `IMPORTANT:\n` +
        `- Inclure UNIQUEMENT les zones où l'élève doit écrire sa réponse\n` +
        `- Les lignes vides sous les questions = zones de réponse\n` +
        `- Ignorer les consignes, titres, en-têtes\n` +
        `- Toutes les questions, même celles de sous-parties (a, b, c)\n` +
        `Retourne un JSON avec le tableau "questions".`,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentParts,
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
                  pageIndex: { type: Type.NUMBER },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                },
                required: ["id", "text", "pageIndex", "x", "y"],
              },
            },
          },
          required: ["questions"],
        },
      },
    });

    if (!response.text) {
      return res.status(500).json({ success: false, error: "Réponse vide de Gemini." });
    }

    const parsed = JSON.parse(response.text.trim());
    return res.json({ success: true, questions: parsed.questions });
  } catch (err: any) {
    console.error("Erreur detect-questions:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE — Core: Generate student-specific answers for detected questions
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/generate-answers", async (req, res): Promise<any> => {
  try {
    const {
      questions,
      criteriaLevel,
      studentName,
      variantSeed,
      pdfPagesBase64,
      saveSession,
    } = req.body;

    const ai = getAIClient();

    if (!questions || questions.length === 0) {
      return res.status(400).json({ success: false, error: "Questions manquantes." });
    }

    // Level descriptions
    const levelDescriptions: Record<string, string> = {
      "1-2": "Niveau LIMITÉ (1-2/8): Réponses très courtes, erreurs de raisonnement, vocabulaire très basique, justifications absentes ou confuses. Fait des erreurs de calcul simples. Confond parfois les unités.",
      "3-4": "Niveau RUDIMENTAIRE (3-4/8): Réponses correctes mais incomplètes. Les calculs sont souvent justes mais les explications manquent de rigueur scientifique. Vocabulaire simple.",
      "5-6": "Niveau SATISFAISANT (5-6/8): Réponses précises avec calculs corrects et explications claires. Utilise des termes scientifiques appropriés. Détaille les calculs.",
      "7-8": "Niveau EXCELLENT (7-8/8): Travail exemplaire avec justifications complètes, calculs parfaitement détaillés, analyse critique. Compare et évalue les approches scientifiquement.",
    };

    const levelDesc = levelDescriptions[criteriaLevel] || levelDescriptions["5-6"];
    const seed = variantSeed || 1;

    // Demo fallback
    if (!ai) {
      const demoAnswers: Record<string, string> = {};
      questions.forEach((q: any) => {
        demoAnswers[q.id] = `[${studentName} - N.${criteriaLevel}] Réponse pour: ${q.text.substring(0, 40)}...`;
      });
      return res.json({ success: true, answers: demoAnswers, isDemo: true });
    }

    const contentParts: any[] = [];

    // Include first 3 pages as context for answering
    if (pdfPagesBase64 && pdfPagesBase64.length > 0) {
      for (let i = 0; i < Math.min(pdfPagesBase64.length, 4); i++) {
        const pageData = pdfPagesBase64[i];
        if (pageData && pageData.includes("base64,")) {
          const b64 = pageData.split("base64,")[1];
          const mime = pageData.split(";")[0].split(":")[1] as any;
          contentParts.push({ inlineData: { data: b64, mimeType: mime || "image/png" } });
        }
      }
    }

    const questionsList = questions
      .map((q: any) => `  - ID: "${q.id}" | QUESTION: "${q.text}"`)
      .join("\n");

    contentParts.push({
      text:
        `Tu joues le rôle d'un élève nommé "${studentName}" (variante ${seed}).\n\n` +
        `${levelDesc}\n\n` +
        `DIRECTIVES ABSOLUES:\n` +
        `- Tes réponses doivent être UNIQUES et propres à "${studentName}" (variante ${seed})\n` +
        `- AUCUN markdown: pas de gras, pas de tirets, pas de listes structurées\n` +
        `- Texte brut uniquement, comme un vrai élève écrirait à la main\n` +
        `- Réponses en français uniquement\n` +
        `- Les réponses doivent sembler naturelles et humaines\n` +
        `- Si niveau 1-2: fais quelques petites erreurs naturelles\n` +
        `- Si niveau 7-8: sois très précis et complet\n\n` +
        `QUESTIONS AUXQUELLES RÉPONDRE:\n${questionsList}\n\n` +
        `Retourne un JSON {"answers": {"<id>": "<réponse_complète>", ...}} pour TOUTES les questions.`,
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
              description: "Map de id_question → texte de réponse manuscrite",
            },
          },
          required: ["answers"],
        },
      },
    });

    if (!response.text) {
      return res.status(500).json({ success: false, error: "Réponse vide de Gemini." });
    }

    const parsed = JSON.parse(response.text.trim());
    const answers = parsed.answers || {};

    // Save session to MongoDB if requested
    if (saveSession && mongoose.connection.readyState === 1) {
      try {
        const studentDoc = await Student.findOne({ name: studentName }).lean();
        await new EvalSession({
          studentId: studentDoc?._id || null,
          studentName,
          pdfPagesBase64: (pdfPagesBase64 || []).map((p: string) =>
            p.length > 500000 ? p.substring(0, 500000) : p
          ),
          detectedQuestions: questions,
          criteriaLevel,
          generatedAnswers: answers,
          variantSeed: seed,
        }).save();
        console.log(`✅ Session sauvée pour ${studentName}`);
      } catch (dbErr) {
        console.error("Erreur sauvegarde session:", dbErr);
      }
    }

    return res.json({ success: true, answers });
  } catch (err: any) {
    console.error("Erreur generate-answers:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE — Legacy /api/analyze (kept for backward compat)
// ─────────────────────────────────────────────────────────────────────────────
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
                  `Analyse cette image d'écriture manuscrite (élève: "${studentName || "inconnu"}"). ` +
                  `Police la plus proche PARMI: 'Homemade Apple', 'Marck Script', 'Parisienne', 'Allura', 'La Belle Aurore', 'Bad Script'. ` +
                  `Couleur: blue/black/red/green. Taille: 14-22. Angle: -6 à +6. Description FR. Confiance: 0-100. JSON uniquement.`,
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
          if (response.text) analyzedStyle = JSON.parse(response.text.trim());
        } catch (e) {
          analyzedStyle = { suggestedFont: "Homemade Apple", suggestedColor: "blue", suggestedSize: 18, suggestedRotation: -2, analysisDescription: "Défaut", confidenceScore: 50 };
        }
      } else {
        analyzedStyle = { suggestedFont: "Homemade Apple", suggestedColor: "blue", suggestedSize: 18, suggestedRotation: -2, analysisDescription: "Mode démo.", confidenceScore: 100 };
      }
    }

    // 2. Solve custom uploaded worksheet (legacy path)
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
                  `Analyse cette évaluation scolaire. Génère les réponses pour un élève de niveau "${criteriaLevel}". ` +
                  `Détecte toutes les questions. Réponses en français, texte brut uniquement. JSON.`,
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  questions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, text: { type: Type.STRING } }, required: ["id", "text"] } },
                  answers: { type: Type.OBJECT },
                },
                required: ["questions", "answers"],
              },
            },
          });
          if (response.text) {
            const parsed = JSON.parse(response.text.trim());
            return res.json({ success: true, questions: parsed.questions, answers: parsed.answers, handwritingStyle: analyzedStyle });
          }
        } catch (e) {
          return res.status(500).json({ success: false, error: "Erreur Gemini." });
        }
      } else {
        return res.json({
          success: true,
          questions: [{ id: "cust_q1", text: "Question 1 (Démo)" }, { id: "cust_q2", text: "Question 2 (Démo)" }],
          answers: { cust_q1: `[${criteriaLevel}] Réponse démo 1`, cust_q2: `[${criteriaLevel}] Réponse démo 2` },
          handwritingStyle: analyzedStyle,
          isDemo: true,
        });
      }
    }

    return res.json({ success: true, handwritingStyle: analyzedStyle });
  } catch (err: any) {
    console.error("Erreur /api/analyze:", err);
    res.status(500).json({ success: false, error: err?.message || "Erreur serveur" });
  }
});

// ─── Vite / Static serving ────────────────────────────────────────────────────
async function startServer() {
  await connectMongoDB();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("✅ Vite dev middleware intégré.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("✅ Serveur statique (prod) intégré.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Serveur nanobanana PRO sur le port ${PORT}`);
  });
}

startServer();
