/**
 * GenerationPanel — Panneau de génération avec barre de progression
 */

import React from "react";
import {
  Play, Loader2, CheckCircle, XCircle, Clock, Eye,
  Zap, BarChart2, AlertCircle
} from "lucide-react";
import type { StudentGenProgress, StudentCopy, GenStatus } from "../types";

interface Props {
  selectedCount: number;
  isGenerating: boolean;
  genProgress: StudentGenProgress[];
  genDone: boolean;
  doneCount: number;
  errorCount: number;
  onGenerate: () => void;
  onViewPreview: () => void;
  copies: StudentCopy[];
  singleMode?: boolean;
}

export default function GenerationPanel({
  selectedCount, isGenerating, genProgress,
  genDone, doneCount, errorCount,
  onGenerate, onViewPreview, copies, singleMode,
}: Props) {

  const total = genProgress.length;
  const overallPct = total === 0 ? 0
    : Math.round(genProgress.reduce((acc, p) => acc + p.progress, 0) / total);

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-amber-500" />
        <span className="font-semibold text-sm text-slate-800">
          {singleMode ? "Génération individuelle" : "Génération simultanée"}
        </span>
      </div>

      {/* Generate button */}
      {!isGenerating && !genDone && (
        <button
          onClick={onGenerate}
          disabled={selectedCount === 0}
          className="btn-primary w-full"
        >
          <Play size={16} />
          {selectedCount === 0
            ? "Sélectionnez des élèves"
            : singleMode
              ? "Générer la copie"
              : `Générer ${selectedCount} copie${selectedCount > 1 ? "s" : ""}`
          }
        </button>
      )}

      {/* Generating state */}
      {isGenerating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-indigo-500" />
              <span className="text-slate-700 font-medium">Génération en cours…</span>
            </div>
            <span className="text-slate-500 text-xs">{doneCount}/{total}</span>
          </div>

          {/* Global progress bar */}
          <div className="progress-bar-outer">
            <div className="progress-bar-inner" style={{ width: `${overallPct}%` }} />
          </div>
          <div className="text-right text-xs text-slate-400">{overallPct}%</div>

          {/* Per-student progress */}
          {genProgress.length > 0 && (
            <div className="gen-students-list">
              {genProgress.map((p, i) => (
                <div key={i} className="gen-student-row">
                  <GenStatusIcon status={p.status} />
                  <span className="gen-student-name truncate">{p.studentName}</span>
                  {p.status === "generating" && (
                    <div className="gen-progress-mini flex-shrink-0 w-16">
                      <div className="gen-progress-mini-fill" style={{ width: `${p.progress}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Done state */}
      {genDone && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle size={16} className="text-emerald-500" />
            <span className="font-medium text-sm">
              {doneCount} copie{doneCount > 1 ? "s" : ""} générée{doneCount > 1 ? "s" : ""}
              {errorCount > 0 && ` (${errorCount} erreur${errorCount > 1 ? "s" : ""})`}
            </span>
          </div>

          {/* Per-student final status */}
          <div className="gen-students-list">
            {genProgress.map((p, i) => (
              <div key={i} className="gen-student-row">
                <GenStatusIcon status={p.status} />
                <span className={`gen-student-name truncate ${p.status === "error" ? "text-red-600" : "text-slate-700"}`}>
                  {p.studentName}
                </span>
                {p.error && <span className="text-xs text-red-500 truncate">{p.error}</span>}
              </div>
            ))}
          </div>

          <button onClick={onViewPreview} className="btn-primary w-full">
            <Eye size={15} />
            Voir les copies
          </button>

          {/* Regenerate */}
          <button
            onClick={onGenerate}
            className="btn-ghost w-full text-xs"
          >
            Régénérer
          </button>
        </div>
      )}
    </div>
  );
}

function GenStatusIcon({ status }: { status: GenStatus }) {
  switch (status) {
    case "pending":    return <Clock size={13} className="text-slate-400 flex-shrink-0" />;
    case "generating": return <Loader2 size={13} className="animate-spin text-indigo-500 flex-shrink-0" />;
    case "done":       return <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />;
    case "error":      return <XCircle size={13} className="text-red-500 flex-shrink-0" />;
  }
}
