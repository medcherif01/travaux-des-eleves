import mongoose from "mongoose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── Student Schema with section + classe ─────────────────────────────────────
const StudentSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    section:   { type: String, enum: ["garcons", "filles"], required: true, default: "garcons" },
    classe:    { type: String, enum: ["PEI1","PEI2","PEI3","PEI4","PEI5"], required: true, default: "PEI1" },
    // Handwriting settings
    fontKey:               { type: String,  default: "kalam" },
    inkColor:              { type: String,  default: "#1a3aab" },
    fontSize:              { type: Number,  default: 18 },
    writingSize:           { type: String,  enum: ["small","medium","large"], default: "medium" },
    writingStyle:          { type: String,  enum: ["clean","medium","childlike","fast","realistic"], default: "medium" },
    rotationAngle:         { type: Number,  default: -0.5 },
    skewAngle:             { type: Number,  default: -3 },
    wordDrift:             { type: Number,  default: 1.5 },
    letterSpacing:         { type: Number,  default: -0.5 },
    messinessIntensity:    { type: Number,  default: 2.5 },
    enableUnreadableLetters:{ type: Boolean, default: true },
    letterCaseChaos:       { type: Boolean, default: false },
    inkDrySkipping:        { type: Boolean, default: true },
    penThickness:          { type: Number,  default: 1.5 },
    penType:               { type: String,  default: "ballpoint" },
    hwImageBase64:         { type: String,  default: "" },
    hwImageName:           { type: String,  default: "" },
    analysisDescription:   { type: String,  default: "" },
    confidenceScore:       { type: Number,  default: 0 },
  },
  { timestamps: true }
);

// compound index: a student is unique per section+classe+name
StudentSchema.index({ section: 1, classe: 1, name: 1 }, { unique: true });

function getStudentModel() {
  // drop old model if schema changed (dev hot-reload)
  if (mongoose.models.Student) return mongoose.models.Student;
  return mongoose.model("Student", StudentSchema);
}

async function connectDB(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) return true;
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI || "";
  if (!uri) return false;
  try {
    await mongoose.connect(uri, { dbName: "nanobanana", serverSelectionTimeoutMS: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const dbOk = await connectDB();
  const Student = getStudentModel();

  // GET — list students, optionally filtered by section + classe
  if (req.method === "GET") {
    if (!dbOk) return res.status(200).json({ success: true, students: [], offline: true });
    try {
      const filter: Record<string, string> = {};
      if (req.query.section) filter.section = req.query.section as string;
      if (req.query.classe)  filter.classe  = req.query.classe  as string;
      const students = await Student.find(filter).sort({ name: 1 }).lean();
      return res.status(200).json({ success: true, students });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST — create or update student
  if (req.method === "POST") {
    const data = req.body || {};
    if (!data.name?.trim())    return res.status(400).json({ success: false, error: "Nom manquant." });
    if (!data.section)         return res.status(400).json({ success: false, error: "Section manquante." });
    if (!data.classe)          return res.status(400).json({ success: false, error: "Classe manquante." });
    if (!dbOk) return res.status(200).json({ success: true, student: data, offline: true });
    try {
      const student = await Student.findOneAndUpdate(
        { name: data.name.trim(), section: data.section, classe: data.classe },
        { ...data, name: data.name.trim() },
        { upsert: true, new: true, runValidators: false }
      ).lean();
      return res.status(200).json({ success: true, student });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE — delete by section + classe + name
  if (req.method === "DELETE") {
    const name    = decodeURIComponent((req.query.name    as string) || "");
    const section = (req.query.section as string) || "";
    const classe  = (req.query.classe  as string) || "";
    if (!name || !section || !classe) return res.status(400).json({ success: false, error: "Paramètres manquants." });
    if (!dbOk) return res.status(200).json({ success: true, offline: true });
    try {
      await Student.deleteOne({ name, section, classe });
      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: "Méthode non autorisée." });
}
