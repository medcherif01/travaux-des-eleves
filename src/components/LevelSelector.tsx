/**
 * LevelSelector — Sélecteur de niveau IB
 */

import React from "react";
import type { CriteriaLevel } from "../types";

interface Props {
  value: CriteriaLevel;
  onChange: (l: CriteriaLevel) => void;
}

const LEVELS: { value: CriteriaLevel; label: string; color: string; desc: string }[] = [
  { value: "7-8" as CriteriaLevel, label: "7–8", color: "level-7-8", desc: "Excellent" },
  { value: "5-6" as CriteriaLevel, label: "5–6", color: "level-5-6", desc: "Bien" },
  { value: "3-4" as CriteriaLevel, label: "3–4", color: "level-3-4", desc: "Passable" },
  { value: "1-2" as CriteriaLevel, label: "1–2", color: "level-1-2", desc: "Insuffisant" },
];

export default function LevelSelector({ value, onChange }: Props) {
  return (
    <div className="card p-4">
      <div className="card-label mb-3">Niveau IB global</div>
      <div className="grid grid-cols-2 gap-2">
        {LEVELS.map(l => (
          <button
            key={l.value}
            onClick={() => onChange(l.value)}
            className={`level-btn ${l.color} ${value === l.value ? "active" : ""}`}
          >
            <span className="level-btn-score">{l.label}</span>
            <span className="level-btn-desc">{l.desc}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Niveau de base — des variations naturelles seront appliquées par élève.
      </p>
    </div>
  );
}
