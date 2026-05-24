/**
 * Shared utilities for all Vercel serverless API functions
 * MongoDB connection + Gemini client + Mongoose models
 */

import mongoose, { Schema, Document, model } from "mongoose";
import { GoogleGenAI, Type } from "@google/genai";

// ─── MongoDB connection (singleton for serverless) ────────────────────────────
let mongoConnected = false;

export async function connectDB(): Promise<boolean> {
  if (mongoConnected && mongoose.connection.readyState === 1) return true;
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI || "";
  if (!uri) {
    console.warn("MONGO_URL non définie — mode localStorage.");
    return false;
  }
  try {
    await mongoose.connect(uri, { dbName: "nanobanana", serverSelectionTimeoutMS: 5000 });
    mongoConnected = true;
    return true;
  } catch (err) {
    console.error("MongoDB connection error:", err);
    return false;
  }
}

// ─── Mongoose Models ─────────────────────────────────────────────────────────

export interface IStudent extends Document {
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

const StudentSchema = new Schema<IStudent>(
  {
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
  },
  { timestamps: true }
);

export const Student =
  (mongoose.models.Student as mongoose.Model<IStudent>) ||
  model<IStudent>("Student", StudentSchema);

export interface IEvalSession extends Document {
  studentId: mongoose.Types.ObjectId | null;
  studentName: string;
  pdfPagesBase64: string[];
  detectedQuestions: Array<{ id: string; text: string; pageIndex: number; x: number; y: number }>;
  criteriaLevel: string;
  generatedAnswers: Record<string, string>;
  variantSeed: number;
  createdAt: Date;
}

const EvalSessionSchema = new Schema<IEvalSession>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", default: null },
    studentName: { type: String, required: true },
    pdfPagesBase64: [{ type: String }],
    detectedQuestions: [{ id: String, text: String, pageIndex: Number, x: Number, y: Number }],
    criteriaLevel: { type: String, default: "5-6" },
    generatedAnswers: { type: Schema.Types.Mixed, default: {} },
    variantSeed: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const EvalSession =
  (mongoose.models.EvalSession as mongoose.Model<IEvalSession>) ||
  model<IEvalSession>("EvalSession", EvalSessionSchema);

// ─── Gemini client ────────────────────────────────────────────────────────────
export function getAIClient(): InstanceType<typeof GoogleGenAI> | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || "";
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY non définie.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

export { Type };
