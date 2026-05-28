/**
 * PageUpload — Upload de l'évaluation + détection des questions
 */

import React, { useCallback, useRef, useState } from "react";
import {
  Upload, FileText, CheckCircle, AlertCircle, Loader2,
  Eye, RefreshCw, ChevronRight, Zap, Brain, List,
  Image as ImageIcon, Table, Calculator, Microscope
} from "lucide-react";
import type { EvalPage, DetectedQuestion, QuestionType } from "../types";

interface Props {
  evalPages: EvalPage[];
  setEvalPages: (p: EvalPage[]) => void;
  questions: DetectedQuestion[];
  setQuestions: (q: DetectedQuestion[]) => void;
  docLang: string;
  setDocLang: (l: string) => void;
  evalFileName: string;
  setEvalFileName: (n: string) => void;
  isDetecting: boolean;
  setIsDetecting: (v: boolean) => void;
  onContinue: () => void;
}

const Q_TYPE_ICONS: Record<QuestionType, React.ReactNode> = {
  open:     <FileText size={13} />,
  mcq:      <List size={13} />,
  table:    <Table size={13} />,
  math:     <Calculator size={13} />,
  science:  <Microscope size={13} />,
  image:    <ImageIcon size={13} />,
  schema:   <ImageIcon size={13} />,
  text:     <FileText size={13} />,
};

const Q_TYPE_LABELS: Record<QuestionType, string> = {
  open:    "Question ouverte",
  mcq:     "QCM",
  table:   "Tableau",
  math:    "Mathématiques",
  science: "Sciences",
  image:   "Image",
  schema:  "Schéma",
  text:    "Texte",
};

const Q_TYPE_COLORS: Record<QuestionType, string> = {
  open:    "bg-blue-50 text-blue-700 border-blue-200",
  mcq:     "bg-purple-50 text-purple-700 border-purple-200",
  table:   "bg-amber-50 text-amber-700 border-amber-200",
  math:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  science: "bg-teal-50 text-teal-700 border-teal-200",
  image:   "bg-rose-50 text-rose-700 border-rose-200",
  schema:  "bg-rose-50 text-rose-700 border-rose-200",
  text:    "bg-slate-50 text-slate-700 border-slate-200",
};

