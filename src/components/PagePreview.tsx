/**
 * PagePreview — Aperçu et édition des copies générées
 */

import React, { useState, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Printer, Edit3, Check, X,
  Eye, Download, Star, MessageSquare, BarChart2,
  CheckCircle, XCircle, AlertCircle, Save, RefreshCw,
  User, BookOpen, Award, FileText
} from "lucide-react";
import type {
  StudentCopy, DetectedQuestion, EvalPage, CriteriaLevel,
  TeacherComment, GradeInfo, IBSymbol
} from "../types";
import { buildPrintHTML } from "../utils/printHTML";
import { fontKeyToFamily } from "../utils/handwriting";

interface Props {
  copies: StudentCopy[];
  setCopies: (c: StudentCopy[]) => void;
  evalPages: EvalPage[];
  questions: DetectedQuestion[];
  evalFileName: string;
  previewCopyIdx: number;
  setPreviewCopyIdx: (i: number) => void;
  onPrint: (copy: StudentCopy) => void;
  onPrintAll: () => void;
}

const IB_SYMBOLS: IBSymbol[] = ["✓", "✗", "~", "?", "★", "○", "△"];
const QUALITY_LABELS = { excellent: "Excellent", incomplete: "Incomplet", incorrect: "Incorrect" };
const QUALITY_COLORS = {
  excellent:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  incomplete: "bg-amber-100 text-amber-700 border-amber-200",
  incorrect:  "bg-red-100 text-red-700 border-red-200",
};

