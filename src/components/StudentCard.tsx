/**
 * StudentCard — Carte élève dans la liste de classe
 */

import React from "react";
import { CheckSquare, Square, Trash2, Loader2, CheckCircle, XCircle, Clock, Zap } from "lucide-react";
import type { Student, GenStatus } from "../types";

interface Props {
  student: Student;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  genStatus?: GenStatus;
  genProgress?: number;
}

const STATUS_ICONS: Record<GenStatus, React.ReactNode> = {
  pending:    <Clock size={13} className="text-slate-400" />,
  generating: <Loader2 size={13} className="animate-spin text-indigo-500" />,
  done:       <CheckCircle size={13} className="text-emerald-500" />,
  error:      <XCircle size={13} className="text-red-500" />,
};

const STATUS_LABELS: Record<GenStatus, string> = {
  pending:    "En attente",
  generating: "Génération…",
  done:       "Terminé",
  error:      "Erreur",
};

export default function StudentCard({
  student, selected, onToggle, onDelete, isDeleting, genStatus, genProgress
}: Props) {
  return (
    <div
      className={`student-row ${selected ? "student-row--selected" : ""} ${genStatus === "done" ? "student-row--done" : ""}`}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div className="student-row-check">
        {selected
          ? <CheckSquare size={17} className="text-indigo-600" />
          : <Square size={17} className="text-slate-300" />
        }
      </div>

      {/* Avatar */}
      <div className={`student-avatar-sm ${selected ? "selected" : ""}`}>
        {student.name.charAt(0).toUpperCase()}
      </div>

      {/* Name */}
      <div className="student-row-name">{student.name}</div>

      {/* Generation status */}
      {genStatus && (
        <div className="student-row-status" onClick={e => e.stopPropagation()}>
          {STATUS_ICONS[genStatus]}
          <span className="text-xs text-slate-500 hidden sm:inline">{STATUS_LABELS[genStatus]}</span>
          {genStatus === "generating" && genProgress !== undefined && (
            <div className="gen-progress-mini">
              <div className="gen-progress-mini-fill" style={{ width: `${genProgress}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      <button
        className="student-row-delete"
        onClick={e => { e.stopPropagation(); onDelete(); }}
        disabled={isDeleting}
        title="Supprimer"
      >
        {isDeleting
          ? <Loader2 size={13} className="animate-spin" />
          : <Trash2 size={13} />
        }
      </button>
    </div>
  );
}
