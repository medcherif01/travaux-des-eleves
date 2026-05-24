/**
 * nanobanana PRO v4 — Realistic student worksheet engine
 * FIXED in v4:
 *  1. Answers auto-placed directly on eval pages (no manual input area needed)
 *  2. Print via window.open() — never blank
 *  3. Multi-student batch: one eval → N students, each with own handwriting/level
 *  4. Teacher comments: fully draggable, color/font/size configurable, visible in red/green
 *  5. Art/drawing pages: auto-detected, accepts image upload or leaves blank
 *  6. Student name written in their own handwriting on page 1
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Sparkles, RotateCcw, CheckCircle, AlertCircle,
  Edit3, RefreshCw, User, Users, Plus, Trash2, ChevronLeft, ChevronRight,
  Save, Printer, Move, BookOpen, Zap, Sliders, Eye,
  PenTool, Triangle, Circle, Minus, MessageSquare, X, Settings,
  ToggleLeft, ToggleRight, Eraser, Image, Palette, Search,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRELOADED_TEMPLATES, EXAM_CRITERIA_LEVELS } from "./templates";
import { CriteriaLevel } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface HandwritingFingerprint {
  suggestedFont: string; suggestedColor: string; suggestedSize: number;
  letterSpacingEm: number; wordSpacingPx: number; lineHeightMultiplier: number;
  suggestedRotation: number; baselineWobbleAmp: number; baselineWobbleFreq: number;
  letterRotVariance: number; letterYVariance: number; letterXVariance: number;
  penThickness: number; inkOpacityMin: number; inkOpacityMax: number;
  inkDrySkipRate: number; inkBleedRadius: number; messinessIntensity: number;
  letterSizeVariance: number; letterCaseChaos: boolean; enableUnreadableLetters: boolean;
  inferredRaturesRate: number; inferredBlancoRate: number; inferredSmudgeFreq: number;
  letterShapeFingerprint: number[]; analysisDescription: string; confidenceScore: number;
}

interface StudentProfile {
  _id?: string; name: string;
  hwImage: string | null; hwImageBase64?: string; hwImageName: string;
  fontKey: string; inkColor: string; fontSize: number;
  rotationAngle: number; skewAngle: number; wordDrift: number;
  letterSpacing: number; messinessIntensity: number;
  enableUnreadableLetters: boolean; letterCaseChaos: boolean;
  inkDrySkipping: boolean; penThickness: number;
  penType: "ballpoint" | "gel" | "felt" | "pencil";
  enableRatures: boolean; raturesRate: number;
  enableBlanco: boolean; blancoRate: number;
  enableSmudges: boolean; enablePressureVar: boolean;
  enableLineWobble: boolean; lineWobbleAmp: number;
  fingerprint?: HandwritingFingerprint;
  analysisDescription?: string; confidenceScore?: number;
}

interface DetectedQuestion {
  id: string; text: string; pageIndex: number;
  x: number; y: number; maxWidth?: number;
}

interface EvalPage { base64: string; pageNum: number; }

/** A student+level combo for batch generation */
interface BatchStudent {
  id: string;
  profile: StudentProfile;
  criteriaLevel: CriteriaLevel;
  answers: Record<string, string>;
  comments: TeacherComment[];
  offsets: Record<string, { x: number; y: number }>;
  isGenerating: boolean;
  isDone: boolean;
}

/** Teacher comment (red/custom ink annotation) */
interface TeacherComment {
  qId: string; text: string; symbol?: string;
  position: "above" | "right" | "below" | "margin";
  style?: "check" | "cross" | "circle" | "underline" | "arrow";
  ox: number; oy: number;          // SVG coordinate offsets
  teacherFontKey: string;
  teacherFontSize: number;
  teacherColor: string;
}

interface GeometryShape {
  id: string; pageIndex: number;
  type: "line" | "circle" | "arc" | "rectangle" | "triangle";
  x1: number; y1: number; x2?: number; y2?: number;
  x3?: number; y3?: number; radius?: number;
  startAngle?: number; endAngle?: number;
  label?: string; strokeColor?: string; strokeWidth?: number; pencilNoise?: number;
}

interface PageEffectOverrides {
  showRatures: boolean; showBlanco: boolean; showSmudges: boolean;
  showPressure: boolean; showWobble: boolean; showComments: boolean;
  showGeometry: boolean;
}

type WorkflowStep = "import" | "students" | "grade" | "solve" | "preview" | "print";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const HANDWRITING_FONTS = [
  { key: "homemade-apple",  label: "Écolier",     family: "Homemade Apple",  cssVar: "--font-homemade"   },
  { key: "marck-script",    label: "Feutre",      family: "Marck Script",    cssVar: "--font-marck"     },
  { key: "parisienne",      label: "Fine",        family: "Parisienne",      cssVar: "--font-parisienne" },
  { key: "allura",          label: "Fluide",      family: "Allura",          cssVar: "--font-allura"    },
  { key: "la-belle-aurore", label: "Stylée",      family: "La Belle Aurore", cssVar: "--font-la-belle"  },
  { key: "bad-script",      label: "Plume",       family: "Bad Script",      cssVar: "--font-badscript" },
];

const INK_COLORS = [
  { label: "Bleu stylo",   value: "#1d3278" }, { label: "Bleu royal",   value: "#1e40af" },
  { label: "Bleu marine",  value: "#172554" }, { label: "Noir encre",   value: "#1c1c1e" },
  { label: "Rouge",        value: "#be0000" }, { label: "Vert forêt",  value: "#0a7a2a" },
  { label: "Violet",       value: "#6b21a8" }, { label: "Indigo",       value: "#3730a3" },
];

const TEACHER_COLORS = [
  { label: "Rouge",  value: "#cc0000" }, { label: "Vert",   value: "#15803d" },
  { label: "Violet", value: "#7c3aed" }, { label: "Bleu",   value: "#1d4ed8" },
  { label: "Orange", value: "#c2410c" }, { label: "Noir",   value: "#111111" },
];

const DEFAULT_TEACHER_FONT     = "homemade-apple";
const DEFAULT_TEACHER_COLOR    = "#cc0000";
const DEFAULT_TEACHER_FONTSIZE = 2.8;

const FONT_KEY_MAP: Record<string, string> = {
  "homemade apple": "homemade-apple", "marck script": "marck-script",
  parisienne: "parisienne", allura: "allura",
  "la belle aurore": "la-belle-aurore", "bad script": "bad-script",
};
const COLOR_MAP: Record<string, string> = {
  blue: "#1d3278", black: "#1c1c1e", red: "#be0000", green: "#0a7a2a",
};

const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: "import",   label: "Importer"  },
  { key: "students", label: "Élèves"    },
  { key: "grade",    label: "Niveau"    },
  { key: "solve",    label: "Résoudre"  },
  { key: "preview",  label: "Aperçu"    },
  { key: "print",    label: "Imprimer"  },
];

function getFontVar(key: string)    { return HANDWRITING_FONTS.find(f => f.key === key)?.cssVar   ?? "--font-homemade"; }
function getFontFamily(key: string) { return HANDWRITING_FONTS.find(f => f.key === key)?.family   ?? "Homemade Apple"; }

function defaultProfile(name = "Élève 1"): StudentProfile {
  return {
    name, hwImage: null, hwImageBase64: "", hwImageName: "",
    fontKey: "homemade-apple", inkColor: "#1d3278",
    fontSize: 17, rotationAngle: -0.5, skewAngle: -3,
    wordDrift: 1.5, letterSpacing: -0.5, messinessIntensity: 2.5,
    enableUnreadableLetters: true, letterCaseChaos: true,
    inkDrySkipping: true, penThickness: 1.5, penType: "ballpoint",
    enableRatures: true, raturesRate: 0.04,
    enableBlanco: false, blancoRate: 0.02,
    enableSmudges: true, enablePressureVar: true,
    enableLineWobble: true, lineWobbleAmp: 1.8,
  };
}

function defaultEffects(): PageEffectOverrides {
  return {
    showRatures: true, showBlanco: true, showSmudges: true,
    showPressure: true, showWobble: true, showComments: true, showGeometry: true,
  };
}

