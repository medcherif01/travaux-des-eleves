import mongoose from "mongoose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── Inline MongoDB setup ─────────────────────────────────────────────────────
const StudentSchema = new mongoose.Schema(
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

function getStudentModel() {
  return mongoose.models.Student || mongoose.model("Student", StudentSchema);
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const dbOk = await connectDB();
  const Student = getStudentModel();

  // GET — list all students
  if (req.method === "GET") {
    if (!dbOk) return res.status(200).json({ success: true, students: [], offline: true });
    try {
      const students = await Student.find({}).sort({ updatedAt: -1 }).lean();
      return res.status(200).json({ success: true, students });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST — create or update student
  if (req.method === "POST") {
    const data = req.body || {};
    if (!data.name?.trim()) return res.status(400).json({ success: false, error: "Nom manquant." });
    if (!dbOk) return res.status(200).json({ success: true, student: data, offline: true });
    try {
      const student = await Student.findOneAndUpdate(
        { name: data.name.trim() },
        { ...data, name: data.name.trim(), hwImageBase64: data.hwImage || data.hwImageBase64 || "" },
        { upsert: true, new: true, runValidators: false }
      ).lean();
      return res.status(200).json({ success: true, student });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE — delete by name (query param)
  if (req.method === "DELETE") {
    const name = (req.query.name as string) || "";
    if (!name) return res.status(400).json({ success: false, error: "Nom manquant." });
    if (!dbOk) return res.status(200).json({ success: true, offline: true });
    try {
      await Student.deleteOne({ name: decodeURIComponent(name) });
      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: "Méthode non autorisée." });
}
