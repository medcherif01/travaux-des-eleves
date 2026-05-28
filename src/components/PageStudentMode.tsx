/**
 * PageStudentMode — Mode B: Génération pour un seul élève
 */

import React, { useState, useEffect } from "react";
import {
  User, UserPlus, ChevronRight, Loader2, Play, Eye,
  CheckCircle, RefreshCw
} from "lucide-react";
import type {
  Section, Classe, Student, EvalPage, DetectedQuestion,
  StudentCopy, CriteriaLevel, StudentGenProgress
} from "../types";
import { makeStudent } from "../types";
import LevelSelector from "./LevelSelector";
import GenerationPanel from "./GenerationPanel";

interface Props {
  evalPages: EvalPage[];
  questions: DetectedQuestion[];
  section: Section;
  setSection: (s: Section) => void;
  classe: Classe;
  setClasse: (c: Classe) => void;
  students: Student[];
  singleStudent: Student | null;
  setSingleStudent: (s: Student | null) => void;
  globalLevel: CriteriaLevel;
  setGlobalLevel: (l: CriteriaLevel) => void;
  isGenerating: boolean;
  genProgress: StudentGenProgress[];
  onLoadStudents: (sec: Section, cls: Classe) => Promise<void>;
  onSaveStudent: (s: Student) => Promise<Student>;
  onGenerate: (s: Student) => Promise<void>;
  copies: StudentCopy[];
  onViewPreview: () => void;
}

const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: "garcons", label: "Garçons", emoji: "👦" },
  { id: "filles",  label: "Filles",  emoji: "👧" },
];

const CLASSES: Classe[] = ["PEI1", "PEI2", "PEI3", "PEI4", "PEI5"];

export default function PageStudentMode({
  evalPages, questions,
  section, setSection,
  classe, setClasse,
  students,
  singleStudent, setSingleStudent,
  globalLevel, setGlobalLevel,
  isGenerating, genProgress,
  onLoadStudents, onSaveStudent, onGenerate,
  copies, onViewPreview,
}: Props) {
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);
  const [step, setStep] = useState<"pick" | "generate">("pick");

  useEffect(() => {
    setLoadingStudents(true);
    setSingleStudent(null);
    setStep("pick");
    onLoadStudents(section, classe).finally(() => setLoadingStudents(false));
  }, [section, classe]);

  async function handleAddNew() {
    const name = newName.trim();
    if (!name) return;
    setAddingStudent(true);
    try {
      const s = makeStudent(name, section, classe);
      const saved = await onSaveStudent(s);
      setSingleStudent(saved);
      setShowNewForm(false);
      setNewName("");
      setStep("generate");
    } finally {
      setAddingStudent(false);
    }
  }

  function selectStudent(s: Student) {
    setSingleStudent(s);
    setStep("generate");
  }

  const genDone  = genProgress.length > 0 && genProgress.every(p => p.status === "done" || p.status === "error") && !isGenerating;
  const doneCount = genProgress.filter(p => p.status === "done").length;
  const errCount  = genProgress.filter(p => p.status === "error").length;

  return (
    <div className="page-section">
      <div className="page-header">
        <div>
          <h1 className="page-title">Élève individuel</h1>
          <p className="page-subtitle">
            Sélectionnez ou ajoutez un élève et générez sa copie personnalisée.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pick student */}
        <div className="lg:col-span-2 space-y-4">

          {/* Section + Classe */}
          <div className="card p-4 space-y-4">
            <div>
              <div className="card-label mb-2">Section</div>
              <div className="flex gap-3">
                {SECTIONS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSection(s.id)}
                    className={`section-btn ${section === s.id ? "section-btn--active" : ""}`}
                  >
                    <span className="text-xl">{s.emoji}</span>
                    <span className="section-btn-label">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="card-label mb-2">Classe</div>
              <div className="flex gap-2 flex-wrap">
                {CLASSES.map(c => (
                  <button
                    key={c}
                    onClick={() => setClasse(c)}
                    className={`class-btn ${classe === c ? "class-btn--active" : ""}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Student selection */}
          {step === "pick" && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-title">
                  <User size={15} />
                  Choisir un élève
                </div>
                <button
                  onClick={() => setShowNewForm(v => !v)}
                  className="btn-ghost-sm text-indigo-600"
                >
                  <UserPlus size={14} /> Nouveau
                </button>
              </div>

              {/* New student form */}
              {showNewForm && (
                <div className="add-student-form">
                  <input
                    autoFocus
                    className="input-field"
                    placeholder="Prénom Nom…"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleAddNew();
                      if (e.key === "Escape") { setShowNewForm(false); setNewName(""); }
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddNew}
                      disabled={addingStudent || !newName.trim()}
                      className="btn-primary-sm"
                    >
                      {addingStudent ? <Loader2 size={13} className="animate-spin" /> : "Créer & Sélectionner"}
                    </button>
                    <button onClick={() => { setShowNewForm(false); setNewName(""); }} className="btn-ghost-sm">
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {/* Students grid */}
              <div className="p-4">
                {loadingStudents ? (
                  <div className="students-loading">
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                    <span>Chargement…</span>
                  </div>
                ) : students.length === 0 ? (
                  <div className="students-empty">
                    <User size={28} className="text-slate-300" />
                    <div className="text-sm text-slate-500">Aucun élève dans cette classe</div>
                    <button
                      onClick={() => setShowNewForm(true)}
                      className="btn-ghost-sm text-indigo-600 mt-2"
                    >
                      <UserPlus size={13} /> Ajouter un élève
                    </button>
                  </div>
                ) : (
                  <div className="student-grid">
                    {students.map(s => (
                      <button
                        key={s.name}
                        onClick={() => selectStudent(s)}
                        className="student-grid-item"
                      >
                        <div className="student-avatar">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="student-grid-name">{s.name}</div>
                        <ChevronRight size={13} className="text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Selected student + generate */}
          {step === "generate" && singleStudent && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="student-avatar-lg">
                    {singleStudent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{singleStudent.name}</div>
                    <div className="text-sm text-slate-500">
                      {section === "garcons" ? "Garçons" : "Filles"} / {classe}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setSingleStudent(null); setStep("pick"); }}
                  className="btn-ghost-sm"
                >
                  Changer
                </button>
              </div>

              {genDone && doneCount > 0 && (
                <div className="alert-success mb-4">
                  <CheckCircle size={16} />
                  <span>Copie de <strong>{singleStudent.name}</strong> générée avec succès !</span>
                </div>
              )}

              {!isGenerating && !genDone && (
                <button
                  onClick={() => onGenerate(singleStudent)}
                  className="btn-primary w-full"
                  disabled={!evalPages.length}
                >
                  <Play size={16} />
                  Générer la copie de {singleStudent.name}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right */}
        <div className="space-y-4">
          <LevelSelector value={globalLevel} onChange={setGlobalLevel} />

          <GenerationPanel
            selectedCount={singleStudent ? 1 : 0}
            isGenerating={isGenerating}
            genProgress={genProgress}
            genDone={genDone}
            doneCount={doneCount}
            errorCount={errCount}
            onGenerate={() => singleStudent && onGenerate(singleStudent)}
            onViewPreview={onViewPreview}
            copies={copies}
            singleMode
          />
        </div>
      </div>
    </div>
  );
}
