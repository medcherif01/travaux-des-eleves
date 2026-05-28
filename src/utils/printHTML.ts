/**
 * Build print-ready A4 HTML for a student copy
 */

import type { StudentCopy, DetectedQuestion, EvalPage, TeacherNote, OverlayPatch, GeometryShape } from "../types";
import { fontKeyToFamily } from "./handwriting";

export function buildPrintHTML(
  copy: StudentCopy,
  evalPages: EvalPage[],
  questions: DetectedQuestion[],
  evalFileName: string,
  teacherNote?: TeacherNote | null,
  overlayPatches?: OverlayPatch[],
  shapes?: GeometryShape[],
): string {
  const { student, answers, offsets, namePos, comments, grade } = copy;
  const fontFamily = fontKeyToFamily(student.fontKey) || "Kalam";
  const inkColor   = student.inkColor || "#1a3aab";
  const fontSize   = student.fontSize || 18;
  const docTitle   = `${evalFileName} — Travaux des élèves - Evaluation électronique`;

  const pagesHTML = evalPages.map((page, pIdx) => {
    const pageQs = questions.filter(q => q.pageIndex === pIdx);
    const pagePatches = (overlayPatches || []).filter(p => p.pageIndex === pIdx);
    const pageShapes  = (shapes || []).filter(s => s.pageIndex === pIdx);

    const answersHTML = pageQs.map(q => {
      const text   = answers[q.id] || "";
      const off    = offsets[q.id] || { x: 0, y: 0 };
      const left   = `${(q.x || 8) + off.x}%`;
      const top    = `${(q.y || 20) + off.y}%`;
      const width  = `${q.maxWidth || 84}%`;
      return `
        <div style="
          position:absolute;
          left:${left};top:${top};width:${width};
          font-family:'${fontFamily}',cursive;
          font-size:${fontSize}px;
          color:${inkColor};
          line-height:1.8;
          white-space:pre-wrap;
          word-break:break-word;
        ">${text}</div>`;
    }).join("");

    const patchesHTML = pagePatches.map(p => {
      const bg = p.type === "blanco" ? "#ffffff" : "transparent";
      const border = p.type === "rature" ? "none" : "none";
      const content = p.type === "rature" ? `<div style="width:100%;height:2px;background:#222;margin:auto;position:absolute;top:50%;transform:translateY(-50%)"></div>` : "";
      return `
        <div style="
          position:absolute;
          left:${p.x}%;top:${p.y}%;width:${p.w}%;height:${p.h}%;
          background:${bg};transform:rotate(${p.rotation}deg);
          border:${border};overflow:hidden;
        ">${content}</div>`;
    }).join("");

    // Name label on first page
    const nameHTML = pIdx === 0 ? `
      <div style="
        position:absolute;
        left:${50 + (namePos?.x || 0)}%;
        top:${3 + (namePos?.y || 0)}%;
        font-family:'${fontFamily}',cursive;
        font-size:${fontSize + 2}px;
        color:${inkColor};
        font-weight:600;
      ">${student.name}</div>` : "";

    // Grade on first page
    const gradeHTML = grade && pIdx === 0 ? `
      <div style="
        position:absolute;right:5%;top:3%;
        font-family:'${fontFamily}',cursive;
        font-size:${fontSize + 2}px;color:${inkColor};
        font-weight:700;
      ">${grade.note}/8</div>` : "";

    // Teacher note
    const noteHTML = teacherNote && teacherNote.pageIndex === pIdx ? `
      <div style="
        position:absolute;
        left:${teacherNote.x}%;top:${teacherNote.y}%;
        color:${teacherNote.color || "red"};
        font-size:${teacherNote.fontSize || 14}px;
        transform:rotate(${teacherNote.rotation || 0}deg);
        font-style:italic;white-space:pre-wrap;
      ">${teacherNote.text}</div>` : "";

    return `
      <div style="position:relative;width:210mm;height:297mm;page-break-after:always;overflow:hidden;">
        <img src="${page.base64}" style="width:100%;height:100%;object-fit:contain;display:block;" />
        ${nameHTML}${gradeHTML}${answersHTML}${patchesHTML}${noteHTML}
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>${docTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&family=Caveat:wght@400;600&family=Patrick+Hand&family=Indie+Flower&family=Bad+Script&family=Dancing+Script:wght@400;600&family=Shadows+Into+Light&family=Homemade+Apple&family=Marck+Script&family=Satisfy&family=La+Belle+Aurore&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: white; }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      html, body { width: 210mm; }
    }
  </style>
</head>
<body>${pagesHTML}</body>
</html>`;
}