export default function PageUpload({
  evalPages, setEvalPages,
  questions, setQuestions,
  docLang, setDocLang,
  evalFileName, setEvalFileName,
  isDetecting, setIsDetecting,
  onContinue,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver]   = useState(false);
  const [error, setError]         = useState("");
  const [previewPage, setPreviewPage] = useState(0);
  const [detectProgress, setDetectProgress] = useState(0);

  // ── PDF / Image loading ────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(ext || "")) {
      setError("Format non supporté. Utilisez un PDF ou une image (JPG, PNG).");
      return;
    }

    setEvalFileName(file.name.replace(/\.[^.]+$/, ""));
    setIsDetecting(true);
    setDetectProgress(10);
    setEvalPages([]);
    setQuestions([]);
    setPreviewPage(0);

    try {
      if (ext === "pdf") {
        await loadPDF(file);
      } else {
        await loadImage(file);
      }
    } catch (e: any) {
      setError("Erreur lors du chargement : " + e.message);
      setIsDetecting(false);
    }
  }

  async function loadImage(file: File) {
    const b64 = await fileToBase64(file);
    const page: EvalPage = {
      pageIndex: 0,
      base64: b64,
      width: 794,
      height: 1123,
    };
    setEvalPages([page]);
    setDetectProgress(40);
    await detectQuestions([page]);
  }

  async function loadPDF(file: File) {
    // Use PDF.js via CDN
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      // Fallback: send raw base64 directly
      const b64 = await fileToBase64DataUrl(file);
      const page: EvalPage = { pageIndex: 0, base64: b64, width: 794, height: 1123 };
      setEvalPages([page]);
      setDetectProgress(40);
      await detectQuestions([page]);
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdfDoc.numPages;
    const pages: EvalPage[] = [];

    for (let i = 1; i <= numPages; i++) {
      setDetectProgress(10 + Math.round((i / numPages) * 30));
      const pdfPage = await pdfDoc.getPage(i);
      const viewport = pdfPage.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      pages.push({
        pageIndex: i - 1,
        base64: canvas.toDataURL("image/jpeg", 0.85),
        width: viewport.width,
        height: viewport.height,
      });
    }

    setEvalPages(pages);
    setDetectProgress(45);
    await detectQuestions(pages);
  }

  async function detectQuestions(pages: EvalPage[]) {
    setDetectProgress(50);
    try {
      const resp = await fetch("/api/detect-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfPagesBase64: pages.map(p => p.base64),
        }),
      });
      const json = await resp.json();
      setDetectProgress(90);

      if (json.success && json.questions) {
        setQuestions(json.questions);
        if (json.lang) setDocLang(json.lang);
      }
    } catch (e: any) {
      setError("Erreur de détection : " + e.message);
    } finally {
      setDetectProgress(100);
      setIsDetecting(false);
    }
  }

  // ── File utilities ─────────────────────────────────────────────────────────

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function fileToBase64DataUrl(file: File): Promise<string> {
    return fileToBase64(file);
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  const evalLoaded = evalPages.length > 0 && !isDetecting;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-section">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Charger l'évaluation</h1>
          <p className="page-subtitle">
            Importez le fichier PDF ou image de l'évaluation IB. Le système détecte automatiquement toutes les questions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Upload zone */}
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={`drop-zone ${dragOver ? "drop-zone--active" : ""} ${evalLoaded ? "drop-zone--loaded" : ""}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
            {isDetecting ? (
              <div className="drop-zone-content">
                <div className="drop-zone-spinner">
                  <Loader2 size={40} className="animate-spin text-indigo-500" />
                </div>
                <div className="drop-zone-text">Analyse en cours…</div>
                <div className="drop-zone-sub">Détection intelligente des questions</div>
                {/* Progress bar */}
                <div className="progress-bar-outer">
                  <div className="progress-bar-inner" style={{ width: `${detectProgress}%` }} />
                </div>
                <div className="text-xs text-slate-400 mt-1">{detectProgress}%</div>
              </div>
            ) : evalLoaded ? (
              <div className="drop-zone-content">
                <div className="drop-zone-check">
                  <CheckCircle size={40} className="text-emerald-500" />
                </div>
                <div className="drop-zone-text text-emerald-700">{evalFileName}</div>
                <div className="drop-zone-sub">
                  {evalPages.length} page{evalPages.length > 1 ? "s" : ""} • {questions.length} question{questions.length > 1 ? "s" : ""} détectée{questions.length > 1 ? "s" : ""}
                </div>
                <div className="drop-zone-replace">
                  <RefreshCw size={13} /> Remplacer l'évaluation
                </div>
              </div>
            ) : (
              <div className="drop-zone-content">
                <div className="drop-zone-icon">
                  <Upload size={36} className="text-indigo-400" />
                </div>
                <div className="drop-zone-text">Glissez votre évaluation ici</div>
                <div className="drop-zone-sub">ou cliquez pour sélectionner un fichier</div>
                <div className="drop-zone-formats">
                  <span className="format-badge">PDF</span>
                  <span className="format-badge">JPG</span>
                  <span className="format-badge">PNG</span>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="alert-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Features */}
          {!evalLoaded && (
            <div className="feature-cards">
              <div className="feature-card">
                <Brain size={18} className="text-indigo-500" />
                <div>
                  <div className="feature-card-title">Détection IA</div>
                  <div className="feature-card-desc">Questions, tableaux, images, schémas</div>
                </div>
              </div>
              <div className="feature-card">
                <Zap size={18} className="text-amber-500" />
                <div>
                  <div className="feature-card-title">Ultra-rapide</div>
                  <div className="feature-card-desc">Groq + Gemini • 1-3 secondes</div>
                </div>
              </div>
            </div>
          )}

          {/* Language selector */}
          {evalLoaded && (
            <div className="card p-4 space-y-3">
              <div className="card-label">Langue de l'évaluation</div>
              <div className="flex gap-2">
                {["fr", "en"].map(lang => (
                  <button
                    key={lang}
                    onClick={() => setDocLang(lang)}
                    className={`lang-btn ${docLang === lang ? "lang-btn--active" : ""}`}
                  >
                    {lang === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview + Questions */}
        <div className="space-y-4">
          {/* Page preview */}
          {evalPages.length > 0 && (
            <div className="card overflow-hidden">
              <div className="card-header">
                <div className="card-header-title">
                  <Eye size={15} />
                  Aperçu — Page {previewPage + 1}/{evalPages.length}
                </div>
                {evalPages.length > 1 && (
                  <div className="flex gap-1">
                    {evalPages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewPage(i)}
                        className={`page-dot ${previewPage === i ? "page-dot--active" : ""}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="eval-preview-container">
                {evalPages[previewPage] && (
                  <img
                    src={evalPages[previewPage].base64}
                    alt={`Page ${previewPage + 1}`}
                    className="eval-preview-img"
                  />
                )}
                {/* Overlay question markers */}
                {questions
                  .filter(q => q.pageIndex === previewPage)
                  .map((q, i) => (
                    <div
                      key={q.id}
                      className="q-marker"
                      style={{ left: `${q.x}%`, top: `${q.y}%` }}
                      title={q.text}
                    >
                      {i + 1}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Questions list */}
          {questions.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-title">
                  <List size={15} />
                  Questions détectées ({questions.length})
                </div>
              </div>
              <div className="questions-list">
                {questions.map((q, i) => (
                  <div key={q.id} className="question-item">
                    <div className="question-num">{i + 1}</div>
                    <div className="question-body">
                      <div className="question-text">{q.text}</div>
                      <div className="question-meta">
                        <span className={`q-type-badge ${Q_TYPE_COLORS[q.type]}`}>
                          {Q_TYPE_ICONS[q.type]}
                          {Q_TYPE_LABELS[q.type]}
                        </span>
                        <span className="q-page-badge">Page {q.pageIndex + 1}</span>
                        {q.points !== undefined && (
                          <span className="q-points-badge">{q.points} pts</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      {evalLoaded && (
        <div className="cta-bar">
          <div className="cta-info">
            <CheckCircle size={18} className="text-emerald-500" />
            <span>
              <strong>{evalFileName}</strong> — {evalPages.length} pages, {questions.length} questions
            </span>
          </div>
          <button className="btn-primary" onClick={onContinue}>
            Choisir la classe & générer
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