export default function PagePreview({
  copies, setCopies,
  evalPages, questions,
  evalFileName,
  previewCopyIdx, setPreviewCopyIdx,
  onPrint, onPrintAll,
}: Props) {
  const [activeTab, setActiveTab]   = useState<"answers" | "comments" | "grade">("answers");
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [editText, setEditText]     = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [previewPage, setPreviewPage] = useState(0);

  const copy = copies[previewCopyIdx];
  if (!copy) {
    return (
      <div className="page-section">
        <div className="empty-state">
          <Eye size={48} className="text-slate-300" />
          <h2 className="empty-state-title">Aucune copie générée</h2>
          <p className="empty-state-desc">Retournez sur "Classe entière" ou "Élève individuel" pour générer des copies.</p>
        </div>
      </div>
    );
  }

  const { student, answers, comments, grade, level } = copy;

  // ── Edit answer ──────────────────────────────────────────────────────────────

  function startEditAnswer(qId: string) {
    setEditingQId(qId);
    setEditText(answers[qId] || "");
  }

  function saveAnswer() {
    if (!editingQId) return;
    updateCopy(previewCopyIdx, c => ({
      ...c,
      answers: { ...c.answers, [editingQId]: editText },
      manualAnswers: { ...c.manualAnswers, [editingQId]: true },
    }));
    setEditingQId(null);
  }

  function cancelEdit() {
    setEditingQId(null);
  }

  // ── Edit comment ─────────────────────────────────────────────────────────────

  function startEditComment(qId: string) {
    const c = comments.find(c => c.questionId === qId);
    setEditingComment(qId);
    setEditCommentText(c?.comment || "");
  }

  function saveComment() {
    if (!editingComment) return;
    updateCopy(previewCopyIdx, c => ({
      ...c,
      comments: c.comments.map(cm =>
        cm.questionId === editingComment
          ? { ...cm, comment: editCommentText, edited: true }
          : cm
      ),
    }));
    setEditingComment(null);
  }

  // ── Update symbol ────────────────────────────────────────────────────────────

  function updateSymbol(qId: string, sym: IBSymbol) {
    updateCopy(previewCopyIdx, c => ({
      ...c,
      comments: c.comments.map(cm =>
        cm.questionId === qId ? { ...cm, symbol: sym } : cm
      ),
    }));
  }

  // ── Update grade ─────────────────────────────────────────────────────────────

  function updateGradeNote(note: number) {
    const appreciations: Record<number, string> = {
      8: "Excellent", 7: "Très bien", 6: "Bien", 5: "Assez bien",
      4: "Satisfaisant", 3: "Passable", 2: "Insuffisant", 1: "Très insuffisant", 0: "Non rendu"
    };
    const levelMap: Record<number, CriteriaLevel> = {
      8: "7-8" as CriteriaLevel, 7: "7-8" as CriteriaLevel,
      6: "5-6" as CriteriaLevel, 5: "5-6" as CriteriaLevel,
      4: "3-4" as CriteriaLevel, 3: "3-4" as CriteriaLevel,
      2: "1-2" as CriteriaLevel, 1: "1-2" as CriteriaLevel, 0: "1-2" as CriteriaLevel,
    };
    updateCopy(previewCopyIdx, c => ({
      ...c,
      grade: {
        note: note as any,
        ibLevel: levelMap[note] || "5-6" as CriteriaLevel,
        ibSymbol: note >= 6 ? "✓" : note >= 4 ? "~" : "✗",
        appreciation: appreciations[note] || "Satisfaisant",
      },
    }));
  }

  function updateCopy(idx: number, updater: (c: StudentCopy) => StudentCopy) {
    const next = [...copies];
    next[idx] = updater(next[idx]);
    setCopies(next);
  }

  const fontFamily = fontKeyToFamily(student.fontKey) || "Kalam";
  const inkColor   = student.inkColor || "#1a3aab";

  return (
    <div className="page-section">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Aperçu des copies</h1>
          <p className="page-subtitle">
            Vérifiez, modifiez et imprimez les copies générées.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrintAll}
            className="btn-secondary"
            disabled={copies.length === 0}
          >
            <Printer size={15} />
            Imprimer tout ({copies.length})
          </button>
        </div>
      </div>

      {/* Student navigator */}
      <div className="copy-navigator">
        <button
          onClick={() => { setPreviewCopyIdx(Math.max(0, previewCopyIdx - 1)); setPreviewPage(0); }}
          disabled={previewCopyIdx === 0}
          className="nav-arrow"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="copy-tabs">
          {copies.map((c, i) => (
            <button
              key={i}
              onClick={() => { setPreviewCopyIdx(i); setPreviewPage(0); }}
              className={`copy-tab ${i === previewCopyIdx ? "active" : ""}`}
            >
              <div className="copy-tab-avatar">
                {c.student.name.charAt(0).toUpperCase()}
              </div>
              <span className="copy-tab-name">{c.student.name.split(" ")[0]}</span>
              {c.grade && (
                <span className={`copy-tab-grade ${c.grade.note >= 6 ? "text-emerald-600" : c.grade.note >= 4 ? "text-amber-600" : "text-red-600"}`}>
                  {c.grade.note}/8
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => { setPreviewCopyIdx(Math.min(copies.length - 1, previewCopyIdx + 1)); setPreviewPage(0); }}
          disabled={previewCopyIdx === copies.length - 1}
          className="nav-arrow"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Main area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Copy preview */}
        <div className="lg:col-span-3 space-y-3">
          {/* Page tabs */}
          {evalPages.length > 1 && (
            <div className="flex gap-1">
              {evalPages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPreviewPage(i)}
                  className={`page-dot-btn ${previewPage === i ? "active" : ""}`}
                >
                  P{i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Copy canvas */}
          <div className="copy-canvas-container">
            {evalPages[previewPage] && (
              <div className="copy-canvas" style={{ position: "relative" }}>
                <img
                  src={evalPages[previewPage].base64}
                  alt={`Page ${previewPage + 1}`}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
                {/* Student name overlay (page 0 only) */}
                {previewPage === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${50 + (copy.namePos?.x || 0)}%`,
                      top: `${3 + (copy.namePos?.y || 0)}%`,
                      fontFamily: `"${fontFamily}", cursive`,
                      fontSize: `${student.fontSize}px`,
                      color: inkColor,
                      fontWeight: 600,
                      pointerEvents: "none",
                    }}
                  >
                    {student.name}
                  </div>
                )}
                {/* Grade overlay (page 0) */}
                {previewPage === 0 && grade && (
                  <div
                    style={{
                      position: "absolute",
                      right: "5%",
                      top: "3%",
                      fontFamily: `"${fontFamily}", cursive`,
                      fontSize: `${student.fontSize + 2}px`,
                      color: inkColor,
                      fontWeight: 700,
                      pointerEvents: "none",
                    }}
                  >
                    {grade.note}/8
                  </div>
                )}
                {/* Answer overlays */}
                {questions
                  .filter(q => q.pageIndex === previewPage)
                  .map(q => {
                    const off = copy.offsets[q.id] || { x: 0, y: 0 };
                    const isManual = copy.manualAnswers[q.id];
                    return (
                      <div
                        key={q.id}
                        style={{
                          position: "absolute",
                          left: `${(q.x || 8) + off.x}%`,
                          top: `${(q.y || 20) + off.y}%`,
                          width: `${q.maxWidth || 84}%`,
                          fontFamily: `"${fontFamily}", cursive`,
                          fontSize: `${student.fontSize}px`,
                          color: inkColor,
                          lineHeight: "1.8",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          cursor: "pointer",
                        }}
                        title="Cliquer pour modifier"
                        onClick={() => startEditAnswer(q.id)}
                      >
                        {answers[q.id] || ""}
                        {isManual && (
                          <span style={{ fontSize: "9px", color: "#6366f1", marginLeft: 4 }}>✎</span>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Print buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => onPrint(copy)}
              className="btn-primary flex-1"
            >
              <Printer size={15} />
              Imprimer cette copie
            </button>
          </div>
        </div>

        {/* Right: Tabs panel */}
        <div className="lg:col-span-2 space-y-3">
          {/* Student info card */}
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="student-avatar-lg">
                {student.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-slate-900">{student.name}</div>
                <div className="text-sm text-slate-500">
                  {student.section === "garcons" ? "Garçons" : "Filles"} / {student.classe}
                </div>
                {grade && (
                  <div className={`text-sm font-bold mt-1 ${grade.note >= 6 ? "text-emerald-600" : grade.note >= 4 ? "text-amber-600" : "text-red-600"}`}>
                    {grade.appreciation} — {grade.note}/8
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="tab-switcher">
            {[
              { id: "answers",  icon: <FileText size={14} />, label: "Réponses" },
              { id: "comments", icon: <MessageSquare size={14} />, label: "Commentaires" },
              { id: "grade",    icon: <Award size={14} />, label: "Note" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="card">
            {/* Answers tab */}
            {activeTab === "answers" && (
              <div className="tab-content">
                {questions.map((q, i) => (
                  <div key={q.id} className="answer-item">
                    <div className="answer-item-header">
                      <span className="answer-q-num">Q{i + 1}</span>
                      <span className="answer-q-text truncate">{q.text.slice(0, 60)}{q.text.length > 60 ? "…" : ""}</span>
                      <button
                        onClick={() => startEditAnswer(q.id)}
                        className="btn-ghost-xs"
                        title="Modifier"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>

                    {editingQId === q.id ? (
                      <div className="answer-edit-area">
                        <textarea
                          className="answer-textarea"
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          autoFocus
                          rows={4}
                        />
                        <div className="flex gap-2 mt-2">
                          <button onClick={saveAnswer} className="btn-primary-sm">
                            <Check size={12} /> Sauvegarder
                          </button>
                          <button onClick={cancelEdit} className="btn-ghost-sm">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`answer-text ${copy.manualAnswers[q.id] ? "border-l-2 border-indigo-300 pl-2" : ""}`}
                        style={{ fontFamily: `"${fontFamily}", cursive`, color: inkColor, fontSize: "14px" }}
                        onClick={() => startEditAnswer(q.id)}
                        title="Cliquer pour modifier"
                      >
                        {answers[q.id] || <span className="text-slate-300 italic">— pas de réponse —</span>}
                        {copy.manualAnswers[q.id] && (
                          <span className="ml-1 text-xs text-indigo-400">modifié</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Comments tab */}
            {activeTab === "comments" && (
              <div className="tab-content">
                {comments.length === 0 ? (
                  <div className="empty-tab">Aucun commentaire généré</div>
                ) : (
                  comments.map((c, i) => {
                    const q = questions.find(q => q.questionId === c.questionId || q.id === c.questionId);
                    return (
                      <div key={c.questionId} className="comment-item">
                        <div className="comment-item-header">
                          <span className="answer-q-num">Q{i + 1}</span>
                          <span className={`quality-badge ${QUALITY_COLORS[c.quality]}`}>
                            {QUALITY_LABELS[c.quality]}
                          </span>
                          {/* Symbol picker */}
                          <div className="symbol-picker">
                            {IB_SYMBOLS.map(sym => (
                              <button
                                key={sym}
                                onClick={() => updateSymbol(c.questionId, sym)}
                                className={`symbol-btn ${c.symbol === sym ? "active" : ""}`}
                              >
                                {sym}
                              </button>
                            ))}
                          </div>
                        </div>

                        {editingComment === c.questionId ? (
                          <div className="answer-edit-area">
                            <textarea
                              className="answer-textarea"
                              value={editCommentText}
                              onChange={e => setEditCommentText(e.target.value)}
                              autoFocus
                              rows={3}
                            />
                            <div className="flex gap-2 mt-2">
                              <button onClick={saveComment} className="btn-primary-sm">
                                <Check size={12} /> Sauvegarder
                              </button>
                              <button onClick={() => setEditingComment(null)} className="btn-ghost-sm">
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="comment-text"
                            onClick={() => startEditComment(c.questionId)}
                            title="Cliquer pour modifier"
                          >
                            {c.comment}
                            {c.edited && <span className="ml-1 text-xs text-indigo-400">modifié</span>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Grade tab */}
            {activeTab === "grade" && (
              <div className="tab-content">
                <div className="grade-section">
                  <div className="grade-label">Note sur 8</div>
                  <div className="grade-buttons">
                    {[8,7,6,5,4,3,2,1,0].map(n => (
                      <button
                        key={n}
                        onClick={() => updateGradeNote(n)}
                        className={`grade-btn ${grade?.note === n ? "active" : ""} ${n >= 6 ? "grade-btn--good" : n >= 4 ? "grade-btn--mid" : "grade-btn--low"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  {grade && (
                    <div className="grade-info-card">
                      <div className="grade-info-row">
                        <span>Note</span>
                        <span className="font-bold text-lg">{grade.note}/8</span>
                      </div>
                      <div className="grade-info-row">
                        <span>Niveau IB</span>
                        <span className="font-semibold">{grade.ibLevel}</span>
                      </div>
                      <div className="grade-info-row">
                        <span>Symbole</span>
                        <span className="text-xl">{grade.ibSymbol}</span>
                      </div>
                      <div className="grade-info-row">
                        <span>Appréciation</span>
                        <span className={`font-medium ${grade.note >= 6 ? "text-emerald-600" : grade.note >= 4 ? "text-amber-600" : "text-red-600"}`}>
                          {grade.appreciation}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
