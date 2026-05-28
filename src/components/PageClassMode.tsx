/**
 * PageClassMode — Mode A: Génération pour toute une classe
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Users, UserPlus, Trash2, CheckSquare, Square, Play,
  Loader2, CheckCircle, XCircle, Clock, ChevronRight,
  Edit3, BarChart2, Eye, Settings, RefreshCw
} from "lucide-react";
import type {
  Section, Classe, Student, EvalPage, DetectedQuestion,
  StudentCopy, CriteriaLevel, StudentGenProgress, GenStatus
} from "../types";
import { makeStudent } from "../types";
import StudentCard from "./StudentCard";
import GenerationPanel from "./GenerationPanel";
import LevelSelector from "./LevelSelector";

interface Props {
  evalPages: EvalPage[];
  questions: DetectedQuestion[];
  section: Section;
  setSection: (s: Section) => void;
  classe: Classe;
  setClasse: (c: Classe) => void;
  students: Student[];
  setStudents: (s: Student[]) => void;
  selectedStudents: Student[];
  setSelectedStudents: (s: Student[]) => void;
  globalLevel: CriteriaLevel;
  setGlobalLevel: (l: CriteriaLevel) => void;
  isGenerating: boolean;
  genProgress: StudentGenProgress[];
  onLoadStudents: (sec: Section, cls: Classe) => Promise<void>;
  onSaveStudent: (s: Student) => Promise<Student>;
  onDeleteStudent: (s: Student) => Promise<void>;
  onGenerate: (students: Student[]) => Promise<void>;
  copies: StudentCopy[];
  onViewPreview: () => void;
}

const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: "garcons", label: "Garçons", emoji: "👦" },
  { id: "filles",  label: "Filles",  emoji: "👧" },
];

const CLASSES: Classe[] = ["PEI1", "PEI2", "PEI3", "PEI4", "PEI5"];

export default function PageClassMode({
  evalPages, questions,
  section, setSection,
  classe, setClasse,
  students, setStudents,
  selectedStudents, setSelectedStudents,
  globalLevel, setGlobalLevel,
  isGenerating, genProgress,
  onLoadStudents, onSaveStudent, onDeleteStudent, onGenerate,
  copies, onViewPreview,
}: Props) {
  const [showAddForm, setShowAddForm]   = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Load students when section/classe changes
  useEffect(() => {
    setLoadingStudents(true);
    setStudents([]);
    setSelectedStudents([]);
    onLoadStudents(section, classe).finally(() => setLoadingStudents(false));
  }, [section, classe]);

  // ── Selection ──────────────────────────────────────────────────────────────

  const allSelected = students.length > 0 && selectedStudents.length === students.length;
  const noneSelected = selectedStudents.length === 0;

  function toggleAll() {
    if (allSelected) setSelectedStudents([]);
    else setSelectedStudents([...students]);
  }

  function toggleStudent(s: Student) {
    const already = selectedStudents.some(x => x.name === s.name);
    if (already) setSelectedStudents(selectedStudents.filter(x => x.name !== s.name));
    else setSelectedStudents([...selectedStudents, s]);
  }

  function isSelected(s: Student) {
    return selectedStudents.some(x => x.name === s.name);
  }

  // ── Add student ────────────────────────────────────────────────────────────

  async function handleAddStudent() {
    const name = newStudentName.trim();
    if (!name) return;
    if (students.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      alert("Un élève avec ce nom existe déjà dans cette classe.");
      return;
    }
    setAddingStudent(true);
    try {
      const newStudent = makeStudent(name, section, classe);
      const saved = await onSaveStudent(newStudent);
      setStudents([...students, saved]);
      setSelectedStudents([...selectedStudents, saved]);
      setNewStudentName("");
      setShowAddForm(false);
    } finally {
      setAddingStudent(false);
    }
  }

  async function handleDelete(s: Student) {
    if (!confirm(`Supprimer ${s.name} de ${classe} ${section === "garcons" ? "Garçons" : "Filles"} ?`)) return;
    setDeletingId(s.name);
    try {
      await onDeleteStudent(s);
      setStudents(students.filter(x => x.name !== s.name));
      setSelectedStudents(selectedStudents.filter(x => x.name !== s.name));
    } finally {
      setDeletingId(null);
    }
  }

  // ── Status helpers ─────────────────────────────────────────────────────────

  const doneCount  = genProgress.filter(p => p.status === "done").length;
  const errorCount = genProgress.filter(p => p.status === "error").length;
  const genDone    = genProgress.length > 0 && doneCount + errorCount === genProgress.length && !isGenerating;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-section">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Classe entière</h1>
          <p className="page-subtitle">
            Sélectionnez une section et une classe, puis générez toutes les copies simultanément.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT: Section + Class + Students */}
        <div className="lg:col-span-2 space-y-4">

          {/* Section selector */}
          <div className="card p-4">
            <div className="card-label mb-3">Section</div>
            <div className="flex gap-3">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`section-btn ${section === s.id ? "section-btn--active" : ""}`}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="section-btn-label">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Class selector */}
          <div className="card p-4">
            <div className="card-label mb-3">Classe</div>
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

          {/* Students list */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-title">
                <Users size={15} />
                Élèves — {section === "garcons" ? "Garçons" : "Filles"} / {classe}
                {students.length > 0 && (
                  <span className="count-badge">{students.length}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {students.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="btn-ghost-sm"
                    title={allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                  >
                    {allSelected ? <CheckSquare size={15} className="text-indigo-600" /> : <Square size={15} />}
                    <span className="hidden sm:inline text-xs">
                      {allSelected ? "Désélectionner" : "Tout"}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => setShowAddForm(true)}
                  className="btn-ghost-sm text-indigo-600"
                >
                  <UserPlus size={15} />
                  <span className="hidden sm:inline text-xs">Ajouter</span>
                </button>
                <button
                  onClick={() => onLoadStudents(section, classe).then(() => {})}
                  className="btn-ghost-sm"
                  title="Actualiser"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="add-student-form">
                <input
                  autoFocus
                  className="input-field"
                  placeholder="Prénom Nom de l'élève…"
                  value={newStudentName}
                  onChange={e => setNewStudentName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleAddStudent();
                    if (e.key === "Escape") { setShowAddForm(false); setNewStudentName(""); }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddStudent}
                    disabled={addingStudent || !newStudentName.trim()}
                    className="btn-primary-sm"
                  >
                    {addingStudent ? <Loader2 size={13} className="animate-spin" /> : "Ajouter"}
                  </button>
                  <button
                    onClick={() => { setShowAddForm(false); setNewStudentName(""); }}
                    className="btn-ghost-sm"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Students */}
            <div className="students-list">
              {loadingStudents ? (
                <div className="students-loading">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                  <span>Chargement…</span>
                </div>
              ) : students.length === 0 ? (
                <div className="students-empty">
                  <Users size={32} className="text-slate-300" />
                  <div>Aucun élève dans cette classe</div>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="btn-ghost-sm text-indigo-600 mt-2"
                  >
                    <UserPlus size={14} /> Ajouter le premier élève
                  </button>
                </div>
              ) : (
                students.map(s => {
                  const prog = genProgress.find(p => p.studentName === s.name);
                  return (
                    <StudentCard
                      key={s.name}
                      student={s}
                      selected={isSelected(s)}
                      onToggle={() => toggleStudent(s)}
                      onDelete={() => handleDelete(s)}
                      isDeleting={deletingId === s.name}
                      genStatus={prog?.status}
                      genProgress={prog?.progress}
                    />
                  );
                })
              )}
            </div>

            {/* Selection summary */}
            {selectedStudents.length > 0 && (
              <div className="selection-summary">
                <CheckCircle size={14} className="text-indigo-500" />
                <span>{selectedStudents.length}/{students.length} élève{selectedStudents.length > 1 ? "s" : ""} sélectionné{selectedStudents.length > 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Settings + Generate */}
        <div className="space-y-4">
          {/* Level selector */}
          <LevelSelector
            value={globalLevel}
            onChange={setGlobalLevel}
          />

          {/* Generate panel */}
          <GenerationPanel
            selectedCount={selectedStudents.length}
            isGenerating={isGenerating}
            genProgress={genProgress}
            genDone={genDone}
            doneCount={doneCount}
            errorCount={errorCount}
            onGenerate={() => onGenerate(selectedStudents)}
            onViewPreview={onViewPreview}
            copies={copies}
          />

          {/* Stats card if done */}
          {genDone && doneCount > 0 && (
            <div className="card p-4 bg-emerald-50 border-emerald-200">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 size={16} className="text-emerald-600" />
                <span className="font-semibold text-emerald-800 text-sm">Génération terminée</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="stat-mini">
                  <div className="stat-mini-value text-emerald-700">{doneCount}</div>
                  <div className="stat-mini-label">Copies générées</div>
                </div>
                {errorCount > 0 && (
                  <div className="stat-mini">
                    <div className="stat-mini-value text-red-600">{errorCount}</div>
                    <div className="stat-mini-label">Erreurs</div>
                  </div>
                )}
              </div>
              <button
                onClick={onViewPreview}
                className="btn-primary w-full mt-3"
              >
                <Eye size={15} /> Voir les copies
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
