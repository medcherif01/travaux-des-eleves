/**
 * GET  /api/students         — list all students
 * POST /api/students         — create or update student
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Student } from "./_lib";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const dbOk = await connectDB();

  // ── GET — list all ──────────────────────────────────────────────────────────
  if (req.method === "GET") {
    if (!dbOk) {
      return res.status(200).json({ success: true, students: [], offline: true });
    }
    try {
      const students = await Student.find({}).sort({ updatedAt: -1 }).lean();
      return res.status(200).json({ success: true, students });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST — create or update ─────────────────────────────────────────────────
  if (req.method === "POST") {
    const profileData = req.body;
    if (!profileData?.name?.trim()) {
      return res.status(400).json({ success: false, error: "Nom manquant." });
    }
    if (!dbOk) {
      return res.status(200).json({ success: true, student: profileData, offline: true });
    }
    try {
      const student = await Student.findOneAndUpdate(
        { name: profileData.name.trim() },
        {
          ...profileData,
          name: profileData.name.trim(),
          hwImageBase64: profileData.hwImage || profileData.hwImageBase64 || "",
        },
        { upsert: true, new: true, runValidators: false }
      ).lean();
      return res.status(200).json({ success: true, student });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: "Méthode non autorisée." });
}
