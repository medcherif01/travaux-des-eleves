/**
 * DELETE /api/students/:name — delete student by name
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Student } from "../_lib";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "DELETE") {
    return res.status(405).json({ success: false, error: "Méthode non autorisée." });
  }

  const name = req.query.name as string;
  if (!name) return res.status(400).json({ success: false, error: "Nom manquant." });

  const dbOk = await connectDB();
  if (!dbOk) return res.status(200).json({ success: true, offline: true });

  try {
    await Student.deleteOne({ name: decodeURIComponent(name) });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