function makeBatchStudent(profile: StudentProfile, level: CriteriaLevel): BatchStudent {
  return {
    id: `bs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    profile, criteriaLevel: level,
    answers: {}, comments: [], offsets: {},
    isGenerating: false, isDone: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC HASH
// ─────────────────────────────────────────────────────────────────────────────
function dHash(str: string, idx = 0): number {
  let h = 0; const s = str + idx;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h) / 2_147_483_647;
}
function sSeed(a: string, b: string | number, idx = 0): number { return dHash(`${a}_${b}_${idx}`, idx); }
function fpOff(fp: number[] | undefined, i: number): number {
  if (!fp || fp.length < 16) return 0;
  return (fp[i % 16] - 0.5) * 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP BAR
// ─────────────────────────────────────────────────────────────────────────────
function StepBar({ current, onGoto }: { current: WorkflowStep; onGoto: (s: WorkflowStep) => void }) {
  const ci = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap py-2 px-4">
      {STEPS.map((s, i) => {
        const active = s.key === current, done = i < ci;
        return (
          <React.Fragment key={s.key}>
            <button onClick={() => done && onGoto(s.key)}
              className={`flex items-center gap-1 px-3 py-1 rounded-xl border-2 text-[11px] font-black transition-all
                ${active ? "bg-yellow-400 border-black text-black shadow-[2px_2px_0_rgba(0,0,0,1)]"
                  : done ? "bg-black border-black text-yellow-400 cursor-pointer"
                  : "bg-white border-black/20 text-black/30 cursor-not-allowed"}`}>
              {done && <CheckCircle className="h-3 w-3" />}{s.label}
            </button>
            {i < STEPS.length - 1 && <div className={`w-4 h-0.5 ${i < ci ? "bg-black" : "bg-black/15"}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PENCIL SVG FILTER DEFS
// ─────────────────────────────────────────────────────────────────────────────
function PencilDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`pencil-${id}`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9 0.4" numOctaves="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.35" xChannelSelector="R" yChannelSelector="G" result="displaced" />
        <feGaussianBlur in="displaced" stdDeviation="0.08" />
      </filter>
      <filter id={`ink-blur-${id}`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.1" />
      </filter>
      <filter id={`smudge-${id}`} x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85 0.55" numOctaves="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.45" />
      </filter>
      <marker id={`arrow-${id}`} markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
        <path d="M0,0 L4,2 L0,4 Z" fill="#cc0000" />
      </marker>
    </defs>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDWRITTEN TEXT — per-letter deformation engine
// ─────────────────────────────────────────────────────────────────────────────
function HandwrittenText({ text, qId, profile, variantSeed, effects }: {
  text: string; qId: string; profile: StudentProfile;
  variantSeed: number; effects: PageEffectOverrides;
}) {
  if (!text) return null;
  const fp = profile.fingerprint;
  const useFP = !!fp && (fp.confidenceScore ?? 0) >= 55;

  const baseSeed   = sSeed(profile.name + variantSeed, qId);
  const fontSize   = useFP ? Math.max(11, fp.suggestedSize + (baseSeed * 1.5 - 0.75)) : Math.max(11, profile.fontSize + (baseSeed * 2 - 1));
  const slant      = useFP ? fp.suggestedRotation : profile.skewAngle;
  const inkCol     = profile.inkColor;
  const fontKey    = profile.fontKey;
  const wobbleAmp  = effects.showWobble ? (useFP ? fp.baselineWobbleAmp : profile.lineWobbleAmp) : 0;
  const wobbleFreq = useFP ? fp.baselineWobbleFreq : 2.1;
  const opacMin    = effects.showPressure ? (useFP ? fp.inkOpacityMin : 0.72) : 1;
  const opacMax    = effects.showPressure ? (useFP ? fp.inkOpacityMax : 1.0) : 1;
  const dryRate    = useFP ? fp.inkDrySkipRate : 0.06;
  const lRotVar    = useFP ? fp.letterRotVariance  : profile.messinessIntensity * 1.8;
  const lYVar      = useFP ? fp.letterYVariance    : profile.messinessIntensity * 0.6;
  const lXVar      = useFP ? fp.letterXVariance    : profile.messinessIntensity * 0.2;
  const lSzVar     = useFP ? fp.letterSizeVariance : profile.messinessIntensity * 0.35;
  const lSpEm      = useFP ? fp.letterSpacingEm    : profile.letterSpacing / 17;
  const wSpPx      = useFP ? fp.wordSpacingPx      : 5 + profile.messinessIntensity;
  const lHeight    = useFP ? fp.lineHeightMultiplier : 1.6;
  const caseChaos  = useFP ? fp.letterCaseChaos   : profile.letterCaseChaos;
  const unread     = useFP ? fp.enableUnreadableLetters : profile.enableUnreadableLetters;
  const messy      = useFP ? fp.messinessIntensity : profile.messinessIntensity;

  const lines = text.split("\n");
  return (
    <div className="select-none" style={{ lineHeight: `${fontSize * lHeight}px` }}>
      {lines.map((line, li) => {
        const words = line.split(/\s+/).filter(Boolean);
        const fpWobble  = fp ? fpOff(fp.letterShapeFingerprint, li + 8) * 0.6 : 0;
        const lineWobble = wobbleAmp > 0 ? Math.sin(li * wobbleFreq + baseSeed * 6) * wobbleAmp + fpWobble : 0;
        return (
          <div key={li} className="flex flex-wrap" style={{ transform: `translateY(${lineWobble}px)` }}>
            {words.map((word, wi) => {
              const wSeed   = sSeed(profile.name + word + li, wi + variantSeed * 3);
              const fpWordY = fp ? fpOff(fp.letterShapeFingerprint, wi % 16) * 0.8 : 0;
              const wordY   = (wSeed - 0.5) * 2 * Math.min(messy, 5) * 0.35 + fpWordY;
              const wordRot = (wSeed * 0.6 - 0.3) * Math.min(messy, 5) * 0.12;
              const wordMR  = Math.max(2, wSpPx + (wSeed - 0.5) * 3);
              const letters = word.split("").map((ch, ci) => {
                const cs   = sSeed(profile.name + ch + wi, ci + li * 100 + variantSeed);
                const fpSlot = fp ? fp.letterShapeFingerprint[(ci + wi * 3) % 16] : 0.5;
                const csFp = cs * 0.6 + fpSlot * 0.4;
                let finalCh = ch;
                if (caseChaos && csFp > 0.88 && ch.toLowerCase() !== ch.toUpperCase())
                  finalCh = csFp > 0.94 ? ch.toUpperCase() : ch;
                if (unread && messy > 4 && cs > 0.93) {
                  const sq = ["ɑ","ε","ɳ","ɯ","ʋ","ɹ"];
                  finalCh = sq[Math.floor(cs * sq.length)] ?? ch;
                }
                const ly = (csFp - 0.5) * lYVar * 2;
                const lx = (csFp * 0.5 - 0.25) * lXVar * 2;
                const fpLean = fp ? fpOff(fp.letterShapeFingerprint, (ci * 2 + wi) % 16) * 1.2 : 0;
                const lSkew  = slant + (csFp - 0.5) * lRotVar * 0.7 + fpLean;
                const lRot   = (csFp - 0.5) * lRotVar * 0.5;
                const lSize  = (csFp * 0.7 - 0.35) * lSzVar * 2;
                let opacity = 1;
                if (effects.showPressure && profile.enablePressureVar) {
                  const pc = Math.sin(ci * 0.8 + baseSeed * 4) * 0.5 + 0.5;
                  const fpP = fp ? fp.letterShapeFingerprint[(ci + 4) % 16] : 0.5;
                  opacity = opacMin + (pc * 0.5 + fpP * 0.3 + csFp * 0.2) * (opacMax - opacMin);
                }
                if (profile.inkDrySkipping && cs < dryRate)
                  opacity = Math.max(0.28, opacity * (0.3 + cs * 4));
                const strokeW = effects.showPressure && profile.enablePressureVar && profile.penThickness > 1
                  ? `${(profile.penThickness - 1) * 0.25 * opacity}px` : "0px";
                return (
                  <span key={ci} style={{
                    display: "inline-block",
                    transform: `translate(${lx}px,${ly}px) rotate(${lRot}deg) skewX(${lSkew}deg)`,
                    fontSize: `${Math.max(9, fontSize + lSize)}px`, opacity,
                    letterSpacing: ci === 0 ? 0 : `${lSpEm + (csFp - 0.5) * 0.04}em`,
                    fontFamily: `var(${getFontVar(fontKey)})`, color: inkCol,
                    WebkitTextStroke: strokeW !== "0px" ? `${strokeW} ${inkCol}` : undefined,
                    textShadow: `0.15px 0.2px 0.3px rgba(0,0,0,0.22)`,
                  }}>{finalCh}</span>
                );
              });
              return (
                <span key={wi} style={{
                  display: "inline-block",
                  transform: `translateY(${wordY}px) rotate(${wordRot}deg)`,
                  marginRight: `${wordMR}px`, whiteSpace: "nowrap",
                }}>{letters}</span>
              );
            })}
            {words.length === 0 && <span style={{ display: "block", height: `${fontSize}px` }} />}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE REALISM — ratures, blanco, smudges
// ─────────────────────────────────────────────────────────────────────────────
function PageRealism({ pi, pageQ, answers, profile, variantSeed, effects, filterId }: {
  pi: number; pageQ: DetectedQuestion[]; answers: Record<string, string>;
  profile: StudentProfile; variantSeed: number;
  effects: PageEffectOverrides; filterId: string;
}) {
  const fp = profile.fingerprint;
  const raturesRate = effects.showRatures && profile.enableRatures
    ? Math.max(profile.raturesRate, (fp?.inferredRaturesRate ?? 0) * 0.5) : 0;
  const blancoRate  = effects.showBlanco && profile.enableBlanco
    ? Math.max(profile.blancoRate, (fp?.inferredBlancoRate ?? 0) * 0.5) : 0;
  const smudgeFreq  = effects.showSmudges && profile.enableSmudges
    ? (fp ? fp.inferredSmudgeFreq * 0.7 : 0.28) : 0;

  return (
    <>
      {pageQ.map(q => {
        const ans = answers[q.id] ?? "";
        if (!ans) return null;
        const words = ans.split(/\s+/).filter(Boolean);
        const inkCol = profile.inkColor;
        return (
          <React.Fragment key={q.id}>
            {raturesRate > 0 && words.map((_, wi) => {
              const rs = sSeed(profile.name + q.id + "r", wi * 37 + variantSeed);
              if (rs <= 1 - raturesRate * 3) return null;
              const col = Math.floor(wi / 6), row = wi % 6;
              const rx = q.x + row * 5 + (rs * 12) % 8;
              const ry = q.y + col * 2.4 + 1.1;
              const rw = 3.5 + rs * 7;
              const j1 = (sSeed(profile.name, wi + "j1") - 0.5) * 0.35;
              return (
                <React.Fragment key={`r${wi}`}>
                  <line x1={rx} y1={ry + j1} x2={rx + rw} y2={ry + 0.18 + j1}
                    stroke={inkCol} strokeWidth={rs > 0.75 ? "0.32" : "0.24"} strokeLinecap="round"
                    opacity={0.88} style={{ filter: `url(#ink-blur-${filterId})` }} />
                </React.Fragment>
              );
            })}
            {blancoRate > 0 && words.map((_, wi) => {
              const bs = sSeed(profile.name + q.id + "b", wi * 53 + variantSeed + 7);
              if (bs <= 1 - blancoRate * 2.5) return null;
              const col = Math.floor(wi / 6), row = wi % 6;
              const bx = q.x + row * 5 + (bs * 10) % 6;
              const by = q.y + col * 2.4 - 0.15;
              const bw = 4.5 + bs * 8, bh = 1.65 + bs * 0.45;
              const tilt = (sSeed(profile.name, wi + "t") - 0.5) * 2.5;
              const cx = bx + bw / 2, cy = by + bh / 2;
              return (
                <rect key={`b${wi}`} x={bx} y={by} width={bw} height={bh}
                  fill="#f3eedd" opacity={0.96} rx="0.25"
                  transform={`rotate(${tilt},${cx},${cy})`} />
              );
            })}
            {smudgeFreq > 0 && (() => {
              const smS = sSeed(profile.name + q.id + "s", variantSeed + 99);
              if (smS > (1 - smudgeFreq)) return null;
              const smS2 = sSeed(profile.name + q.id + "s2", variantSeed + 77);
              const sx = q.x + smS * 38, sy = q.y + 0.8 + smS2 * 2;
              const r = 0.25 + smS * 0.55, ang = smS * 40 - 20;
              return (
                <ellipse key="smudge" cx={sx} cy={sy} rx={r * 2.5} ry={r * 0.55}
                  fill={inkCol} opacity={0.07 + smS * 0.05}
                  transform={`rotate(${ang},${sx},${sy})`}
                  style={{ filter: `url(#smudge-${filterId})` }} />
              );
            })()}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY LAYER
// ─────────────────────────────────────────────────────────────────────────────
function GeometryLayer({ shapes, pageIndex, filterId }: {
  shapes: GeometryShape[]; pageIndex: number; filterId: string;
}) {
  const ps = shapes.filter(s => s.pageIndex === pageIndex);
  if (!ps.length) return null;
  return (
    <>
      {ps.map(sh => {
        const pencil = `url(#pencil-${filterId})`;
        const col = sh.strokeColor || "#2d2d3a";
        const sw  = sh.strokeWidth ?? 0.35;
        const n   = sh.pencilNoise ?? 0.4;
        const op  = 0.82 + n * 0.08;
        if (sh.type === "line" && sh.x2 !== undefined && sh.y2 !== undefined) {
          const mx = (sh.x1 + sh.x2) / 2 + (n - 0.5) * 0.4;
          const my = (sh.y1 + sh.y2) / 2 + (n - 0.5) * 0.4;
          return (
            <g key={sh.id} style={{ filter: pencil }} opacity={op}>
              <polyline points={`${sh.x1},${sh.y1} ${mx},${my} ${sh.x2},${sh.y2}`}
                fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
              {sh.label && <text x={mx} y={my - 1} fontSize="2" fill={col} textAnchor="middle" fontFamily="var(--font-homemade)">{sh.label}</text>}
            </g>
          );
        }
        if (sh.type === "circle" && sh.radius) {
          const pts = Array.from({ length: 49 }, (_, i) => {
            const a = (i / 48) * 2 * Math.PI;
            const rr = sh.radius! + Math.sin(a * 7 + n * 10) * n * 0.3;
            return `${sh.x1 + Math.cos(a) * rr},${sh.y1 + Math.sin(a) * rr}`;
          }).join(" ");
          return (
            <g key={sh.id} style={{ filter: pencil }} opacity={op}>
              <polyline points={pts} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
              {sh.label && <text x={sh.x1} y={sh.y1 - sh.radius - 0.8} fontSize="2" fill={col} textAnchor="middle" fontFamily="var(--font-homemade)">{sh.label}</text>}
            </g>
          );
        }
        if (sh.type === "rectangle" && sh.x2 !== undefined && sh.y2 !== undefined) {
          const pts = [`${sh.x1},${sh.y1}`,`${sh.x2},${sh.y1}`,`${sh.x2},${sh.y2}`,`${sh.x1},${sh.y2}`,`${sh.x1},${sh.y1}`].join(" ");
          return (
            <g key={sh.id} style={{ filter: pencil }} opacity={op}>
              <polyline points={pts} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
            </g>
          );
        }
        if (sh.type === "triangle" && sh.x2 !== undefined && sh.y2 !== undefined && sh.x3 !== undefined && sh.y3 !== undefined) {
          return (
            <g key={sh.id} style={{ filter: pencil }} opacity={op}>
              <polygon points={`${sh.x1},${sh.y1} ${sh.x2},${sh.y2} ${sh.x3},${sh.y3}`}
                fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        }
        return null;
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER COMMENT LAYER — fully draggable, color/font/size from comment props
// ─────────────────────────────────────────────────────────────────────────────
function TeacherCommentLayer({ comments, questions, answers, filterId, draggable, onDrag, containerRef }: {
  comments: TeacherComment[]; questions: DetectedQuestion[];
  answers: Record<string, string>; filterId: string;
  draggable?: boolean;
  onDrag?: (qId: string, svgDx: number, svgDy: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const dragging = useRef<string | null>(null);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!draggable) return;
    const mv = (e: MouseEvent) => {
      if (!dragging.current || !onDrag) return;
      const cw = containerRef?.current?.offsetWidth  || 600;
      const ch = containerRef?.current?.offsetHeight || 848;
      // Convert pixel deltas → SVG coordinate space (viewBox 0-100 × 0-141.4)
      const svgDx = ((e.clientX - last.current.x) / cw) * 100;
      const svgDy = ((e.clientY - last.current.y) / ch) * 141.4;
      onDrag(dragging.current, svgDx, svgDy);
      last.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => { dragging.current = null; };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup",  up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [draggable, onDrag, containerRef]);

  return (
    <>
      {comments.map(c => {
        const q = questions.find(q => q.id === c.qId);
        if (!q) return null;
        // Show even if no answer yet (for manually added comments)
        let bx = q.x, by = q.y;
        if (c.position === "right")  { bx = Math.min(q.x + (q.maxWidth ?? 60) + 2, 85); by = q.y; }
        if (c.position === "above")  { bx = q.x; by = Math.max(2, q.y - 5); }
        if (c.position === "below")  { bx = q.x; by = q.y + 7; }
        if (c.position === "margin") { bx = 1;   by = q.y; }

        const cx = bx + c.ox;
        const cy = by + c.oy;
        const fill  = c.teacherColor || DEFAULT_TEACHER_COLOR;
        const fSize = c.teacherFontSize || DEFAULT_TEACHER_FONTSIZE;
        const fFam  = getFontFamily(c.teacherFontKey || DEFAULT_TEACHER_FONT);

        return (
          <g key={c.qId}
            style={{ cursor: draggable ? "grab" : "default" }}
            onMouseDown={draggable ? e => {
              dragging.current = c.qId;
              last.current = { x: e.clientX, y: e.clientY };
              e.preventDefault();
            } : undefined}
          >
            {/* Symbol: check */}
            {(c.symbol === "✓" || c.style === "check") && (
              <text x={cx - 2} y={cy} fontSize={fSize + 1.5} fill={fill}
                fontFamily="Arial" fontWeight="bold" opacity={0.92}
                style={{ filter: `url(#ink-blur-${filterId})` }}>✓</text>
            )}
            {/* Symbol: cross */}
            {(c.symbol === "✗" || c.style === "cross") && (
              <text x={cx - 2} y={cy} fontSize={fSize + 1.5} fill={fill}
                fontFamily="Arial" fontWeight="bold" opacity={0.92}
                style={{ filter: `url(#ink-blur-${filterId})` }}>✗</text>
            )}
            {/* Underline */}
            {c.style === "underline" && (
              <line x1={q.x} y1={q.y + 2.5} x2={q.x + (q.maxWidth ?? 60) * 0.5} y2={q.y + 2.5}
                stroke={fill} strokeWidth="0.3" strokeLinecap="round" opacity={0.8}
                style={{ filter: `url(#ink-blur-${filterId})` }} />
            )}
            {/* Circle */}
            {c.style === "circle" && (
              <ellipse cx={cx + 8} cy={cy - 1.5} rx="9" ry="3.5"
                fill="none" stroke={fill} strokeWidth="0.5"
                opacity={0.75} style={{ filter: `url(#ink-blur-${filterId})` }} />
            )}
            {/* Arrow */}
            {c.style === "arrow" && (
              <line x1={cx + 2} y1={cy - 1} x2={q.x + 5} y2={q.y + 2}
                stroke={fill} strokeWidth="0.4" strokeLinecap="round"
                markerEnd={`url(#arrow-${filterId})`} opacity={0.85} />
            )}
            {/* Drag indicator dot */}
            {draggable && (
              <circle cx={cx - 1} cy={cy - fSize * 0.5} r="0.7"
                fill={fill} opacity={0.5} />
            )}
            {/* Comment text */}
            {c.text && (
              <text x={cx} y={cy} fontSize={fSize} fill={fill}
                fontFamily={`'${fFam}', cursive`}
                transform={`rotate(-1.8,${cx},${cy})`}
                opacity={0.93}
                style={{ filter: `url(#ink-blur-${filterId})` }}>
                {c.text}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE ANSWER OVERLAY — placed directly on page at question coordinates
// ─────────────────────────────────────────────────────────────────────────────
function DraggableAnswer({ question, answer, profile, variantSeed, editMode, offset, onDelta, effects }: {
  question: DetectedQuestion; answer: string; profile: StudentProfile; variantSeed: number;
  editMode: boolean; offset: { x: number; y: number };
  onDelta: (id: string, dx: number, dy: number) => void;
  effects: PageEffectOverrides;
}) {
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const onMouseDown = (e: React.MouseEvent) => {
    if (!editMode) return;
    dragging.current = true; last.current = { x: e.clientX, y: e.clientY }; e.preventDefault();
  };
  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!dragging.current) return;
      onDelta(question.id, e.clientX - last.current.x, e.clientY - last.current.y);
      last.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [question.id, onDelta]);

  return (
    <div onMouseDown={onMouseDown} style={{
      position: "absolute",
      left: `${question.x}%`,
      top: `${question.y}%`,
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      cursor: editMode ? "move" : "default",
      maxWidth: `${question.maxWidth ?? 78}%`,
      zIndex: 5, userSelect: "none",
    }}>
      {editMode && (
        <div style={{
          position: "absolute", top: -14, left: 0, fontSize: 8,
          background: "#3b82f6", color: "#fff", padding: "1px 4px",
          borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none",
        }}>✥ {question.id}</div>
      )}
      <HandwrittenText text={answer} qId={question.id}
        profile={profile} variantSeed={variantSeed} effects={effects} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE LAYER — page image + all overlays
// ─────────────────────────────────────────────────────────────────────────────
function PageLayer({ page, pi, questions, answers, profile, variantSeed,
  editMode, offsets, onOffsetChange, effects, shapes, comments,
  onCommentDrag, forPrint, artImageOverride, studentName }: {
  page: EvalPage; pi: number;
  questions: DetectedQuestion[]; answers: Record<string, string>;
  profile: StudentProfile; variantSeed: number;
  editMode: boolean; offsets: Record<string, { x: number; y: number }>;
  onOffsetChange: (id: string, dx: number, dy: number) => void;
  effects: PageEffectOverrides; shapes: GeometryShape[];
  comments: TeacherComment[];
  onCommentDrag?: (qId: string, svgDx: number, svgDy: number) => void;
  forPrint?: boolean;
  artImageOverride?: string; // base64 of drawing/photo inserted by teacher
  studentName?: string;      // name written in handwriting on page 1
}) {
  const filterId = `p${pi}`;
  const pageQ    = questions.filter(q => q.pageIndex === pi);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative bg-white" style={{
      width: "100%", aspectRatio: "210/297", overflow: "hidden",
      pageBreakAfter: forPrint ? "always" : "auto",
    }}>
      {/* Page image background */}
      {page.base64 && (
        <img src={page.base64} alt={`Page ${pi + 1}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }}
          draggable={false} />
      )}

      {/* Art/drawing override (inserted image covers the art zone) */}
      {artImageOverride && (
        <img src={artImageOverride} alt="Dessin élève"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", zIndex: 3 }}
          draggable={false} />
      )}

      {/* SVG overlay: effects + geometry + teacher comments */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible",
        pointerEvents: (editMode && !forPrint) ? "auto" : "none" }}
        viewBox="0 0 100 141.4" preserveAspectRatio="none">
        <PencilDefs id={filterId} />

        {effects.showGeometry && <GeometryLayer shapes={shapes} pageIndex={pi} filterId={filterId} />}

        <PageRealism pi={pi} pageQ={pageQ} answers={answers} profile={profile}
          variantSeed={variantSeed} effects={effects} filterId={filterId} />

        {effects.showComments && (
          <TeacherCommentLayer
            comments={comments.filter(c => questions.find(q => q.id === c.qId)?.pageIndex === pi)}
            questions={questions} answers={answers} filterId={filterId}
            draggable={!forPrint && editMode}
            onDrag={onCommentDrag}
            containerRef={containerRef}
          />
        )}
      </svg>

      {/* Answer text overlays — placed at question coordinates */}
      {pageQ.map(q => {
        const ans = answers[q.id] ?? "";
        if (!ans) return null;
        const off = offsets[q.id] ?? { x: 0, y: 0 };
        return (
          <DraggableAnswer key={q.id} question={q} answer={ans}
            profile={profile} variantSeed={variantSeed}
            editMode={editMode} offset={off}
            onDelta={onOffsetChange} effects={effects} />
        );
      })}

      {/* Student name in handwriting on page 1 */}
      {pi === 0 && studentName && (
        <div style={{
          position: "absolute", top: "4%", right: "4%",
          fontFamily: `'${getFontFamily(profile.fontKey)}', cursive`,
          fontSize: Math.max(13, profile.fontSize),
          color: profile.inkColor,
          zIndex: 6, pointerEvents: "none",
          transform: "rotate(-1.5deg)", opacity: 0.9,
          maxWidth: "45%",
        }}>
          {studentName}
        </div>
      )}

      {/* Edit mode border */}
      {editMode && !forPrint && (
        <div style={{ position: "absolute", inset: 0, border: "2px dashed #3b82f6",
          pointerEvents: "none", borderRadius: 2 }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EFFECT TOGGLES
// ─────────────────────────────────────────────────────────────────────────────
function EffectToggles({ effects, onChange }: {
  effects: PageEffectOverrides;
  onChange: (k: keyof PageEffectOverrides, v: boolean) => void;
}) {
  const ts: { key: keyof PageEffectOverrides; label: string; color: string }[] = [
    { key: "showRatures",  label: "Ratures",     color: "bg-red-100 border-red-300"    },
    { key: "showBlanco",   label: "Blanco",       color: "bg-orange-100 border-orange-300" },
    { key: "showSmudges",  label: "Bavures",      color: "bg-blue-100 border-blue-300"  },
    { key: "showPressure", label: "Pression",     color: "bg-purple-100 border-purple-300" },
    { key: "showWobble",   label: "Tremblement",  color: "bg-green-100 border-green-300" },
    { key: "showComments", label: "Corrections",  color: "bg-rose-100 border-rose-300"  },
    { key: "showGeometry", label: "Géométrie",    color: "bg-yellow-100 border-yellow-300" },
  ];
  return (
    <div className="space-y-1.5">
      {ts.map(t => (
        <button key={t.key} onClick={() => onChange(t.key, !effects[t.key])}
          className={`w-full flex items-center gap-2 p-2 rounded-lg border-2 transition text-left
            ${effects[t.key] ? t.color : "border-black/10 bg-white opacity-50"}`}>
          <div className={`w-5 h-5 rounded border border-black/20 flex items-center justify-center ${effects[t.key] ? "bg-black" : "bg-white"}`}>
            {effects[t.key]
              ? <ToggleRight className="h-3 w-3 text-yellow-400" />
              : <ToggleLeft className="h-3 w-3 text-black/30" />}
          </div>
          <span className="text-[10px] font-black">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER COMMENT MANAGER — full font/color/size UI
// ─────────────────────────────────────────────────────────────────────────────
function CommentManager({ comments, questions, answers, onUpdate, onGenerate, isGenerating }: {
  comments: TeacherComment[]; questions: DetectedQuestion[];
  answers: Record<string, string>;
  onUpdate: (c: TeacherComment[]) => void;
  onGenerate: () => void; isGenerating: boolean;
}) {
  const [gFont,    setGFont]    = useState(DEFAULT_TEACHER_FONT);
  const [gColor,   setGColor]   = useState(DEFAULT_TEACHER_COLOR);
  const [gSize,    setGSize]    = useState(DEFAULT_TEACHER_FONTSIZE);

  const mkNew = (qId: string): TeacherComment => ({
    qId, text: "", position: "right", ox: 0, oy: 0,
    teacherFontKey: gFont, teacherColor: gColor, teacherFontSize: gSize,
  });

  const upsert = (qId: string, text: string) => {
    const ex = comments.find(c => c.qId === qId);
    if (ex) onUpdate(comments.map(c => c.qId === qId ? { ...c, text } : c));
    else    onUpdate([...comments, { ...mkNew(qId), text }]);
  };

  const setField = (qId: string, field: Partial<TeacherComment>) => {
    const ex = comments.find(c => c.qId === qId);
    if (ex) onUpdate(comments.map(c => c.qId === qId ? { ...c, ...field } : c));
    else    onUpdate([...comments, { ...mkNew(qId), ...field }]);
  };

  const applyAll = () => {
    onUpdate(comments.map(c => ({ ...c, teacherFontKey: gFont, teacherColor: gColor, teacherFontSize: gSize })));
  };

  return (
    <div className="space-y-2">
      {/* Global style */}
      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-2.5 space-y-2">
        <p className="text-[8px] font-black text-red-700 flex items-center gap-1">
          <Palette className="h-3 w-3" /> STYLE GLOBAL DE L'ENSEIGNANT
        </p>
        <div>
          <p className="text-[8px] font-black text-black/40 mb-1">POLICE :</p>
          <div className="grid grid-cols-3 gap-1">
            {HANDWRITING_FONTS.map(f => (
              <button key={f.key} onClick={() => setGFont(f.key)}
                className={`px-1 py-1 text-[8px] border rounded-md transition font-bold
                  ${gFont === f.key ? "border-red-500 bg-red-100" : "border-black/10 hover:border-red-300"}`}
                style={{ fontFamily: f.family, color: gColor }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[8px] font-black text-black/40 mb-1">COULEUR :</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {TEACHER_COLORS.map(tc => (
              <button key={tc.value} title={tc.label} onClick={() => setGColor(tc.value)}
                className={`w-5 h-5 rounded-full border-2 transition
                  ${gColor === tc.value ? "border-black scale-110 ring-1 ring-offset-1 ring-black" : "border-transparent hover:border-black"}`}
                style={{ background: tc.value }} />
            ))}
            <label className="w-5 h-5 rounded-full border-2 border-black cursor-pointer relative overflow-hidden" title="Personnalisé">
              <input type="color" value={gColor} onChange={e => setGColor(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
              <div className="w-full h-full rounded-full" style={{ background: gColor }} />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-black text-black/40 shrink-0">TAILLE :</span>
          <input type="range" min={1.5} max={5} step={0.1} value={gSize}
            onChange={e => setGSize(parseFloat(e.target.value))}
            className="flex-1 accent-red-500 h-1.5" />
          <span className="text-[8px] font-black w-7 text-right" style={{ color: gColor }}>{gSize.toFixed(1)}</span>
        </div>
        {/* Preview */}
        <div className="bg-white rounded-lg px-2 py-1 border border-red-100">
          <span style={{ fontFamily: `'${getFontFamily(gFont)}', cursive`, color: gColor, fontSize: 13 }}>
            Aperçu correction prof
          </span>
        </div>
        {comments.length > 0 && (
          <button onClick={applyAll}
            className="w-full py-1 bg-red-500 text-white rounded-lg text-[9px] font-black hover:bg-red-600 transition">
            ✓ Appliquer à tous les commentaires
          </button>
        )}
      </div>

      {/* Gemini auto-generate */}
      <button onClick={onGenerate} disabled={isGenerating || !Object.keys(answers).length}
        className="w-full py-2 bg-red-500 text-white border-2 border-black rounded-xl font-black text-xs
          flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-red-600 transition">
        {isGenerating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Auto-générer (Gemini)
      </button>

      {/* Per-question */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {questions.filter(q => answers[q.id]).map(q => {
          const c = comments.find(c => c.qId === q.id);
          return (
            <div key={q.id} className="bg-white border-2 border-red-100 rounded-xl p-2 space-y-1.5">
              <p className="text-[8px] font-black text-black/40 truncate">{q.text.substring(0, 50)}…</p>

              {/* Text + position */}
              <div className="flex gap-1">
                <input value={c?.text ?? ""} onChange={e => upsert(q.id, e.target.value)}
                  placeholder="Commentaire…"
                  className="flex-1 border border-red-200 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:border-red-500 font-bold"
                  style={{
                    color: c?.teacherColor || gColor,
                    fontFamily: `'${getFontFamily(c?.teacherFontKey || gFont)}', cursive`,
                  }} />
                <select value={c?.position ?? "right"}
                  onChange={e => setField(q.id, { position: e.target.value as TeacherComment["position"] })}
                  className="border border-black/10 rounded text-[8px] px-0.5 w-16 bg-white">
                  <option value="right">→ Droite</option>
                  <option value="above">↑ Haut</option>
                  <option value="below">↓ Bas</option>
                  <option value="margin">◀ Marge</option>
                </select>
                {c && (
                  <button onClick={() => onUpdate(comments.filter(cc => cc.qId !== q.id))}
                    className="p-1 rounded hover:bg-red-100 transition shrink-0">
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </button>
                )}
              </div>

              {/* Style (symbol) */}
              <div className="flex gap-1 flex-wrap">
                {(["check","cross","circle","underline","arrow"] as const).map(sym => (
                  <button key={sym} onClick={() => setField(q.id, { style: c?.style === sym ? undefined : sym })}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-black border transition
                      ${c?.style === sym ? "bg-red-500 text-white border-red-600" : "border-black/15 hover:border-red-400 bg-white"}`}>
                    {sym === "check" ? "✓" : sym === "cross" ? "✗" : sym === "circle" ? "○" : sym === "underline" ? "U̲" : "↗"}
                  </button>
                ))}
              </div>

              {/* Per-comment font/color override */}
              {c && (
                <div className="flex items-center gap-1">
                  <select value={c.teacherFontKey || gFont}
                    onChange={e => setField(q.id, { teacherFontKey: e.target.value })}
                    className="flex-1 border border-black/10 rounded text-[7px] px-0.5 bg-white">
                    {HANDWRITING_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <input type="color" value={c.teacherColor || gColor}
                    onChange={e => setField(q.id, { teacherColor: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer p-0 border-0" title="Couleur" />
                  <input type="range" min={1.5} max={5} step={0.1}
                    value={c.teacherFontSize || gSize}
                    onChange={e => setField(q.id, { teacherFontSize: parseFloat(e.target.value) })}
                    className="flex-1 accent-red-500 h-1" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY BUILDER
// ─────────────────────────────────────────────────────────────────────────────
const GEO_PRESETS: { label: string; shape: Omit<GeometryShape, "id" | "pageIndex"> }[] = [
  { label: "Segment (règle)", shape: { type: "line", x1: 10, y1: 30, x2: 60, y2: 30, label: "6 cm", pencilNoise: 0.2 } },
  { label: "Cercle (compas)", shape: { type: "circle", x1: 50, y1: 60, radius: 15, label: "r=3cm", pencilNoise: 0.3 } },
  { label: "Rectangle",       shape: { type: "rectangle", x1: 15, y1: 40, x2: 55, y2: 65, pencilNoise: 0.25 } },
  { label: "Triangle",        shape: { type: "triangle", x1: 30, y1: 30, x2: 10, y2: 70, x3: 60, y3: 70, pencilNoise: 0.3 } },
];

function GeometryBuilder({ pageIndex, onAdd }: { pageIndex: number; onAdd: (s: GeometryShape) => void }) {
  const [noise, setNoise]   = useState(0.3);
  const [color, setColor]   = useState("#2d2d3a");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-black/50 w-16 shrink-0">CRAYON :</span>
        <input type="range" min={0} max={1} step={0.05} value={noise}
          onChange={e => setNoise(parseFloat(e.target.value))} className="flex-1 accent-black h-1.5" />
        <span className="text-[9px] font-black w-14">{noise < 0.2 ? "Règle" : noise < 0.6 ? "Normal" : "Brouillon"}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-black/50 w-16 shrink-0">COULEUR :</span>
        {["#2d2d3a","#6b4226","#1d3278"].map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border-2 ${color === c ? "border-black scale-110" : "border-transparent"}`}
            style={{ background: c }} />
        ))}
        <label className="w-5 h-5 rounded-full border-2 border-black cursor-pointer relative overflow-hidden">
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
          <div className="w-full h-full rounded-full" style={{ background: color }} />
        </label>
      </div>
      <div className="space-y-1">
        {GEO_PRESETS.map(p => (
          <button key={p.label} onClick={() => onAdd({
            ...p.shape, id: `geo_${Date.now()}`, pageIndex, pencilNoise: noise, strokeColor: color,
          })}
            className="w-full flex items-center gap-2 px-2.5 py-2 border-2 border-black/15 rounded-lg hover:border-black hover:bg-yellow-50 transition text-left">
            <span className="text-[10px] font-black flex-1">{p.label}</span>
            <Plus className="h-3 w-3 text-black/30" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH STUDENT ROW
// ─────────────────────────────────────────────────────────────────────────────
function BatchStudentRow({ bs, savedProfiles, onUpdate, onRemove, onGenerate, questions }: {
  bs: BatchStudent; savedProfiles: StudentProfile[];
  onUpdate: (id: string, patch: Partial<BatchStudent>) => void;
  onRemove: (id: string) => void;
  onGenerate: (id: string) => void;
  questions: DetectedQuestion[];
}) {
  return (
    <div className={`flex items-center gap-2 p-2.5 border-2 rounded-xl transition
      ${bs.isDone ? "border-green-400 bg-green-50" : "border-black/20 bg-white"}`}>
      {/* Student selector */}
      <div className="flex-1 min-w-0">
        <select value={bs.profile.name}
          onChange={e => {
            const p = savedProfiles.find(p => p.name === e.target.value);
            if (p) onUpdate(bs.id, { profile: { ...p, hwImage: p.hwImageBase64 || p.hwImage || null } });
          }}
          className="w-full border border-black/20 rounded-lg px-2 py-1 text-xs font-bold bg-white">
          <option value="">— Choisir élève —</option>
          {savedProfiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      {/* Level selector */}
      <select value={bs.criteriaLevel}
        onChange={e => onUpdate(bs.id, { criteriaLevel: e.target.value as CriteriaLevel })}
        className="w-20 border border-black/20 rounded-lg px-1 py-1 text-[10px] font-bold bg-white">
        {EXAM_CRITERIA_LEVELS.map(l => <option key={l.level} value={l.level}>{l.level}/8</option>)}
      </select>

      {/* Status/generate */}
      {bs.isDone ? (
        <div className="flex items-center gap-1 text-green-700 text-[10px] font-black">
          <CheckCircle className="h-3.5 w-3.5" /> OK
        </div>
      ) : (
        <button onClick={() => onGenerate(bs.id)}
          disabled={bs.isGenerating || !bs.profile.name || questions.length === 0}
          className="px-2 py-1 bg-yellow-400 border-2 border-black rounded-lg text-[10px] font-black
            disabled:opacity-50 hover:bg-yellow-500 transition flex items-center gap-1">
          {bs.isGenerating
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <Sparkles className="h-3 w-3" />}
          {bs.isGenerating ? "…" : "Go"}
        </button>
      )}

      <button onClick={() => onRemove(bs.id)} className="p-1 rounded hover:bg-red-100 transition shrink-0">
        <Trash2 className="h-3 w-3 text-red-400" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT BUILDER — generates a standalone HTML document for printing
// ─────────────────────────────────────────────────────────────────────────────
function buildPrintHTML(
  pages: EvalPage[],
  questions: DetectedQuestion[],
  answers: Record<string, string>,
  offsets: Record<string, { x: number; y: number }>,
  profile: StudentProfile,
  comments: TeacherComment[],
  effects: PageEffectOverrides,
  studentName: string,
  artImages?: Record<number, string>,
): string {
  const fp       = profile.fingerprint;
  const useFP    = !!fp && (fp.confidenceScore ?? 0) >= 55;
  const fontSize = useFP ? Math.max(11, fp.suggestedSize) : Math.max(11, profile.fontSize);
  const inkCol   = profile.inkColor;
  const fontFam  = getFontFamily(profile.fontKey);
  const lHeight  = (useFP ? fp.lineHeightMultiplier : 1.6) * fontSize;

  const buildPageCommentsSVG = (pi: number) => {
    const pc = comments.filter(c => {
      const q = questions.find(qq => qq.id === c.qId);
      return q && q.pageIndex === pi;
    });
    return pc.map(c => {
      const q = questions.find(qq => qq.id === c.qId);
      if (!q) return "";
      let bx = q.x, by = q.y;
      if (c.position === "right")  { bx = Math.min(q.x + (q.maxWidth ?? 60) + 2, 85); }
      if (c.position === "above")  { by = Math.max(2, q.y - 5); }
      if (c.position === "below")  { by = q.y + 7; }
      if (c.position === "margin") { bx = 1; }
      const cx   = bx + c.ox;
      const cy   = by + c.oy;
      const fill = c.teacherColor || DEFAULT_TEACHER_COLOR;
      const fs   = c.teacherFontSize || DEFAULT_TEACHER_FONTSIZE;
      const ff   = getFontFamily(c.teacherFontKey || DEFAULT_TEACHER_FONT);
      let out = "";
      if (c.symbol === "✓" || c.style === "check")
        out += `<text x="${cx-2}" y="${cy}" font-size="${fs+1.5}" fill="${fill}" font-family="Arial" font-weight="bold">✓</text>`;
      if (c.symbol === "✗" || c.style === "cross")
        out += `<text x="${cx-2}" y="${cy}" font-size="${fs+1.5}" fill="${fill}" font-family="Arial" font-weight="bold">✗</text>`;
      if (c.text)
        out += `<text x="${cx}" y="${cy}" font-size="${fs}" fill="${fill}" font-family="'${ff}',cursive" transform="rotate(-1.8,${cx},${cy})" opacity="0.93">${c.text.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</text>`;
      return out;
    }).join("\n");
  };

  const buildAnswersHTML = (pi: number) => {
    return questions
      .filter(q => q.pageIndex === pi)
      .map(q => {
        const ans = answers[q.id] ?? "";
        if (!ans) return "";
        const off = offsets[q.id] ?? { x: 0, y: 0 };
        const lineHTML = ans.split("\n").map(l =>
          `<div style="margin:0;padding:0;line-height:${lHeight}px">${l || "&nbsp;"}</div>`
        ).join("");
        return `<div style="position:absolute;left:${q.x}%;top:${q.y}%;transform:translate(${off.x}px,${off.y}px);max-width:${q.maxWidth ?? 78}%;font-family:'${fontFam}',cursive;font-size:${fontSize}px;color:${inkCol};pointer-events:none;z-index:5">${lineHTML}</div>`;
      }).join("\n");
  };

  // Student name overlay on page 1 (top-right, handwriting style)
  const nameHTML = pi0 => pi0 === 0 && studentName
    ? `<div style="position:absolute;top:4%;right:4%;font-family:'${fontFam}',cursive;font-size:${Math.max(13, fontSize)}px;color:${inkCol};z-index:6;pointer-events:none;transform:rotate(-1.5deg);opacity:0.9;max-width:45%">${studentName}</div>`
    : "";

  const pagesHTML = pages.map((page, pi) => {
    const imgHTML   = page.base64 ? `<img src="${page.base64}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"/>` : "";
    const artImg    = artImages?.[pi] ? `<img src="${artImages[pi]}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;pointer-events:none"/>` : "";
    const commSVG   = effects.showComments ? buildPageCommentsSVG(pi) : "";
    const ansHTML   = buildAnswersHTML(pi);
    return `<div style="position:relative;width:210mm;height:297mm;overflow:hidden;background:white;page-break-after:always;box-sizing:border-box">
  ${imgHTML}
  ${artImg}
  ${commSVG ? `<svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" viewBox="0 0 100 141.4" preserveAspectRatio="none">${commSVG}</svg>` : ""}
  ${nameHTML(pi)}
  ${ansHTML}
</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"/>
<title>${studentName} — nanobanana PRO</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Homemade+Apple&family=Marck+Script&family=Parisienne&family=Allura&family=La+Belle+Aurore&family=Bad+Script&display=swap">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:white}
@page{margin:0;size:A4 portrait}
</style>
</head>
<body>
${pagesHTML}
<script>
document.fonts.ready.then(()=>{ setTimeout(()=>{ window.print(); },600); });
<\/script>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState<WorkflowStep>("import");

  // Eval
  const [evalPages, setEvalPages]     = useState<EvalPage[]>([]);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [usePreloaded, setUsePreloaded] = useState(false);

  // Questions
  const [questions, setQuestions]     = useState<DetectedQuestion[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectErr, setDetectErr]     = useState("");

  // Students
  const [savedProfiles, setSavedProfiles] = useState<StudentProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<StudentProfile>(defaultProfile());
  const [isSaving, setIsSaving]           = useState(false);
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [mongoOk, setMongoOk]             = useState(false);

  // Batch mode
  const [batchMode, setBatchMode]       = useState(false);
  const [batchStudents, setBatchStudents] = useState<BatchStudent[]>([]);

  // Grade
  const [criteriaLevel, setCriteriaLevel] = useState<CriteriaLevel>(CriteriaLevel.LEVEL_5_6);
  const [variantSeed, setVariantSeed]     = useState(1);

  // Answers (single-student mode)
  const [answers, setAnswers]           = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [genErr, setGenErr]             = useState("");

  // Preview
  const [previewPage, setPreviewPage]   = useState(0);
  const [editMode, setEditMode]         = useState(false);
  const [offsets, setOffsets]           = useState<Record<string, { x: number; y: number }>>({});
  const [activeBatchIdx, setActiveBatchIdx] = useState(0);

  // Effects
  const [effects, setEffects]           = useState<PageEffectOverrides>(defaultEffects());

  // Teacher comments
  const [comments, setComments]           = useState<TeacherComment[]>([]);
  const [isGenComments, setIsGenComments] = useState(false);

  // Geometry
  const [shapes, setShapes]             = useState<GeometryShape[]>([]);

  // Art page overrides (pageIndex → base64 image)
  const [artImages, setArtImages]       = useState<Record<number, string>>({});

  // Sidebar
  const [sidePanel, setSidePanel]       = useState<"effects" | "comments" | "geometry" | "art">("effects");

  // Batch preview: which student is shown
  const currentBatch = batchMode ? batchStudents[activeBatchIdx] ?? null : null;
  const activeAnswers = batchMode ? (currentBatch?.answers ?? {}) : answers;
  const activeComments = batchMode ? (currentBatch?.comments ?? []) : comments;
  const activeOffsets  = batchMode ? (currentBatch?.offsets  ?? {}) : offsets;
  const activeVarSeed  = batchMode ? (activeBatchIdx + 1) * 3 : variantSeed;
  const activeDisplayProfile = batchMode ? (currentBatch?.profile ?? activeProfile) : activeProfile;

  // ── PDF.js load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if ((window as any).pdfjsLib) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    s.async = true;
    s.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    };
    document.body.appendChild(s);
  }, []);

  // ── Load profiles ──────────────────────────────────────────────────────────
  const loadProfiles = useCallback(async () => {
    try {
      const r = await fetch("/api/students");
      const d = await r.json();
      if (d.success) {
        setMongoOk(!d.offline);
        if (d.students?.length) {
          setSavedProfiles(d.students.map((s: any) => ({ ...s, hwImage: s.hwImageBase64 || null })));
          return;
        }
      }
    } catch {}
    try {
      const loc = localStorage.getItem("student_profiles_v3");
      if (loc) setSavedProfiles(JSON.parse(loc));
    } catch {}
  }, []);
  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const saveProfile = async (p: StudentProfile) => {
    setIsSaving(true);
    try {
      const r = await fetch("/api/students", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, hwImageBase64: p.hwImage || "" }),
      });
      const d = await r.json();
      if (d.success) {
        const saved = d.student ? { ...d.student, hwImage: d.student.hwImageBase64 || null } : p;
        setSavedProfiles(prev => {
          const next = [saved, ...prev.filter(x => x.name.toLowerCase() !== p.name.toLowerCase())];
          localStorage.setItem("student_profiles_v3", JSON.stringify(next));
          return next;
        });
      }
    } catch {
      setSavedProfiles(prev => {
        const next = [p, ...prev.filter(x => x.name.toLowerCase() !== p.name.toLowerCase())];
        localStorage.setItem("student_profiles_v3", JSON.stringify(next));
        return next;
      });
    }
    setIsSaving(false);
  };

  const deleteProfile = async (name: string) => {
    try { await fetch(`/api/students?name=${encodeURIComponent(name)}`, { method: "DELETE" }); } catch {}
    setSavedProfiles(prev => {
      const n = prev.filter(p => p.name !== name);
      localStorage.setItem("student_profiles_v3", JSON.stringify(n));
      return n;
    });
  };

  const analyzeHandwriting = async (b64: string, fileName: string) => {
    setIsAnalyzing(true);
    try {
      const r = await fetch("/api/analyze-handwriting", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handwritingImage: b64, studentName: activeProfile.name }),
      });
      const d = await r.json();
      if (d.success && d.handwritingStyle) {
        const s = d.handwritingStyle as HandwritingFingerprint;
        const fontKey  = FONT_KEY_MAP[s.suggestedFont?.toLowerCase()] ?? "homemade-apple";
        const inkColor = s.suggestedColor?.startsWith("#") ? s.suggestedColor : (COLOR_MAP[s.suggestedColor?.toLowerCase()] ?? activeProfile.inkColor);
        setActiveProfile(prev => ({
          ...prev, hwImage: b64, hwImageName: fileName, fontKey, inkColor,
          fontSize: s.suggestedSize ?? prev.fontSize,
          skewAngle: s.suggestedRotation ?? prev.skewAngle,
          messinessIntensity: s.messinessIntensity ?? prev.messinessIntensity,
          enableUnreadableLetters: s.enableUnreadableLetters ?? prev.enableUnreadableLetters,
          letterCaseChaos: s.letterCaseChaos ?? prev.letterCaseChaos,
          penThickness: s.penThickness ?? prev.penThickness,
          lineWobbleAmp: s.baselineWobbleAmp ?? prev.lineWobbleAmp,
          raturesRate: s.inferredRaturesRate ?? prev.raturesRate,
          blancoRate:  s.inferredBlancoRate  ?? prev.blancoRate,
          enableRatures: (s.inferredRaturesRate ?? 0) > 0.01,
          enableBlanco:  (s.inferredBlancoRate  ?? 0) > 0.005,
          enableSmudges: (s.inferredSmudgeFreq  ?? 0) > 0.15,
          fingerprint: s, analysisDescription: s.analysisDescription, confidenceScore: s.confidenceScore,
        }));
      }
    } catch (err) { console.error(err); }
    setIsAnalyzing(false);
  };

  // ── Upload eval ────────────────────────────────────────────────────────────
  const handleEvalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setQuestions([]); setAnswers({}); setUsePreloaded(false);
    setComments([]); setShapes([]); setArtImages({});
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setIsPdfLoading(true);
      const reader = new FileReader();
      reader.onload = async ev => {
        try {
          const arr = new Uint8Array(ev.target?.result as ArrayBuffer);
          const lib = (window as any).pdfjsLib;
          if (!lib) { alert("PDF.js non chargé, réessayez."); setIsPdfLoading(false); return; }
          const pdf = await lib.getDocument({ data: arr }).promise;
          const pages: EvalPage[] = [];
          for (let n = 1; n <= pdf.numPages; n++) {
            const pg = await pdf.getPage(n);
            const vp = pg.getViewport({ scale: 2.0 });
            const cv = document.createElement("canvas");
            const ctx = cv.getContext("2d")!;
            cv.width = vp.width; cv.height = vp.height;
            await pg.render({ canvasContext: ctx, viewport: vp }).promise;
            pages.push({ base64: cv.toDataURL("image/jpeg", 0.92), pageNum: n });
          }
          if (pages.length) { setEvalPages(pages); setPreviewPage(0); setStep("students"); }
        } catch (err) { console.error(err); }
        finally { setIsPdfLoading(false); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        setEvalPages([{ base64: ev.target?.result as string, pageNum: 1 }]);
        setStep("students");
      };
      reader.readAsDataURL(file);
    }
  };

  const loadPreloaded = (id: string) => {
    setUsePreloaded(true); setAnswers({}); setQuestions([]); setComments([]); setShapes([]); setArtImages({});
    const tpl = PRELOADED_TEMPLATES.find(t => t.id === id);
    if (tpl) {
      setQuestions(tpl.questions.map(q => ({
        id: q.id, text: q.questionText, pageIndex: 0,
        x: q.defaultX, y: q.defaultY, maxWidth: q.maxWidth ?? 78,
      })));
    }
    setEvalPages([{ base64: "", pageNum: 1 }]);
    setStep("students");
  };

  // ── Detect questions ───────────────────────────────────────────────────────
  const detectQuestions = async () => {
    if (!evalPages.length) return;
    setIsDetecting(true); setDetectErr("");
    try {
      const r = await fetch("/api/detect-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfPagesBase64: evalPages.map(p => p.base64) }),
      });
      const d = await r.json();
      if (d.success && d.questions?.length) { setQuestions(d.questions); setStep("grade"); }
      else setDetectErr("Aucune question détectée. Vérifiez que le document est lisible.");
    } catch { setDetectErr("Erreur de connexion."); }
    setIsDetecting(false);
  };

  // ── Generate answers (single) ──────────────────────────────────────────────
  const generateAnswers = async () => {
    if (!questions.length) return;
    setIsGenerating(true); setGenErr("");
    try {
      const r = await fetch("/api/generate-answers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions, criteriaLevel, studentName: activeProfile.name,
          variantSeed, pdfPagesBase64: evalPages.map(p => p.base64), saveSession: true,
        }),
      });
      const d = await r.json();
      if (d.success && d.answers) {
        setAnswers(d.answers); setOffsets({}); setPreviewPage(0); setStep("preview");
      } else setGenErr("Erreur lors de la génération.");
    } catch { setGenErr("Erreur de connexion."); }
    setIsGenerating(false);
  };

  // ── Generate answers for one batch student ─────────────────────────────────
  const generateBatchStudentAnswers = async (bsId: string) => {
    const bs = batchStudents.find(b => b.id === bsId);
    if (!bs || !questions.length) return;
    setBatchStudents(prev => prev.map(b => b.id === bsId ? { ...b, isGenerating: true } : b));
    try {
      const seed = batchStudents.findIndex(b => b.id === bsId) + 1;
      const r = await fetch("/api/generate-answers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions, criteriaLevel: bs.criteriaLevel, studentName: bs.profile.name,
          variantSeed: seed, pdfPagesBase64: evalPages.map(p => p.base64), saveSession: true,
        }),
      });
      const d = await r.json();
      if (d.success && d.answers) {
        setBatchStudents(prev => prev.map(b =>
          b.id === bsId ? { ...b, answers: d.answers, isGenerating: false, isDone: true } : b
        ));
      } else {
        setBatchStudents(prev => prev.map(b => b.id === bsId ? { ...b, isGenerating: false } : b));
      }
    } catch {
      setBatchStudents(prev => prev.map(b => b.id === bsId ? { ...b, isGenerating: false } : b));
    }
  };

  // ── Generate comments ──────────────────────────────────────────────────────
  const generateComments = async () => {
    setIsGenComments(true);
    try {
      const r = await fetch("/api/generate-comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, answers: activeAnswers, criteriaLevel, studentName: activeDisplayProfile.name }),
      });
      const d = await r.json();
      if (d.success && d.comments) {
        const nc: TeacherComment[] = Object.entries(d.comments).map(([qId, c]: [string, any]) => ({
          qId, text: c.text || "", symbol: c.symbol,
          position: c.position || "right", style: c.style,
          ox: 0, oy: 0,
          teacherFontKey: DEFAULT_TEACHER_FONT,
          teacherColor: DEFAULT_TEACHER_COLOR,
          teacherFontSize: DEFAULT_TEACHER_FONTSIZE,
        }));
        if (batchMode && currentBatch) {
          setBatchStudents(prev => prev.map(b =>
            b.id === currentBatch.id ? { ...b, comments: nc } : b
          ));
        } else {
          setComments(nc);
        }
        setEffects(prev => ({ ...prev, showComments: true }));
      }
    } catch (err) { console.error(err); }
    setIsGenComments(false);
  };

  const handleOffsetChange = useCallback((id: string, dx: number, dy: number) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b =>
        b.id === currentBatch.id
          ? { ...b, offsets: { ...b.offsets, [id]: { x: (b.offsets[id]?.x || 0) + dx, y: (b.offsets[id]?.y || 0) + dy } } }
          : b
      ));
    } else {
      setOffsets(prev => ({ ...prev, [id]: { x: (prev[id]?.x || 0) + dx, y: (prev[id]?.y || 0) + dy } }));
    }
  }, [batchMode, currentBatch]);

  const handleCommentDrag = useCallback((qId: string, svgDx: number, svgDy: number) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b =>
        b.id === currentBatch.id
          ? { ...b, comments: b.comments.map(c => c.qId === qId ? { ...c, ox: c.ox + svgDx, oy: c.oy + svgDy } : c) }
          : b
      ));
    } else {
      setComments(prev => prev.map(c => c.qId === qId ? { ...c, ox: c.ox + svgDx, oy: c.oy + svgDy } : c));
    }
  }, [batchMode, currentBatch]);

  const handleCommentsUpdate = useCallback((nc: TeacherComment[]) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id ? { ...b, comments: nc } : b));
    } else {
      setComments(nc);
    }
  }, [batchMode, currentBatch]);

  // ── Print function (single student) ───────────────────────────────────────
  const printSingle = useCallback((
    pProfile: StudentProfile,
    pAnswers: Record<string, string>,
    pOffsets: Record<string, { x: number; y: number }>,
    pComments: TeacherComment[],
  ) => {
    const pages = evalPages.length > 0 ? evalPages : [{ base64: "", pageNum: 1 }];
    const html = buildPrintHTML(pages, questions, pAnswers, pOffsets, pProfile, pComments, effects, pProfile.name, artImages);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("Autorisez les pop-ups pour imprimer."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }, [evalPages, questions, effects, artImages]);

  // ── Print ALL batch students ───────────────────────────────────────────────
  const printAllBatch = useCallback(() => {
    const pages = evalPages.length > 0 ? evalPages : [{ base64: "", pageNum: 1 }];
    const fontFam = (profile: StudentProfile) => getFontFamily(profile.fontKey);
    const fp = (p: StudentProfile) => p.fingerprint;
    const fs = (p: StudentProfile) => {
      const f = fp(p);
      const use = !!f && (f.confidenceScore ?? 0) >= 55;
      return use ? Math.max(11, f!.suggestedSize) : Math.max(11, p.fontSize);
    };
    const lh = (p: StudentProfile) => {
      const f = fp(p);
      const use = !!f && (f.confidenceScore ?? 0) >= 55;
      return (use ? f!.lineHeightMultiplier : 1.6) * fs(p);
    };

    const buildStudent = (bs: BatchStudent, idx: number): string => {
      const prof   = bs.profile;
      const ans    = bs.answers;
      const offs   = bs.offsets;
      const comms  = bs.comments;

      const buildComments = (pi: number) => {
        return comms
          .filter(c => questions.find(q => q.id === c.qId)?.pageIndex === pi)
          .map(c => {
            const q = questions.find(qq => qq.id === c.qId);
            if (!q) return "";
            let bx = q.x, by = q.y;
            if (c.position === "right")  bx = Math.min(q.x + (q.maxWidth ?? 60) + 2, 85);
            if (c.position === "above")  by = Math.max(2, q.y - 5);
            if (c.position === "below")  by = q.y + 7;
            if (c.position === "margin") bx = 1;
            const cx = bx + c.ox, cy = by + c.oy;
            const fill = c.teacherColor || DEFAULT_TEACHER_COLOR;
            const fss  = c.teacherFontSize || DEFAULT_TEACHER_FONTSIZE;
            const ff   = getFontFamily(c.teacherFontKey || DEFAULT_TEACHER_FONT);
            let out = "";
            if (c.symbol === "✓" || c.style === "check")
              out += `<text x="${cx-2}" y="${cy}" font-size="${fss+1.5}" fill="${fill}" font-family="Arial" font-weight="bold">✓</text>`;
            if (c.symbol === "✗" || c.style === "cross")
              out += `<text x="${cx-2}" y="${cy}" font-size="${fss+1.5}" fill="${fill}" font-family="Arial" font-weight="bold">✗</text>`;
            if (c.text)
              out += `<text x="${cx}" y="${cy}" font-size="${fss}" fill="${fill}" font-family="'${ff}',cursive" transform="rotate(-1.8,${cx},${cy})" opacity="0.93">${c.text.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</text>`;
            return out;
          }).join("\n");
      };

      const buildAnswers = (pi: number) => {
        return questions.filter(q => q.pageIndex === pi).map(q => {
          const a = ans[q.id] ?? ""; if (!a) return "";
          const off = offs[q.id] ?? { x: 0, y: 0 };
          const lines = a.split("\n").map(l => `<div style="margin:0;padding:0;line-height:${lh(prof)}px">${l || "&nbsp;"}</div>`).join("");
          return `<div style="position:absolute;left:${q.x}%;top:${q.y}%;transform:translate(${off.x}px,${off.y}px);max-width:${q.maxWidth ?? 78}%;font-family:'${fontFam(prof)}',cursive;font-size:${fs(prof)}px;color:${prof.inkColor};pointer-events:none;z-index:5">${lines}</div>`;
        }).join("\n");
      };

      const nameOverlay = (pi: number) => pi === 0 && prof.name
        ? `<div style="position:absolute;top:4%;right:4%;font-family:'${fontFam(prof)}',cursive;font-size:${Math.max(13, fs(prof))}px;color:${prof.inkColor};z-index:6;pointer-events:none;transform:rotate(-1.5deg);opacity:0.9;max-width:45%">${prof.name}</div>`
        : "";

      return pages.map((page, pi) => {
        const imgHTML   = page.base64 ? `<img src="${page.base64}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"/>` : "";
        const artImg    = artImages[pi] ? `<img src="${artImages[pi]}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;pointer-events:none"/>` : "";
        const commSVG   = effects.showComments ? buildComments(pi) : "";
        const ansHTML   = buildAnswers(pi);
        return `<div style="position:relative;width:210mm;height:297mm;overflow:hidden;background:white;page-break-after:always;box-sizing:border-box">
  ${imgHTML}
  ${artImg}
  ${commSVG ? `<svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" viewBox="0 0 100 141.4" preserveAspectRatio="none">${commSVG}</svg>` : ""}
  ${nameOverlay(pi)}
  ${ansHTML}
</div>`;
      }).join("\n");
    };

    const allHTML = batchStudents
      .filter(b => b.isDone)
      .map((b, i) => buildStudent(b, i))
      .join("\n");

    const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"/>
<title>Impression groupe — nanobanana PRO</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Homemade+Apple&family=Marck+Script&family=Parisienne&family=Allura&family=La+Belle+Aurore&family=Bad+Script&display=swap">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:white}@page{margin:0;size:A4 portrait}</style>
</head><body>
${allHTML}
<script>document.fonts.ready.then(()=>{setTimeout(()=>{window.print();},600);});<\/script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("Autorisez les pop-ups."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }, [batchStudents, evalPages, questions, effects, artImages]);

  const displayPages = evalPages.length > 0 ? evalPages : [{ base64: "", pageNum: 1 }];
  const upd = <K extends keyof StudentProfile>(k: K, v: StudentProfile[K]) =>
    setActiveProfile(prev => ({ ...prev, [k]: v }));

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col antialiased">

      {/* ── Header ── */}
      <header className="bg-white border-b-4 border-black px-5 py-3 flex flex-wrap justify-between items-center sticky top-0 z-50 shadow-[0_4px_0_0_rgba(0,0,0,1)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center text-yellow-400 font-black italic text-lg">nb</div>
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              nanobanana
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400 border-2 border-black font-extrabold">PRO v4</span>
            </h1>
            <p className="text-[9px] font-bold text-black/50">Évaluations 100% réalistes — Gemini AI + Deep Handwriting Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeProfile.fingerprint && (
            <span className={`text-[9px] font-black border-2 border-black py-0.5 px-1.5 rounded-lg
              ${activeProfile.fingerprint.confidenceScore >= 75 ? "bg-green-400" : "bg-yellow-300"}`}>
              ✦ Empreinte {activeProfile.fingerprint.confidenceScore}%
            </span>
          )}
          <span className={`text-[10px] font-black border-2 border-black py-1 px-2 rounded-lg ${mongoOk ? "bg-lime-400" : "bg-orange-200"}`}>
            {mongoOk ? "● MONGODB" : "● LOCAL"}
          </span>
          <span className="text-[10px] font-black border-2 border-black py-1 px-2 rounded-lg bg-blue-300">● GEMINI 2.5</span>
        </div>
      </header>

      <div className="bg-white border-b border-black/10"><StepBar current={step} onGoto={setStep} /></div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">

          {/* ══ STEP 1 — IMPORT ══ */}
          {step === "import" && (
            <motion.div key="import" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-6 max-w-3xl mx-auto pt-6">
              <div className="text-center">
                <h2 className="text-3xl font-black">Importer l'évaluation</h2>
                <p className="text-black/50 font-bold text-sm mt-1">PDF multipages ou image — ou choisissez une fiche préchargée</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                  <span className="inline-block bg-blue-400 border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">PDF / IMAGE</span>
                  <label className="block border-4 border-dashed border-black/25 rounded-xl p-8 text-center bg-slate-50 cursor-pointer hover:bg-blue-50 hover:border-black/50 transition relative">
                    <input type="file" accept="application/pdf,image/*" onChange={handleEvalUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    {isPdfLoading ? <RefreshCw className="h-10 w-10 text-blue-400 mx-auto mb-2 animate-spin" /> : <Upload className="h-10 w-10 text-black/30 mx-auto mb-2" />}
                    <p className="font-black text-sm">{isPdfLoading ? "Traitement PDF…" : "Cliquez ou glissez ici"}</p>
                    <p className="text-xs text-black/40 mt-1">PDF multipages • PNG • JPG</p>
                  </label>
                </div>
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                  <span className="inline-block bg-yellow-400 border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">PRÉCHARGÉ</span>
                  <div className="space-y-2">
                    {PRELOADED_TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => loadPreloaded(t.id)}
                        className="w-full flex items-center gap-3 p-3 border-2 border-black/20 rounded-xl hover:border-black hover:bg-yellow-50 transition text-left">
                        <FileText className="h-5 w-5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-xs">Page {t.pageNumber}</p>
                          <p className="text-[10px] text-black/50">{t.title}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-black/30" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 2 — STUDENTS ══ */}
          {step === "students" && (
            <motion.div key="students" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-5xl mx-auto pt-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-2xl font-black">Élève(s)</h2>
                {/* Batch toggle */}
                <button onClick={() => {
                  setBatchMode(b => !b);
                  if (!batchMode && batchStudents.length === 0 && savedProfiles.length > 0) {
                    setBatchStudents([makeBatchStudent({ ...savedProfiles[0], hwImage: savedProfiles[0].hwImageBase64 || null }, criteriaLevel)]);
                  }
                }}
                  className={`flex items-center gap-2 px-4 py-2 border-2 border-black rounded-xl font-black text-xs transition
                    ${batchMode ? "bg-purple-400 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "bg-white hover:bg-purple-50"}`}>
                  <Users className="h-3.5 w-3.5" />
                  {batchMode ? "Mode Groupe actif" : "Passer en mode Groupe"}
                </button>
              </div>

              {/* ─ BATCH MODE ─ */}
              {batchMode ? (
                <div className="space-y-4">
                  <div className="bg-purple-50 border-4 border-black rounded-2xl p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                    <h3 className="font-black text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" /> Groupe d'élèves ({batchStudents.length})
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {batchStudents.map(bs => (
                        <BatchStudentRow key={bs.id} bs={bs}
                          savedProfiles={savedProfiles}
                          onUpdate={(id, patch) => setBatchStudents(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))}
                          onRemove={id => setBatchStudents(prev => prev.filter(b => b.id !== id))}
                          onGenerate={generateBatchStudentAnswers}
                          questions={questions} />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setBatchStudents(prev => [...prev, makeBatchStudent(defaultProfile(`Élève ${prev.length + 1}`), criteriaLevel)])}
                        className="flex-1 py-2 border-2 border-dashed border-black/30 rounded-xl text-xs font-black text-black/50 hover:border-black hover:text-black hover:bg-yellow-50 transition flex items-center justify-center gap-1">
                        <Plus className="h-3.5 w-3.5" /> Ajouter élève
                      </button>
                      <button onClick={() => {
                        batchStudents.filter(b => !b.isDone && b.profile.name).forEach(b => generateBatchStudentAnswers(b.id));
                      }}
                        disabled={!questions.length}
                        className="flex-1 py-2 bg-yellow-400 border-2 border-black rounded-xl text-xs font-black hover:bg-yellow-500 transition disabled:opacity-50 flex items-center justify-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" /> Générer TOUS
                      </button>
                    </div>
                    <div className="text-[9px] text-black/50 font-bold">
                      {batchStudents.filter(b => b.isDone).length}/{batchStudents.length} élèves générés
                    </div>
                  </div>

                  <div className="flex justify-center gap-3">
                    <button onClick={() => setStep("import")}
                      className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
                      <ChevronLeft className="h-4 w-4" /> Retour
                    </button>
                    <button onClick={() => {
                      if (questions.length === 0 && evalPages.length > 0) setStep("solve");
                      else if (batchStudents.some(b => b.isDone)) setStep("preview");
                      else setStep("grade");
                    }}
                      disabled={batchStudents.length === 0}
                      className="flex items-center gap-1.5 px-7 py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] disabled:opacity-50 transition">
                      Continuer <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                /* ─ SINGLE STUDENT MODE ─ */
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                  {/* Saved list */}
                  <div className="lg:col-span-2 bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-sm flex items-center gap-1.5"><Users className="h-4 w-4" /> Élèves enregistrés</h3>
                      <button onClick={loadProfiles} className="p-1 rounded-lg border border-black/20 hover:bg-yellow-50 transition"><RefreshCw className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {savedProfiles.length === 0
                        ? <div className="py-6 text-center text-xs text-black/30 font-bold">Aucun élève</div>
                        : savedProfiles.map(p => (
                          <div key={p.name}
                            onClick={() => setActiveProfile({ ...p, hwImage: p.hwImageBase64 || p.hwImage || null })}
                            className={`flex items-center gap-2 p-2.5 border-2 rounded-xl cursor-pointer transition
                              ${activeProfile.name === p.name ? "border-black bg-yellow-50 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "border-black/15 hover:border-black hover:bg-slate-50"}`}>
                            <div className="w-8 h-8 rounded-full bg-black text-yellow-400 flex items-center justify-center font-black text-sm shrink-0">{p.name[0]?.toUpperCase()}</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-xs truncate">{p.name}</p>
                              <p className="text-[9px] text-black/40">{getFontFamily(p.fontKey)}</p>
                              {p.fingerprint && <p className="text-[8px] text-green-600 font-black">✦ {p.fingerprint.confidenceScore}%</p>}
                            </div>
                            {activeProfile.name === p.name && <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
                            <button onClick={e => { e.stopPropagation(); deleteProfile(p.name); }}
                              className="p-1 rounded hover:bg-red-100 transition shrink-0">
                              <Trash2 className="h-3 w-3 text-red-400" />
                            </button>
                          </div>
                        ))}
                    </div>
                    <button onClick={() => setActiveProfile(defaultProfile())}
                      className="w-full py-2 border-2 border-dashed border-black/20 rounded-xl text-xs font-black text-black/40 hover:border-black hover:text-black hover:bg-yellow-50 transition flex items-center justify-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Nouvel élève
                    </button>
                  </div>

                  {/* Profile editor */}
                  <div className="lg:col-span-3 bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4 overflow-y-auto max-h-[80vh]">
                    <h3 className="font-black text-sm flex items-center gap-1.5"><User className="h-4 w-4" /> Profil actif</h3>

                    <div>
                      <label className="text-[9px] font-black text-black/50">NOM</label>
                      <input type="text" value={activeProfile.name} onChange={e => upd("name", e.target.value)}
                        className="w-full mt-0.5 border-2 border-black rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        placeholder="Ex: Ahmed Benali…" />
                    </div>

                    {/* Handwriting sample */}
                    <div>
                      <label className="text-[9px] font-black text-black/50">ÉCHANTILLON D'ÉCRITURE</label>
                      <label className="mt-0.5 block border-2 border-dashed border-black/20 rounded-xl p-3 text-center cursor-pointer hover:bg-yellow-50 transition relative">
                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={e => {
                            const f = e.target.files?.[0]; if (!f) return;
                            const r = new FileReader();
                            r.onload = ev => analyzeHandwriting(ev.target?.result as string, f.name);
                            r.readAsDataURL(f);
                          }} />
                        {isAnalyzing
                          ? <div className="flex flex-col items-center gap-1"><RefreshCw className="h-5 w-5 animate-spin text-blue-400" /><p className="text-xs font-black text-blue-600">Analyse…</p></div>
                          : activeProfile.fingerprint
                            ? <div className="flex items-center gap-1.5 justify-center"><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-xs font-black text-green-700">Empreinte {activeProfile.fingerprint.confidenceScore}%</span></div>
                            : <div className="flex flex-col items-center gap-1"><BookOpen className="h-5 w-5 text-black/30" /><p className="text-xs font-black text-black/50">📸 Photo → empreinte 25 paramètres</p></div>}
                      </label>
                      {activeProfile.analysisDescription && (
                        <p className="text-[9px] text-green-700 font-bold bg-green-50 rounded-lg px-2 py-1 mt-1">✓ {activeProfile.analysisDescription}</p>
                      )}
                    </div>

                    {/* Font */}
                    <div>
                      <label className="text-[9px] font-black text-black/50">STYLE D'ÉCRITURE</label>
                      <div className="grid grid-cols-3 gap-1.5 mt-0.5">
                        {HANDWRITING_FONTS.map(f => (
                          <button key={f.key} onClick={() => upd("fontKey", f.key)}
                            className={`px-2 py-1.5 text-[10px] border-2 rounded-lg transition font-bold
                              ${activeProfile.fontKey === f.key ? "border-black bg-yellow-400 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "border-black/15 hover:border-black"}`}
                            style={{ fontFamily: f.family }}>{f.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Ink color */}
                    <div>
                      <label className="text-[9px] font-black text-black/50">COULEUR D'ENCRE</label>
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        {INK_COLORS.map(c => (
                          <button key={c.value} title={c.label} onClick={() => upd("inkColor", c.value)}
                            className={`w-6 h-6 rounded-full border-2 transition ${activeProfile.inkColor === c.value ? "border-black scale-110" : "border-transparent hover:border-black"}`}
                            style={{ background: c.value }} />
                        ))}
                        <label className="w-6 h-6 rounded-full border-2 border-black cursor-pointer relative overflow-hidden">
                          <input type="color" value={activeProfile.inkColor} onChange={e => upd("inkColor", e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                          <div className="w-full h-full rounded-full" style={{ background: activeProfile.inkColor }} />
                        </label>
                      </div>
                    </div>

                    {/* Sliders */}
                    <div>
                      <label className="text-[9px] font-black text-black/50 flex items-center gap-1"><Sliders className="h-3 w-3" /> PARAMÈTRES</label>
                      <div className="space-y-1.5 mt-1">
                        {[
                          { k: "messinessIntensity" as const, label: "Désordre",    min: 0, max: 6,   step: 0.1 },
                          { k: "fontSize"           as const, label: "Taille",      min: 11, max: 26, step: 0.5 },
                          { k: "lineWobbleAmp"      as const, label: "Tremblement", min: 0, max: 5,   step: 0.1 },
                          { k: "penThickness"       as const, label: "Épaisseur",   min: 0.5, max: 3.5, step: 0.1 },
                        ].map(s => (
                          <div key={s.k} className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-black/40 w-20 shrink-0">{s.label}</span>
                            <input type="range" min={s.min} max={s.max} step={s.step}
                              value={activeProfile[s.k] as number}
                              onChange={e => upd(s.k, parseFloat(e.target.value))}
                              className="flex-1 accent-black h-1.5 rounded" />
                            <span className="text-[9px] font-black w-7 text-right">{(activeProfile[s.k] as number).toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Realism toggles */}
                    <div>
                      <label className="text-[9px] font-black text-black/50 flex items-center gap-1"><Zap className="h-3 w-3" /> EFFETS RÉALISME</label>
                      <div className="grid grid-cols-2 gap-2 mt-1.5">
                        {[
                          { k: "enableRatures" as const, label: "Ratures",        color: "bg-red-50",    sub: "raturesRate" as const, min: 0.01, max: 0.15 },
                          { k: "enableBlanco"  as const, label: "Blanco",         color: "bg-orange-50", sub: "blancoRate"  as const, min: 0.01, max: 0.1  },
                          { k: "enableSmudges" as const, label: "Bavures",        color: "bg-blue-50",   sub: null, min: 0, max: 0 },
                          { k: "enablePressureVar" as const, label: "Pression",   color: "bg-purple-50", sub: null, min: 0, max: 0 },
                          { k: "enableLineWobble"  as const, label: "Tremblement",color: "bg-green-50",  sub: "lineWobbleAmp" as const, min: 0, max: 5 },
                          { k: "inkDrySkipping"    as const, label: "Encre saute",color: "bg-yellow-50", sub: null, min: 0, max: 0 },
                        ].map(s => (
                          <div key={s.k}
                            className={`p-2.5 border-2 rounded-xl transition cursor-pointer ${activeProfile[s.k] ? "border-black " + s.color : "border-black/15"}`}
                            onClick={() => upd(s.k, !activeProfile[s.k] as any)}>
                            <div className="flex items-center gap-1.5">
                              <div className={`w-4 h-4 rounded border-2 border-black flex items-center justify-center ${activeProfile[s.k] ? "bg-black" : "bg-white"}`}>
                                {activeProfile[s.k] && <span className="text-yellow-400 text-[8px] font-black">✓</span>}
                              </div>
                              <p className="text-[10px] font-black">{s.label}</p>
                            </div>
                            {s.sub && activeProfile[s.k] && (
                              <input type="range" min={s.min} max={s.max} step={0.01}
                                value={activeProfile[s.sub] as number}
                                onChange={e => { e.stopPropagation(); upd(s.sub!, parseFloat(e.target.value)); }}
                                onClick={e => e.stopPropagation()}
                                className="w-full mt-1.5 accent-black h-1 rounded" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Live preview */}
                    <div className="border-2 border-black/10 rounded-xl p-3 bg-zinc-50 min-h-14">
                      <p className="text-[8px] font-black text-black/25 mb-1">APERÇU LIVE :</p>
                      <HandwrittenText text="Voici mon écriture avec tous les effets activés."
                        qId="preview-live" profile={activeProfile} variantSeed={variantSeed} effects={effects} />
                    </div>

                    <button onClick={() => saveProfile(activeProfile)}
                      disabled={!activeProfile.name.trim() || isSaving}
                      className="w-full py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-xs flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-zinc-800 transition">
                      {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      SAUVEGARDER LE PROFIL
                    </button>
                  </div>

                  <div className="lg:col-span-5 flex justify-center gap-3 pt-1">
                    <button onClick={() => setStep("import")}
                      className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
                      <ChevronLeft className="h-4 w-4" /> Retour
                    </button>
                    <button onClick={() => {
                      if (evalPages.length > 0 && questions.length === 0) setStep("solve");
                      else setStep("grade");
                    }}
                      disabled={!activeProfile.name.trim()}
                      className="flex items-center gap-1.5 px-7 py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition disabled:opacity-50">
                      Continuer <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ══ STEP 3 — GRADE ══ */}
          {step === "grade" && (
            <motion.div key="grade" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-2xl mx-auto pt-6">
              <div className="text-center">
                <h2 className="text-2xl font-black">Niveau cible</h2>
                <p className="text-sm font-bold text-black/50 mt-1">Pour <span className="text-black">{batchMode ? `${batchStudents.length} élèves` : activeProfile.name}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {EXAM_CRITERIA_LEVELS.map(lvl => (
                  <button key={lvl.level} onClick={() => setCriteriaLevel(lvl.level)}
                    className={`p-4 border-4 rounded-2xl text-left transition
                      ${criteriaLevel === lvl.level ? "border-black bg-yellow-400 shadow-[5px_5px_0_rgba(0,0,0,1)] -translate-y-0.5" : "border-black/15 hover:border-black bg-white"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl font-black">{lvl.level}</span>
                      {criteriaLevel === lvl.level && <CheckCircle className="h-4 w-4 ml-auto" />}
                    </div>
                    <p className="text-xs font-black">{lvl.title.split("(")[1]?.replace(")", "") ?? ""}</p>
                    <p className="text-[10px] text-black/50 mt-0.5">{lvl.description.substring(0, 80)}…</p>
                  </button>
                ))}
              </div>
              <div className="bg-white rounded-2xl border-2 border-black p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-black text-sm">Variante #{variantSeed}</p>
                  <p className="text-[10px] text-black/40">Chaque variante = réponses uniques</p>
                </div>
                <button onClick={() => setVariantSeed(s => (s % 10) + 1)}
                  className="px-3 py-2 bg-black text-yellow-400 rounded-xl font-black text-xs border-2 border-black flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Changer
                </button>
              </div>
              <div className="flex justify-center gap-3">
                <button onClick={() => setStep("students")}
                  className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
                  <ChevronLeft className="h-4 w-4" /> Retour
                </button>
                <button onClick={() => setStep("solve")}
                  className="flex items-center gap-1.5 px-7 py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition">
                  Résoudre avec Gemini <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 4 — SOLVE ══ */}
          {step === "solve" && (
            <motion.div key="solve" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-2xl mx-auto pt-6">
              <div className="text-center">
                <h2 className="text-2xl font-black">Résolution AI</h2>
                <p className="text-sm text-black/50 font-bold mt-1">
                  Gemini génère pour <span className="text-black font-black">{batchMode ? `${batchStudents.length} élèves` : activeProfile.name}</span> — niveau {criteriaLevel}
                </p>
              </div>

              {/* Detect questions (real PDF only) */}
              {!usePreloaded && questions.length === 0 && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2"><Search className="h-4 w-4" /> Détection des questions</h3>
                  {detectErr && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border-2 border-red-200 rounded-xl">
                      <AlertCircle className="h-4 w-4 text-red-500" /><p className="text-xs font-bold text-red-600">{detectErr}</p>
                    </div>
                  )}
                  <button onClick={detectQuestions} disabled={isDetecting}
                    className="w-full py-4 bg-blue-500 text-white border-2 border-black rounded-2xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] flex items-center justify-center gap-2 disabled:opacity-60">
                    {isDetecting ? <><RefreshCw className="h-5 w-5 animate-spin" /> Analyse…</> : <><Search className="h-5 w-5" /> Détecter les questions</>}
                  </button>
                </div>
              )}

              {/* Question list */}
              {questions.length > 0 && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-2">
                  <h3 className="font-black flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-600" /> {questions.length} questions détectées</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {questions.map((q, i) => (
                      <div key={q.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                        <span className="text-[9px] font-black text-black/40 mt-0.5 w-5 shrink-0">Q{i + 1}</span>
                        <p className="text-xs font-bold truncate flex-1">{q.text}</p>
                        <span className="text-[9px] text-black/30 shrink-0">p.{q.pageIndex + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate (single mode) */}
              {questions.length > 0 && !batchMode && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2"><Sparkles className="h-4 w-4 text-yellow-500" /> Générer les réponses</h3>
                  {genErr && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border-2 border-red-200 rounded-xl">
                      <AlertCircle className="h-4 w-4 text-red-500" /><p className="text-xs font-bold text-red-600">{genErr}</p>
                    </div>
                  )}
                  <button onClick={generateAnswers} disabled={isGenerating}
                    className="w-full py-5 bg-yellow-400 text-black border-4 border-black rounded-2xl font-black text-xl shadow-[6px_6px_0_rgba(0,0,0,1)] hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgba(0,0,0,1)] transition flex items-center justify-center gap-3 disabled:opacity-60">
                    {isGenerating ? <><RefreshCw className="h-6 w-6 animate-spin" /> Gemini génère…</> : <><Sparkles className="h-6 w-6" /> RÉSOUDRE AVEC GEMINI</>}
                  </button>
                </div>
              )}

              {/* Batch generate from here */}
              {questions.length > 0 && batchMode && (
                <div className="bg-purple-50 border-4 border-black rounded-2xl p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                  <h3 className="font-black flex items-center gap-2"><Users className="h-4 w-4" /> Génération groupe</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {batchStudents.map(bs => (
                      <BatchStudentRow key={bs.id} bs={bs}
                        savedProfiles={savedProfiles}
                        onUpdate={(id, patch) => setBatchStudents(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))}
                        onRemove={id => setBatchStudents(prev => prev.filter(b => b.id !== id))}
                        onGenerate={generateBatchStudentAnswers}
                        questions={questions} />
                    ))}
                  </div>
                  <button onClick={() => batchStudents.filter(b => !b.isDone && b.profile.name).forEach(b => generateBatchStudentAnswers(b.id))}
                    disabled={!batchStudents.some(b => !b.isDone && b.profile.name)}
                    className="w-full py-3 bg-yellow-400 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-500 transition disabled:opacity-50 flex items-center justify-center gap-2">
                    <Sparkles className="h-4 w-4" /> Générer TOUS les élèves
                  </button>
                  {batchStudents.some(b => b.isDone) && (
                    <button onClick={() => { setPreviewPage(0); setActiveBatchIdx(0); setStep("preview"); }}
                      className="w-full py-2 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm hover:bg-zinc-800 transition flex items-center justify-center gap-2">
                      <Eye className="h-4 w-4" /> Voir l'aperçu
                    </button>
                  )}
                </div>
              )}

              <div className="flex justify-center">
                <button onClick={() => setStep("grade")}
                  className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
                  <ChevronLeft className="h-4 w-4" /> Retour
                </button>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 5 — PREVIEW ══ */}
          {step === "preview" && (
            <motion.div key="preview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-3">

              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-black">
                  Aperçu
                  {batchMode && currentBatch && (
                    <span className="ml-2 text-sm font-bold text-purple-600">— {currentBatch.profile.name}</span>
                  )}
                  {!batchMode && activeProfile.fingerprint && (
                    <span className="ml-2 text-sm font-bold text-blue-600">✦ {activeProfile.fingerprint.confidenceScore}%</span>
                  )}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setEditMode(m => !m)}
                    className={`flex items-center gap-1 px-3 py-2 border-2 border-black rounded-xl font-black text-xs transition
                      ${editMode ? "bg-blue-400 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "bg-white hover:bg-blue-50"}`}>
                    <Move className="h-3.5 w-3.5" /> {editMode ? "Dépl. ON" : "Déplacer"}
                  </button>
                  <button onClick={() => {
                    if (batchMode && currentBatch) {
                      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id ? { ...b, offsets: {} } : b));
                    } else setOffsets({});
                  }}
                    className="flex items-center gap-1 px-3 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 bg-white transition">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </button>
                  {batchMode ? (
                    <button onClick={printAllBatch}
                      disabled={!batchStudents.some(b => b.isDone)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition disabled:opacity-50">
                      <Printer className="h-3.5 w-3.5" /> Imprimer GROUPE
                    </button>
                  ) : (
                    <button onClick={() => setStep("print")}
                      className="flex items-center gap-1.5 px-4 py-2 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition">
                      <Printer className="h-3.5 w-3.5" /> Imprimer
                    </button>
                  )}
                </div>
              </div>

              {/* Batch student tabs */}
              {batchMode && batchStudents.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {batchStudents.map((bs, i) => (
                    <button key={bs.id} onClick={() => setActiveBatchIdx(i)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-black transition
                        ${activeBatchIdx === i ? "border-black bg-purple-400" : "border-black/20 bg-white hover:border-black"}`}>
                      <div className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center text-[8px] font-black">
                        {bs.profile.name[0]?.toUpperCase() || "?"}
                      </div>
                      <span className="truncate max-w-20">{bs.profile.name || "—"}</span>
                      {bs.isDone ? <CheckCircle className="h-3 w-3 text-green-700" /> : bs.isGenerating ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                    </button>
                  ))}
                </div>
              )}

              {/* Page thumbnails */}
              {displayPages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {displayPages.map((pg, i) => (
                    <button key={i} onClick={() => setPreviewPage(i)}
                      className={`shrink-0 relative border-2 rounded-lg overflow-hidden transition
                        ${previewPage === i ? "border-black shadow-[2px_2px_0_rgba(0,0,0,1)] scale-105" : "border-black/20 hover:border-black"}`}
                      style={{ width: 64 }}>
                      {pg.base64
                        ? <img src={pg.base64} alt={`p${i + 1}`} className="w-full h-16 object-cover" />
                        : <div className="w-16 h-20 bg-slate-100 flex items-center justify-center text-xs font-black text-black/30">P.{i + 1}</div>}
                      <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8px] text-center font-black py-0.5">
                        P.{i + 1} {questions.filter(q => q.pageIndex === i).length > 0 && `(${questions.filter(q => q.pageIndex === i).length}Q)`}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Main: page + sidebar */}
              <div className="flex gap-4 items-start">

                {/* Page */}
                <div className="flex-1 shadow-2xl rounded-lg overflow-hidden">
                  <PageLayer
                    page={displayPages[previewPage] ?? { base64: "", pageNum: 1 }}
                    pi={previewPage}
                    questions={questions} answers={activeAnswers}
                    profile={activeDisplayProfile} variantSeed={activeVarSeed}
                    editMode={editMode} offsets={activeOffsets}
                    onOffsetChange={handleOffsetChange}
                    effects={effects} shapes={shapes}
                    comments={activeComments}
                    onCommentDrag={handleCommentDrag}
                    artImageOverride={artImages[previewPage]}
                    studentName={activeDisplayProfile.name}
                  />
                </div>

                {/* Sidebar */}
                <div className="w-72 shrink-0 space-y-3 sticky top-24 max-h-[85vh] overflow-y-auto">
                  <div className="bg-white rounded-2xl border-4 border-black shadow-[4px_4px_0_rgba(0,0,0,1)]">
                    <div className="flex border-b-2 border-black">
                      {[
                        { k: "effects"  as const, label: "Effets",    icon: <Eye className="h-3.5 w-3.5" /> },
                        { k: "comments" as const, label: "Prof",      icon: <MessageSquare className="h-3.5 w-3.5" /> },
                        { k: "geometry" as const, label: "Géomét.",   icon: <Triangle className="h-3.5 w-3.5" /> },
                        { k: "art"      as const, label: "Art",       icon: <Image className="h-3.5 w-3.5" /> },
                      ].map(t => (
                        <button key={t.k} onClick={() => setSidePanel(t.k)}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-black transition border-r last:border-r-0 border-black
                            ${sidePanel === t.k ? "bg-yellow-400" : "hover:bg-yellow-50"}`}>
                          {t.icon}{t.label}
                        </button>
                      ))}
                    </div>

                    <div className="p-3">
                      {/* Effects */}
                      {sidePanel === "effects" && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-black text-black/40">AFFICHAGE EN TEMPS RÉEL</p>
                          <EffectToggles effects={effects} onChange={(k, v) => setEffects(prev => ({ ...prev, [k]: v }))} />
                          <button onClick={() => setEffects(defaultEffects())}
                            className="w-full py-1.5 border-2 border-black/20 rounded-lg text-[10px] font-black hover:bg-yellow-50 transition mt-2">
                            Tout activer
                          </button>
                        </div>
                      )}

                      {/* Comments */}
                      {sidePanel === "comments" && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-black flex items-center gap-1" style={{ color: DEFAULT_TEACHER_COLOR }}>
                            ● CORRECTIONS ENSEIGNANT
                          </p>
                          <CommentManager
                            comments={activeComments}
                            questions={questions} answers={activeAnswers}
                            onUpdate={handleCommentsUpdate}
                            onGenerate={generateComments}
                            isGenerating={isGenComments}
                          />
                        </div>
                      )}

                      {/* Geometry */}
                      {sidePanel === "geometry" && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-black text-black/40 flex items-center gap-1">
                            <PenTool className="h-3 w-3" /> FORMES GÉOMÉTRIQUES
                          </p>
                          <GeometryBuilder pageIndex={previewPage} onAdd={s => setShapes(prev => [...prev, s])} />
                          {shapes.filter(s => s.pageIndex === previewPage).length > 0 && (
                            <div className="pt-2 border-t border-black/10 space-y-1">
                              {shapes.filter(s => s.pageIndex === previewPage).map(s => (
                                <div key={s.id} className="flex items-center gap-1.5 p-1.5 bg-slate-50 rounded-lg">
                                  <span className="text-[9px] font-black flex-1 capitalize">{s.type} {s.label || ""}</span>
                                  <button onClick={() => setShapes(prev => prev.filter(sh => sh.id !== s.id))}
                                    className="p-0.5 rounded hover:bg-red-100">
                                    <Trash2 className="h-3 w-3 text-red-400" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Art/Drawing page */}
                      {sidePanel === "art" && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-black text-black/40 flex items-center gap-1">
                            <Palette className="h-3 w-3" /> PAGE ART / DESSIN / COLORIAGE
                          </p>
                          <p className="text-[9px] text-black/50">
                            Pour les pages où l'élève doit dessiner ou colorier, insérez une image directement.
                          </p>
                          <label className="block border-2 border-dashed border-black/20 rounded-xl p-4 text-center cursor-pointer hover:bg-yellow-50 transition relative">
                            <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={e => {
                                const f = e.target.files?.[0]; if (!f) return;
                                const r = new FileReader();
                                r.onload = ev => setArtImages(prev => ({ ...prev, [previewPage]: ev.target?.result as string }));
                                r.readAsDataURL(f);
                              }} />
                            <Image className="h-6 w-6 text-black/30 mx-auto mb-1" />
                            <p className="text-[10px] font-black">Insérer dessin / photo</p>
                            <p className="text-[9px] text-black/40">PNG • JPG • JPEG</p>
                          </label>
                          {artImages[previewPage] && (
                            <div className="space-y-1">
                              <img src={artImages[previewPage]} alt="Art" className="w-full rounded-lg border border-black/10" />
                              <button onClick={() => setArtImages(prev => { const n = { ...prev }; delete n[previewPage]; return n; })}
                                className="w-full py-1 border border-red-200 rounded-lg text-[9px] font-black text-red-500 hover:bg-red-50 transition">
                                Supprimer (page {previewPage + 1})
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manual answer editor */}
                  <div className="bg-white rounded-2xl border-4 border-black p-3 shadow-[4px_4px_0_rgba(0,0,0,1)] space-y-2">
                    <h3 className="font-black text-xs flex items-center gap-1.5"><Edit3 className="h-3.5 w-3.5" /> Réponses p.{previewPage + 1}</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {questions.filter(q => q.pageIndex === previewPage).map(q => (
                        <div key={q.id}>
                          <label className="text-[8px] font-black text-black/40 block truncate">{q.text.substring(0, 40)}…</label>
                          <textarea
                            value={batchMode && currentBatch ? (currentBatch.answers[q.id] ?? "") : (answers[q.id] ?? "")}
                            onChange={e => {
                              if (batchMode && currentBatch) {
                                setBatchStudents(prev => prev.map(b =>
                                  b.id === currentBatch.id ? { ...b, answers: { ...b.answers, [q.id]: e.target.value } } : b
                                ));
                              } else {
                                setAnswers(prev => ({ ...prev, [q.id]: e.target.value }));
                              }
                            }}
                            rows={2}
                            className="w-full border-2 border-black/15 rounded-lg p-1.5 text-[10px] focus:outline-none focus:border-black resize-none mt-0.5"
                          />
                        </div>
                      ))}
                      {questions.filter(q => q.pageIndex === previewPage).length === 0 && (
                        <p className="text-xs text-black/30 text-center py-2">Aucune question sur cette page</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button onClick={() => setStep("grade")}
                  className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
                  <ChevronLeft className="h-4 w-4" /> Modifier
                </button>
                {batchMode ? (
                  <button onClick={printAllBatch} disabled={!batchStudents.some(b => b.isDone)}
                    className="flex items-center gap-2 px-7 py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition disabled:opacity-50">
                    <Printer className="h-4 w-4" /> Imprimer GROUPE ({batchStudents.filter(b => b.isDone).length} élèves)
                  </button>
                ) : (
                  <button onClick={() => setStep("print")}
                    className="flex items-center gap-2 px-7 py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition">
                    <Printer className="h-4 w-4" /> Imprimer ({displayPages.length} page{displayPages.length > 1 ? "s" : ""})
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ══ STEP 6 — PRINT (single mode) ══ */}
          {step === "print" && (
            <motion.div key="print" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-xl mx-auto pt-6">
              <div className="text-center">
                <h2 className="text-2xl font-black">Impression</h2>
                <p className="text-sm text-black/50 font-bold mt-1">
                  {batchMode ? `${batchStudents.filter(b => b.isDone).length} élèves prêts` : `${activeProfile.name} — ${displayPages.length} page(s)`}
                </p>
              </div>

              <div className="bg-white rounded-2xl border-4 border-black p-6 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {(batchMode ? [
                    ["Mode", "Groupe"],
                    ["Élèves", `${batchStudents.filter(b => b.isDone).length}/${batchStudents.length}`],
                    ["Pages / élève", `${displayPages.length}`],
                    ["Corrections", `${comments.length}`],
                  ] : [
                    ["Élève",       activeProfile.name],
                    ["Niveau",      `${criteriaLevel}/8`],
                    ["Police",      getFontFamily(activeProfile.fontKey)],
                    ["Pages",       `${displayPages.length}`],
                    ["Empreinte",   activeProfile.fingerprint ? `${activeProfile.fingerprint.confidenceScore}%` : "Manuelle"],
                    ["Corrections", `${comments.length}`],
                  ]).map(([k, v]) => (
                    <div key={k} className="p-2.5 bg-slate-50 rounded-xl">
                      <p className="text-[9px] font-black text-black/40">{k}</p>
                      <p className="font-black text-sm">{v}</p>
                    </div>
                  ))}
                </div>

                {/* Effect toggles for print */}
                <div className="p-3 bg-zinc-50 border-2 border-black/10 rounded-xl">
                  <p className="text-[9px] font-black text-black/40 mb-2">INCLURE DANS L'IMPRESSION :</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { k: "showRatures" as const,  label: "Ratures"  },
                      { k: "showBlanco" as const,   label: "Blanco"   },
                      { k: "showSmudges" as const,  label: "Bavures"  },
                      { k: "showComments" as const, label: "Corrections" },
                      { k: "showGeometry" as const, label: "Géométrie" },
                      { k: "showPressure" as const, label: "Pression"  },
                    ].map(t => (
                      <button key={t.k} onClick={() => setEffects(prev => ({ ...prev, [t.k]: !prev[t.k] }))}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-black transition
                          ${effects[t.k] ? "bg-black text-yellow-400 border-black" : "bg-white text-black/40 border-black/15"}`}>
                        {effects[t.k] ? <CheckCircle className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl space-y-1">
                  <p className="font-black text-sm text-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Prêt pour impression</p>
                  <p className="text-xs text-green-600">✓ Réponses directement sur les pages en écriture manuscrite</p>
                  {batchMode
                    ? <p className="text-xs text-green-600">✓ {batchStudents.filter(b => b.isDone).length} copies élèves uniques</p>
                    : <p className="text-xs text-green-600">✓ Écriture unique de {activeProfile.name}</p>}
                </div>

                <button
                  onClick={() => {
                    if (batchMode) {
                      printAllBatch();
                    } else {
                      printSingle(activeProfile, answers, offsets, comments);
                    }
                  }}
                  className="w-full py-5 bg-black text-yellow-400 border-4 border-black rounded-2xl font-black text-xl shadow-[6px_6px_0_rgba(250,204,21,1)] hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgba(250,204,21,1)] transition flex items-center justify-center gap-3">
                  <Printer className="h-6 w-6" />
                  {batchMode ? `IMPRIMER ${batchStudents.filter(b => b.isDone).length} ÉLÈVES` : "IMPRIMER TOUTES LES PAGES"}
                </button>

                <div className="flex gap-2">
                  <button onClick={() => setStep("preview")}
                    className="flex-1 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition flex items-center justify-center gap-1">
                    <ChevronLeft className="h-3.5 w-3.5" /> Aperçu
                  </button>
                  <button onClick={() => { setStep("students"); setVariantSeed(s => (s % 10) + 1); }}
                    className="flex-1 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition flex items-center justify-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Autre élève
                  </button>
                  <button onClick={() => { setStep("import"); setEvalPages([]); setQuestions([]); setAnswers({}); setComments([]); setShapes([]); setBatchStudents([]); setArtImages({}); }}
                    className="flex-1 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition flex items-center justify-center gap-1">
                    <RotateCcw className="h-3.5 w-3.5" /> Nouvelle éval
                  </button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
