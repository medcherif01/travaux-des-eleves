/**
 * nanobanana PRO — Application principale
 * Architecture moderne : sidebar + pages distinctes
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, Users, User, Eye, Printer, BookOpen, ChevronRight,
  GraduationCap, Sparkles, Settings, LogOut, Menu, X, CheckCircle,
  AlertCircle, Clock, Zap
} from "lucide-react";

import type {
  AppPage, WorkMode, Section, Classe, Student, DetectedQuestion,
  EvalPage, StudentCopy, CriteriaLevel, StudentGenProgress, GenStatus
} from "./types";
import { makeStudent, makeStudentCopy } from "./types";
import { buildPrintHTML } from "./utils/printHTML";

// ── Sub-pages ──────────────────────────────────────────────────────────────────
import PageUpload     from "./components/PageUpload";
import PageClassMode  from "./components/PageClassMode";
import PageStudentMode from "./components/PageStudentMode";
import PagePreview    from "./components/PagePreview";

// ── App shell ─────────────────────────────────────────────────────────────────

export default function App() {
  // Navigation
  const [page, setPage]         = useState<AppPage>("upload");
  const [workMode, setWorkMode] = useState<WorkMode>("class");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Eval data
  const [evalPages,   setEvalPages]   = useState<EvalPage[]>([]);
  const [questions,   setQuestions]   = useState<DetectedQuestion[]>([]);
  const [docLang,     setDocLang]     = useState<string>("fr");
  const [evalFileName,setEvalFileName]= useState<string>("");
  const [isDetecting, setIsDetecting] = useState(false);

  // Class selection
  const [section,  setSection]  = useState<Section>("garcons");
  const [classe,   setClasse]   = useState<Classe>("PEI1");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [globalLevel, setGlobalLevel] = useState<CriteriaLevel>("5-6" as CriteriaLevel);

  // Single student
  const [singleStudent, setSingleStudent] = useState<Student | null>(null);

  // Generation
  const [copies, setCopies]           = useState<StudentCopy[]>([]);
  const [genProgress, setGenProgress] = useState<StudentGenProgress[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewCopyIdx, setPreviewCopyIdx] = useState(0);

  // ── API helpers ──────────────────────────────────────────────────────────────

  const apiBase = "";  // same origin

  async function loadStudents(sec: Section, cls: Classe) {
    try {
      const r = await fetch(`${apiBase}/api/students?section=${sec}&classe=${cls}`);
      const j = await r.json();
      if (j.success) setStudents(j.students || []);
    } catch { setStudents([]); }
  }

  async function saveStudent(s: Student): Promise<Student> {
    const r = await fetch(`${apiBase}/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    const j = await r.json();
    return j.student || s;
  }

  async function deleteStudent(s: Student) {
    await fetch(`${apiBase}/api/students?name=${encodeURIComponent(s.name)}&section=${s.section}&classe=${s.classe}`, {
      method: "DELETE",
    });
    await loadStudents(section, classe);
  }

  // ── Generate copies ──────────────────────────────────────────────────────────

  async function generateCopies(targetStudents: Student[]) {
    if (!evalPages.length || !questions.length) {
      alert("Veuillez d'abord charger et analyser une évaluation.");
      return;
    }
    setIsGenerating(true);
    setGenProgress(targetStudents.map(s => ({
      studentName: s.name, status: "pending", progress: 0
    })));
    setCopies([]);

    const newCopies: StudentCopy[] = [];

    // Process students in parallel batches of 3
    const batchSize = 3;
    for (let i = 0; i < targetStudents.length; i += batchSize) {
      const batch = targetStudents.slice(i, i + batchSize);
      await Promise.all(batch.map(async (student, bIdx) => {
        const globalIdx = i + bIdx;
        const copy = makeStudentCopy(student, globalLevel);

        // Update status → generating
        setGenProgress(prev => {
          const next = [...prev];
          next[globalIdx] = { ...next[globalIdx], status: "generating", progress: 20 };
          return next;
        });

        try {
          // Step 1: Generate answers
          const answersRes = await fetch(`${apiBase}/api/generate-answers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questions,
              evalPages: evalPages.map(p => ({ pageIndex: p.pageIndex, base64: p.base64 })),
              studentName: student.name,
              criteriaLevel: globalLevel,
              seed: copy.seed,
              lang: docLang,
            }),
          });
          const answersJson = await answersRes.json();

          setGenProgress(prev => {
            const next = [...prev];
            next[globalIdx] = { ...next[globalIdx], progress: 50 };
            return next;
          });

          if (answersJson.success && answersJson.answers) {
            copy.answers = answersJson.answers;
          }

          // Step 2: Generate teacher comments
          const commentsRes = await fetch(`${apiBase}/api/generate-comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questions,
              answers: copy.answers,
              studentName: student.name,
              criteriaLevel: globalLevel,
              lang: docLang,
            }),
          });
          const commentsJson = await commentsRes.json();

          setGenProgress(prev => {
            const next = [...prev];
            next[globalIdx] = { ...next[globalIdx], progress: 75 };
            return next;
          });

          if (commentsJson.success && commentsJson.comments) {
            copy.comments = commentsJson.comments;
          }

          // Step 3: Compute grade from level
          const levelNotes: Record<string, number> = { "7-8": 7, "5-6": 5, "3-4": 3, "1-2": 1 };
          const baseNote = levelNotes[globalLevel] || 5;
          // Add small per-student variation
          const variation = (copy.seed % 3) - 1; // -1, 0, +1
          const note = Math.min(8, Math.max(0, baseNote + variation)) as any;
          const appreciations: Record<number, string> = {
            8: "Excellent", 7: "Très bien", 6: "Bien", 5: "Assez bien",
            4: "Satisfaisant", 3: "Passable", 2: "Insuffisant", 1: "Très insuffisant", 0: "Non rendu"
          };
          copy.grade = {
            note,
            ibLevel: globalLevel as any,
            ibSymbol: note >= 6 ? "✓" : note >= 4 ? "~" : "✗",
            appreciation: appreciations[note] || "Satisfaisant",
          };
          copy.generatedAt = new Date();

          newCopies[globalIdx] = copy;
          setGenProgress(prev => {
            const next = [...prev];
            next[globalIdx] = { ...next[globalIdx], status: "done", progress: 100 };
            return next;
          });

        } catch (err: any) {
          setGenProgress(prev => {
            const next = [...prev];
            next[globalIdx] = { ...next[globalIdx], status: "error", progress: 0, error: err.message };
            return next;
          });
          newCopies[globalIdx] = copy; // keep empty copy
        }
      }));

      // After each batch, update copies state
      setCopies([...newCopies]);
    }

    setIsGenerating(false);
    const validCopies = newCopies.filter(Boolean);
    setCopies(validCopies);
    if (validCopies.length > 0) {
      setPreviewCopyIdx(0);
      setPage("preview");
    }
  }

  // ── Print ────────────────────────────────────────────────────────────────────

  function printCopy(copy: StudentCopy) {
    const html = buildPrintHTML(copy, evalPages, questions, evalFileName);
    const win  = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 800);
  }

  function printAllCopies() {
    copies.forEach((copy, i) => {
      setTimeout(() => printCopy(copy), i * 500);
    });
  }

  // ── Navigation helpers ───────────────────────────────────────────────────────

  const evalLoaded = evalPages.length > 0 && questions.length > 0;

  const navItems: { id: AppPage; icon: React.ReactNode; label: string; disabled?: boolean }[] = [
    { id: "upload",  icon: <Upload size={18} />,       label: "Évaluation" },
    { id: "class",   icon: <Users size={18} />,        label: "Classe entière",  disabled: !evalLoaded },
    { id: "student", icon: <User size={18} />,         label: "Élève individuel", disabled: !evalLoaded },
    { id: "preview", icon: <Eye size={18} />,          label: "Aperçu",          disabled: copies.length === 0 },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="app-root">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <GraduationCap size={22} color="white" />
          </div>
          <div>
            <div className="sidebar-logo-title">EvalIB Pro</div>
            <div className="sidebar-logo-sub">Évaluations IB</div>
          </div>
        </div>

        {/* Eval indicator */}
        {evalLoaded && (
          <div className="sidebar-eval-badge">
            <BookOpen size={14} />
            <span className="truncate text-xs">{evalFileName || "Évaluation chargée"}</span>
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { if (!item.disabled) { setPage(item.id); setSidebarOpen(false); } }}
              disabled={item.disabled}
              className={`sidebar-nav-item ${page === item.id ? "active" : ""} ${item.disabled ? "disabled" : ""}`}
            >
              {item.icon}
              <span>{item.label}</span>
              {page === item.id && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </nav>

        {/* Stats */}
        {copies.length > 0 && (
          <div className="sidebar-stats">
            <div className="sidebar-stats-title">Session active</div>
            <div className="sidebar-stat">
              <span>{copies.length}</span>
              <span>copies générées</span>
            </div>
            <div className="sidebar-stat">
              <span>{evalPages.length}</span>
              <span>pages d'éval</span>
            </div>
          </div>
        )}

        {/* Bottom */}
        <div className="sidebar-bottom">
          <div className="sidebar-version">v2.0 • IB Platform</div>
        </div>
      </aside>

      {/* Main content */}
      <div className="main-wrapper">
        {/* Top header */}
        <header className="topbar">
          <button className="topbar-menu-btn lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="topbar-breadcrumb">
            <span className="topbar-breadcrumb-root">EvalIB Pro</span>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="topbar-breadcrumb-page">
              {navItems.find(n => n.id === page)?.label || ""}
            </span>
          </div>
          <div className="topbar-actions">
            {evalLoaded && (
              <div className="topbar-eval-pill">
                <CheckCircle size={14} className="text-emerald-500" />
                <span>{questions.length} questions • {evalPages.length} pages</span>
              </div>
            )}
            {copies.length > 0 && (
              <button
                className="btn-icon-sm"
                onClick={printAllCopies}
                title="Imprimer toutes les copies"
              >
                <Printer size={16} />
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="page-content">
          {page === "upload" && (
            <PageUpload
              evalPages={evalPages}
              setEvalPages={setEvalPages}
              questions={questions}
              setQuestions={setQuestions}
              docLang={docLang}
              setDocLang={setDocLang}
              evalFileName={evalFileName}
              setEvalFileName={setEvalFileName}
              isDetecting={isDetecting}
              setIsDetecting={setIsDetecting}
              onContinue={() => setPage("class")}
            />
          )}

          {page === "class" && (
            <PageClassMode
              evalPages={evalPages}
              questions={questions}
              section={section}
              setSection={setSection}
              classe={classe}
              setClasse={setClasse}
              students={students}
              setStudents={setStudents}
              selectedStudents={selectedStudents}
              setSelectedStudents={setSelectedStudents}
              globalLevel={globalLevel}
              setGlobalLevel={setGlobalLevel}
              isGenerating={isGenerating}
              genProgress={genProgress}
              onLoadStudents={loadStudents}
              onSaveStudent={saveStudent}
              onDeleteStudent={deleteStudent}
              onGenerate={generateCopies}
              copies={copies}
              onViewPreview={() => setPage("preview")}
            />
          )}

          {page === "student" && (
            <PageStudentMode
              evalPages={evalPages}
              questions={questions}
              section={section}
              setSection={setSection}
              classe={classe}
              setClasse={setClasse}
              students={students}
              singleStudent={singleStudent}
              setSingleStudent={setSingleStudent}
              globalLevel={globalLevel}
              setGlobalLevel={setGlobalLevel}
              isGenerating={isGenerating}
              genProgress={genProgress}
              onLoadStudents={loadStudents}
              onSaveStudent={saveStudent}
              onGenerate={(s) => generateCopies([s])}
              copies={copies}
              onViewPreview={() => setPage("preview")}
            />
          )}

          {page === "preview" && (
            <PagePreview
              copies={copies}
              setCopies={setCopies}
              evalPages={evalPages}
              questions={questions}
              evalFileName={evalFileName}
              previewCopyIdx={previewCopyIdx}
              setPreviewCopyIdx={setPreviewCopyIdx}
              onPrint={printCopy}
              onPrintAll={printAllCopies}
            />
          )}
        </main>
      </div>
    </div>
  );
}
