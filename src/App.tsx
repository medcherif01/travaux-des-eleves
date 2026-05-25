/**
 * Les Évaluations Critériées de l'IB — Écoles Internationales Al Kawthar
 * v6 — Word import · 100% handwriting fidelity · Grade marks · Batch multi-select
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Sparkles, RotateCcw, CheckCircle, AlertCircle,
  Edit3, RefreshCw, User, Users, Plus, Trash2, ChevronLeft, ChevronRight,
  Save, Printer, Move, BookOpen, Zap, Sliders, Eye,
  PenTool, Triangle, Circle, Minus, MessageSquare, X, Settings,
  ToggleLeft, ToggleRight, Eraser, Image, Palette, Search,
  ArrowRight, GraduationCap, Layers, Wand2, ScanSearch, FileEdit,
  ChevronDown, ChevronUp, Star, Award, Target, Pencil,
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

interface BatchStudent {
  id: string;
  profile: StudentProfile;
  criteriaLevel: CriteriaLevel;
  answers: Record<string, string>;
  comments: TeacherComment[];
  offsets: Record<string, { x: number; y: number }>;
  isGenerating: boolean;
  isDone: boolean;
  // Per-student overlays (independent for each student)
  teacherNote: TeacherNote | null;
  gradeMarks: GradeMark[];
  artImages: Record<number, string>;
  artTransforms: Record<number, ArtTransform>;
  namePos: { x: number; y: number };
  effects: PageEffectOverrides;
}

// Grade mark draggable overlay (✓ / ✗ / note / date)
interface GradeMark {
  id: string;
  pageIndex: number;
  type: "check" | "cross" | "grade" | "date" | "custom";
  text: string;       // "✓" / "✗" / "7/8" / "15/05/2025" / custom
  x: number;         // % of page
  y: number;
  fontSize: number;  // rem-like units (2 = ~14px)
  color: string;
}

// Art image with transform (drag + resize + crop)
interface ArtTransform {
  x: number; y: number;       // % position
  w: number; h: number;       // % size
  cropX: number; cropY: number; cropW: number; cropH: number; // % crop rect (0-100)
  rotation: number;
}

interface TeacherComment {
  qId: string; text: string; symbol?: string;
  position: "above" | "right" | "below" | "margin";
  style?: "check" | "cross" | "circle" | "underline" | "arrow";
  ox: number; oy: number;
  teacherFontKey: string;
  teacherFontSize: number;
  teacherColor: string;
}

type TriangleSubtype = "quelconque" | "rectangle" | "equilateral" | "isocele";

interface GeometryShape {
  id: string; pageIndex: number;
  type: "line" | "circle" | "arc" | "rectangle" | "triangle";
  triangleSubtype?: TriangleSubtype;   // triangle variant
  x1: number; y1: number; x2?: number; y2?: number;
  x3?: number; y3?: number; radius?: number;
  startAngle?: number; endAngle?: number;
  label?: string; strokeColor?: string; strokeWidth?: number; pencilNoise?: number;
  // editable measures (override auto-computed display)
  measureW?: number;  // rectangle width in cm
  measureH?: number;  // rectangle height in cm
  measureR?: number;  // circle radius in cm
  measureL?: number;  // line/segment length in cm
  // transform
  rotation?: number;   // degrees around centroid
  offsetX?: number;    // drag offset in SVG units
  offsetY?: number;
  showMeasure?: boolean; // show length/angle
}

// Teacher evaluation note (global comment, shown on page 0)
interface TeacherNote {
  text: string;
  x: number;   // % of page width
  y: number;   // % of page height
  color: string;
  fontKey: string;
  fontSize: number;
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
  // ── Classiques (écolier / cahier) ──
  { key: "homemade-apple",  label: "Écolier",    family: "Homemade Apple",       cssVar: "--font-homemade",   category: "enfant"   },
  { key: "kalam",           label: "Cahier",     family: "Kalam",                cssVar: "--font-kalam",      category: "enfant"   },
  { key: "indie-flower",    label: "Bulle",      family: "Indie Flower",         cssVar: "--font-indie",      category: "enfant"   },
  { key: "patrick-hand",    label: "Propre",     family: "Patrick Hand",         cssVar: "--font-patrick",    category: "enfant"   },
  { key: "caveat",          label: "Rapide",     family: "Caveat",               cssVar: "--font-caveat",     category: "enfant"   },
  // ── Cursive / Stylo ──
  { key: "marck-script",    label: "Feutre",     family: "Marck Script",         cssVar: "--font-marck",      category: "cursive"  },
  { key: "bad-script",      label: "Plume",      family: "Bad Script",           cssVar: "--font-badscript",  category: "cursive"  },
  { key: "dancing-script",  label: "Cursive",    family: "Dancing Script",       cssVar: "--font-dancing",    category: "cursive"  },
  { key: "shadows",         label: "Légère",     family: "Shadows Into Light",   cssVar: "--font-shadows",    category: "cursive"  },
  { key: "nothing",         label: "Naturelle",  family: "Nothing You Could Do", cssVar: "--font-nothing",    category: "cursive"  },
  // ── Élégante / Calligraphie ──
  { key: "parisienne",      label: "Fine",       family: "Parisienne",           cssVar: "--font-parisienne", category: "elegante" },
  { key: "allura",          label: "Fluide",     family: "Allura",               cssVar: "--font-allura",     category: "elegante" },
  { key: "la-belle-aurore", label: "Stylée",     family: "La Belle Aurore",      cssVar: "--font-la-belle",   category: "elegante" },
  { key: "satisfy",         label: "Ronde",      family: "Satisfy",              cssVar: "--font-satisfy",    category: "elegante" },
  { key: "sacramento",      label: "Italique",   family: "Sacramento",           cssVar: "--font-sacramento", category: "elegante" },
  { key: "great-vibes",     label: "Calligr.",   family: "Great Vibes",          cssVar: "--font-greatvibes", category: "elegante" },
];

const INK_COLORS = [
  { label: "Bleu stylo",  value: "#1d3278" }, { label: "Bleu royal", value: "#1e40af" },
  { label: "Bleu marine", value: "#172554" }, { label: "Noir encre", value: "#1c1c1e" },
  { label: "Rouge",       value: "#be0000" }, { label: "Vert forêt", value: "#0a7a2a" },
  { label: "Violet",      value: "#6b21a8" }, { label: "Indigo",     value: "#3730a3" },
];

const TEACHER_COLORS = [
  { label: "Rouge",  value: "#dc2626" }, { label: "Vert",   value: "#16a34a" },
  { label: "Violet", value: "#7c3aed" }, { label: "Bleu",   value: "#2563eb" },
  { label: "Orange", value: "#ea580c" }, { label: "Noir",   value: "#111111" },
];

const DEFAULT_TEACHER_FONT     = "homemade-apple";
const DEFAULT_TEACHER_COLOR    = "#dc2626";
const DEFAULT_TEACHER_FONTSIZE = 2.8;

const FONT_KEY_MAP: Record<string, string> = {
  "homemade apple": "homemade-apple", "marck script": "marck-script",
  parisienne: "parisienne", allura: "allura",
  "la belle aurore": "la-belle-aurore", "bad script": "bad-script",
  caveat: "caveat", kalam: "kalam",
  "indie flower": "indie-flower", "patrick hand": "patrick-hand",
  "dancing script": "dancing-script", satisfy: "satisfy",
  sacramento: "sacramento", "great vibes": "great-vibes",
  "shadows into light": "shadows", "nothing you could do": "nothing",
};
const COLOR_MAP: Record<string, string> = {
  blue: "#1d3278", black: "#1c1c1e", red: "#be0000", green: "#0a7a2a",
};

const STEPS: { key: WorkflowStep; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: "import",   label: "Importer",  icon: <Upload className="h-4 w-4" />,        desc: "PDF ou image" },
  { key: "students", label: "Élèves",    icon: <GraduationCap className="h-4 w-4" />, desc: "Profils & écriture" },
  { key: "grade",    label: "Niveau",    icon: <Target className="h-4 w-4" />,         desc: "Critères" },
  { key: "solve",    label: "Résoudre",  icon: <Wand2 className="h-4 w-4" />,          desc: "Gemini AI" },
  { key: "preview",  label: "Aperçu",    icon: <Eye className="h-4 w-4" />,            desc: "Éditer & ajuster" },
  { key: "print",    label: "Imprimer",  icon: <Printer className="h-4 w-4" />,        desc: "Export final" },
];

function getFontVar(key: string)    { return HANDWRITING_FONTS.find(f => f.key === key)?.cssVar   ?? "--font-homemade"; }
function getFontFamily(key: string) { return HANDWRITING_FONTS.find(f => f.key === key)?.family   ?? "Homemade Apple"; }

function defaultProfile(name = "Élève 1"): StudentProfile {
  return {
    name, hwImage: null, hwImageBase64: "", hwImageName: "",
    fontKey: "homemade-apple", inkColor: "#1d3278",
    fontSize: 17, rotationAngle: -0.5, skewAngle: -3,
    wordDrift: 1.5, letterSpacing: -0.5, messinessIntensity: 3.0,
    enableUnreadableLetters: true, letterCaseChaos: true,
    inkDrySkipping: true, penThickness: 1.5, penType: "ballpoint",
    // ALL realism effects ON by default for maximum handwriting fidelity
    enableRatures: true, raturesRate: 0.05,
    enableBlanco: true,  blancoRate: 0.025,
    enableSmudges: true, enablePressureVar: true,
    enableLineWobble: true, lineWobbleAmp: 2.0,
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
    // Per-student overlays — each student has their own
    teacherNote: null,
    gradeMarks: [],
    artImages: {},
    artTransforms: {},
    namePos: { x: 55, y: 4 },
    effects: defaultEffects(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANSWER ENGINE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip markdown fences, isolate outermost JSON object, parse safely.
 * Never throws — returns {} on any failure.
 */
function safeParseGeminiResponse(raw: string): Record<string, unknown> {
  if (!raw || typeof raw !== "string") return {};

  let cleaned = raw.trim();
  // Remove ```json ... ``` or ``` ... ``` fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "");
  // Find outermost JSON object
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd   = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  console.log("[Gemini CLEAN]", cleaned.substring(0, 300));

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    console.error("[Gemini PARSE ERROR]", (e as Error).message, cleaned.substring(0, 200));
    return {};
  }
}

/**
 * Flatten an unknown value into a plain string.
 * Accepts strings, nested objects with .answer/.text/.response, arrays joined by space.
 */
function flattenValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.answer   === "string") return obj.answer;
    if (typeof obj.text     === "string") return obj.text;
    if (typeof obj.response === "string") return obj.response;
    if (typeof obj.content  === "string") return obj.content;
    if (Array.isArray(obj)) return (obj as unknown[]).map(flattenValue).filter(Boolean).join(" ");
    return Object.values(obj).map(flattenValue).filter(Boolean).join(" ");
  }
  return String(v);
}

/**
 * 4-tier ID matching: exact → case-insensitive → normalise symbols → numeric suffix → positional.
 * Each raw key can be claimed by at most one question (usedKeys set).
 */
function normalizeGeminiAnswers(
  rawAnswers: Record<string, unknown>,
  questions: DetectedQuestion[]
): Record<string, string> {
  console.log("[normalizeGeminiAnswers] raw keys:", Object.keys(rawAnswers));
  console.log("[normalizeGeminiAnswers] question ids:", questions.map(q => q.id));

  // Flatten all values to strings
  const raw: Record<string, string> = Object.fromEntries(
    Object.entries(rawAnswers).map(([k, v]) => [k, flattenValue(v)])
  );

  const normKey = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, "");
  const numOnly = (s: string) => s.replace(/\D/g, "");

  const result: Record<string, string> = {};
  const usedKeys = new Set<string>();

  questions.forEach((q, idx) => {
    // Tier 1 — exact match
    if (raw[q.id] !== undefined && !usedKeys.has(q.id)) {
      result[q.id] = raw[q.id];
      usedKeys.add(q.id);
      return;
    }
    // Tier 2 — case-insensitive
    const ci = Object.keys(raw).find(k => !usedKeys.has(k) && k.toLowerCase() === q.id.toLowerCase());
    if (ci) { result[q.id] = raw[ci]; usedKeys.add(ci); return; }

    // Tier 3 — normalise symbols (q_1, q-1, q.1 → q1)
    const qNorm = normKey(q.id);
    const sym = Object.keys(raw).find(k => !usedKeys.has(k) && normKey(k) === qNorm);
    if (sym) { result[q.id] = raw[sym]; usedKeys.add(sym); return; }

    // Tier 3b — numeric suffix (q1 ~ question_1 both end in "1")
    const qNum = numOnly(q.id);
    if (qNum) {
      const numMatch = Object.keys(raw).find(k => !usedKeys.has(k) && numOnly(k) === qNum);
      if (numMatch) { result[q.id] = raw[numMatch]; usedKeys.add(numMatch); return; }
    }

    // Tier 4 — positional fallback (first unclaimed key)
    const available = Object.entries(raw).filter(([k]) => !usedKeys.has(k));
    if (available.length > 0) {
      result[q.id] = available[0][1];
      usedKeys.add(available[0][0]);
    }
  });

  console.log("[normalizeGeminiAnswers] mapped:", Object.keys(result).length, "/", questions.length, "questions");
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// HASH HELPERS
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
// STEP RAIL (left sidebar)
// ─────────────────────────────────────────────────────────────────────────────
function StepRail({ current, onGoto }: { current: WorkflowStep; onGoto: (s: WorkflowStep) => void }) {
  const ci = STEPS.findIndex(s => s.key === current);
  return (
    <nav className="hidden lg:flex flex-col w-56 shrink-0 min-h-screen py-5 px-3 gap-0.5"
      style={{ background: "linear-gradient(160deg,#1e1b4b 0%,#0f172a 100%)" }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 pb-5 border-b border-white/10 mb-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black italic text-xl shadow-xl shrink-0"
          style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>nb</div>
        <div>
          <p className="font-black text-xs leading-none text-white tracking-tight">Al Kawthar IB</p>
          <p className="text-[9px] font-semibold mt-0.5" style={{ color: "rgba(165,180,252,0.7)" }}>Évaluations Critériées</p>
        </div>
      </div>
      {STEPS.map((s, i) => {
        const active = s.key === current, done = i < ci, locked = i > ci + 1 && !done;
        return (
          <button key={s.key}
            onClick={() => !locked && onGoto(s.key)}
            disabled={locked}
            title={locked ? "Complétez les étapes précédentes" : s.desc}
            className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 relative
              ${active
                ? "text-white shadow-lg"
                : done ? "text-white/60 hover:text-white hover:bg-white/8 cursor-pointer"
                : i === ci + 1 ? "text-white/35 hover:bg-white/5 cursor-pointer"
                : "text-white/15 cursor-not-allowed"}`}
            style={active ? { background: "linear-gradient(135deg,rgba(99,102,241,0.9),rgba(139,92,246,0.8))", boxShadow: "0 4px 15px rgba(99,102,241,0.4)" } : {}}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black transition-all
              ${active ? "bg-white/20" : done ? "bg-indigo-500/50" : "bg-white/5"}`}>
              {done ? <CheckCircle className="h-3.5 w-3.5 text-indigo-300" /> : s.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold leading-none">{s.label}</p>
              <p className={`text-[10px] mt-0.5 leading-none ${active ? "text-white/60" : "text-white/25"}`}>{s.desc}</p>
            </div>
            {done && !active && <CheckCircle className="h-3 w-3 text-indigo-400/70 ml-auto shrink-0" />}
          </button>
        );
      })}
      <div className="mt-auto pt-4 border-t border-white/10 px-2 space-y-1">
        <p className="text-[9px] font-bold" style={{ color: "rgba(165,180,252,0.5)" }}>● Rotation 10 clés Gemini</p>
        <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>3 passes · Anti-quota · Fallback</p>
      </div>
    </nav>
  );
}

// Mobile step bar
function StepBar({ current, onGoto }: { current: WorkflowStep; onGoto: (s: WorkflowStep) => void }) {
  const ci = STEPS.findIndex(s => s.key === current);
  return (
    <div className="lg:hidden flex items-center gap-0.5 px-2 py-2 bg-slate-900 overflow-x-auto">
      {STEPS.map((s, i) => {
        const active = s.key === current, done = i < ci;
        return (
          <React.Fragment key={s.key}>
            <button onClick={() => (done || active || i === ci + 1) && onGoto(s.key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition shrink-0
                ${active ? "bg-indigo-500 text-white"
                  : done ? "text-indigo-300 hover:bg-white/10 cursor-pointer"
                  : i === ci + 1 ? "text-white/50 hover:bg-white/10 cursor-pointer"
                  : "text-white/20 cursor-default"}`}>
              {done ? <CheckCircle className="h-2.5 w-2.5" /> : s.icon}
              {s.label}
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-white/20 shrink-0" />}
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
        <path d="M0,0 L4,2 L0,4 Z" fill="#dc2626" />
      </marker>
    </defs>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDWRITTEN TEXT
// ─────────────────────────────────────────────────────────────────────────────
function HandwrittenText({ text, qId, profile, variantSeed, effects }: {
  text: string; qId: string; profile: StudentProfile;
  variantSeed: number; effects: PageEffectOverrides;
}) {
  if (!text) return null;
  const fp = profile.fingerprint;
  // Lower threshold to 40% for maximum fidelity — any usable fingerprint is applied
  const useFP = !!fp && (fp.confidenceScore ?? 0) >= 40;
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
// PAGE REALISM
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
// GEOMETRY LAYER — with drag, rotation and measurements
// ─────────────────────────────────────────────────────────────────────────────
function shapeCentroid(sh: GeometryShape): { cx: number; cy: number } {
  if (sh.type === "circle") return { cx: sh.x1, cy: sh.y1 };
  if (sh.type === "line" && sh.x2 !== undefined && sh.y2 !== undefined)
    return { cx: (sh.x1 + sh.x2) / 2, cy: (sh.y1 + sh.y2) / 2 };
  if (sh.type === "rectangle" && sh.x2 !== undefined && sh.y2 !== undefined)
    return { cx: (sh.x1 + sh.x2) / 2, cy: (sh.y1 + sh.y2) / 2 };
  if (sh.type === "triangle" && sh.x2 !== undefined && sh.y2 !== undefined && sh.x3 !== undefined && sh.y3 !== undefined)
    return { cx: (sh.x1 + sh.x2 + sh.x3) / 3, cy: (sh.y1 + sh.y2 + sh.y3) / 3 };
  return { cx: sh.x1, cy: sh.y1 };
}

function lineLength(x1: number, y1: number, x2: number, y2: number, svgW = 100, svgH = 141.4): string {
  // rough conversion: SVG units to cm assuming A4 at 21cm width
  const dx = (x2 - x1) / svgW * 21;
  const dy = (y2 - y1) / svgH * 29.7;
  return `${Math.sqrt(dx * dx + dy * dy).toFixed(1)} cm`;
}

function angleDeg(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): string {
  // angle at vertex (x2,y2)
  const a1 = Math.atan2(y1 - y2, x1 - x2);
  const a2 = Math.atan2(y3 - y2, x3 - x2);
  let deg = Math.abs((a2 - a1) * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return `${deg.toFixed(0)}°`;
}

function GeometryLayer({ shapes, pageIndex, filterId, editMode, onUpdateShape, selectedShapeId, onSelectShape }: {
  shapes: GeometryShape[]; pageIndex: number; filterId: string;
  editMode?: boolean;
  onUpdateShape?: (id: string, patch: Partial<GeometryShape>) => void;
  selectedShapeId?: string | null;
  onSelectShape?: (id: string | null) => void;
}) {
  const ps = shapes.filter(s => s.pageIndex === pageIndex);
  if (!ps.length) return null;

  const dragging = useRef<{ id: string; startSvgX: number; startSvgY: number; origX1: number; origY1: number; origX2?: number; origY2?: number; origX3?: number; origY3?: number; origRadius?: number } | null>(null);
  const rotating = useRef<{ id: string; startAngle: number; origRotation: number; cx: number; cy: number } | null>(null);
  const gRef = useRef<SVGGElement>(null);

  // Get SVG coordinates from mouse event — find closest SVG ancestor
  const toSvg = (e: MouseEvent | React.MouseEvent): { x: number; y: number } => {
    const g = gRef.current;
    const svg = g?.closest("svg") as SVGSVGElement | null;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 141.4,
    };
  };

  useEffect(() => {
    if (!editMode) return;
    const mv = (e: MouseEvent) => {
      if (dragging.current && onUpdateShape) {
        const { id, startSvgX, startSvgY, origX1, origY1, origX2, origY2, origX3, origY3 } = dragging.current;
        const pos = toSvg(e);
        const dx = pos.x - startSvgX;
        const dy = pos.y - startSvgY;
        onUpdateShape(id, {
          x1: origX1 + dx, y1: origY1 + dy,
          ...(origX2 !== undefined ? { x2: origX2 + dx } : {}),
          ...(origY2 !== undefined ? { y2: origY2 + dy } : {}),
          ...(origX3 !== undefined ? { x3: origX3 + dx } : {}),
          ...(origY3 !== undefined ? { y3: origY3 + dy } : {}),
        });
      }
      if (rotating.current && onUpdateShape) {
        const { id, cx, cy, origRotation } = rotating.current;
        const pos = toSvg(e);
        const angle = Math.atan2(pos.y - cy, pos.x - cx) * 180 / Math.PI;
        const delta = angle - rotating.current.startAngle;
        onUpdateShape(id, { rotation: origRotation + delta });
      }
    };
    const up = () => { dragging.current = null; rotating.current = null; };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [editMode, onUpdateShape]);

  return (
    <g ref={gRef}>
      {ps.map(sh => {
        const pencil = `url(#pencil-${filterId})`;
        const col = sh.strokeColor || "#2d2d3a";
        const sw  = sh.strokeWidth ?? 0.35;
        const n   = sh.pencilNoise ?? 0.4;
        const op  = 0.82 + n * 0.08;
        const rot = sh.rotation ?? 0;
        const { cx, cy } = shapeCentroid(sh);
        const isSelected = selectedShapeId === sh.id;
        const transform = rot !== 0 ? `rotate(${rot},${cx},${cy})` : undefined;
        const selStyle = isSelected && editMode ? { cursor: "grab" } : {};

        const onMouseDownDrag = editMode ? (e: React.MouseEvent) => {
          e.stopPropagation();
          onSelectShape?.(sh.id);
          const pos = toSvg(e);
          dragging.current = {
            id: sh.id, startSvgX: pos.x, startSvgY: pos.y,
            origX1: sh.x1, origY1: sh.y1,
            origX2: sh.x2, origY2: sh.y2,
            origX3: sh.x3, origY3: sh.y3,
            origRadius: sh.radius,
          };
        } : undefined;

        const onMouseDownRotate = editMode ? (e: React.MouseEvent) => {
          e.stopPropagation();
          const pos = toSvg(e);
          const startAngle = Math.atan2(pos.y - cy, pos.x - cx) * 180 / Math.PI;
          rotating.current = { id: sh.id, startAngle, origRotation: rot, cx, cy };
        } : undefined;

        if (sh.type === "line" && sh.x2 !== undefined && sh.y2 !== undefined) {
          const mx = (sh.x1 + sh.x2) / 2 + (n - 0.5) * 0.4;
          const my = (sh.y1 + sh.y2) / 2 + (n - 0.5) * 0.4;
          const len = lineLength(sh.x1, sh.y1, sh.x2, sh.y2);
          // Compute angle in degrees (0-360)
          const rawAngle = Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1) * 180 / Math.PI;
          const angDisplay = `${((rawAngle + 360) % 360).toFixed(0)}°`;
          return (
            <g key={sh.id} transform={transform} style={selStyle} onMouseDown={onMouseDownDrag}>
              <g style={{ filter: pencil }} opacity={op}>
                <polyline points={`${sh.x1},${sh.y1} ${mx},${my} ${sh.x2},${sh.y2}`}
                  fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
                {/* Length label */}
                <text x={mx} y={my - 1.2} fontSize="2.2" fill={col} textAnchor="middle"
                  fontFamily="var(--font-homemade)">{sh.label || len}</text>
                {/* Angle label (shown when showMeasure) */}
                {sh.showMeasure !== false && (
                  <text x={mx} y={my + 3.5} fontSize="1.8" fill="#6b21a8" textAnchor="middle"
                    fontFamily="var(--font-homemade)" opacity={0.85}>
                    {angDisplay}
                  </text>
                )}
                {/* Endpoints dots */}
                <circle cx={sh.x1} cy={sh.y1} r="0.5" fill={col} opacity={0.6} />
                <circle cx={sh.x2} cy={sh.y2} r="0.5" fill={col} opacity={0.6} />
              </g>
              {isSelected && editMode && (
                <g>
                  {/* Drag hit area */}
                  <line x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2}
                    stroke="transparent" strokeWidth="3" style={{ cursor: "grab" }} />
                  {/* Rotate handle at end of segment */}
                  <circle cx={sh.x2} cy={sh.y2} r="1.5"
                    fill="#6366f1" stroke="white" strokeWidth="0.3"
                    style={{ cursor: "crosshair" }}
                    onMouseDown={onMouseDownRotate} />
                  {/* Selection highlight */}
                  <polyline points={`${sh.x1},${sh.y1} ${sh.x2},${sh.y2}`}
                    fill="none" stroke="#6366f1" strokeWidth="0.4" strokeDasharray="1,0.5" opacity={0.6} />
                </g>
              )}
            </g>
          );
        }
        if (sh.type === "circle" && sh.radius) {
          const pts = Array.from({ length: 49 }, (_, i) => {
            const a = (i / 48) * 2 * Math.PI;
            const rr = sh.radius! + Math.sin(a * 7 + n * 10) * n * 0.3;
            return `${sh.x1 + Math.cos(a) * rr},${sh.y1 + Math.sin(a) * rr}`;
          }).join(" ");
          const radiusCm = `r=${(sh.radius / 100 * 21).toFixed(1)}cm`;
          return (
            <g key={sh.id} transform={transform} style={selStyle} onMouseDown={onMouseDownDrag}>
              <g style={{ filter: pencil }} opacity={op}>
                <polyline points={pts} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
                <text x={sh.x1} y={sh.y1 - sh.radius - 0.8} fontSize="2.2" fill={col}
                  textAnchor="middle" fontFamily="var(--font-homemade)">{sh.label || radiusCm}</text>
              </g>
              {isSelected && editMode && (
                <g>
                  <circle cx={sh.x1} cy={sh.y1} r={sh.radius}
                    fill="transparent" stroke="#6366f1" strokeWidth="0.4" strokeDasharray="1,0.5" />
                  {/* Rotate handle at top of circle */}
                  <circle cx={sh.x1} cy={sh.y1 - sh.radius - 1.5} r="1.5"
                    fill="#6366f1" stroke="white" strokeWidth="0.3"
                    style={{ cursor: "crosshair" }}
                    onMouseDown={onMouseDownRotate} />
                </g>
              )}
            </g>
          );
        }
        if (sh.type === "rectangle" && sh.x2 !== undefined && sh.y2 !== undefined) {
          const pts = [`${sh.x1},${sh.y1}`,`${sh.x2},${sh.y1}`,`${sh.x2},${sh.y2}`,`${sh.x1},${sh.y2}`,`${sh.x1},${sh.y1}`].join(" ");
          const w = Math.abs(sh.x2 - sh.x1);
          const h = Math.abs(sh.y2 - sh.y1);
          const wCm = `${(w / 100 * 21).toFixed(1)}cm`;
          const hCm = `${(h / 141.4 * 29.7).toFixed(1)}cm`;
          return (
            <g key={sh.id} transform={transform} style={selStyle} onMouseDown={onMouseDownDrag}>
              <g style={{ filter: pencil }} opacity={op}>
                <polyline points={pts} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
                {/* Width label */}
                <text x={cx} y={sh.y1 - 0.8} fontSize="2" fill={col} textAnchor="middle"
                  fontFamily="var(--font-homemade)">{wCm}</text>
                {/* Height label */}
                <text x={sh.x2 + 1} y={cy} fontSize="2" fill={col} textAnchor="start"
                  fontFamily="var(--font-homemade)">{hCm}</text>
              </g>
              {isSelected && editMode && (
                <g>
                  <rect x={sh.x1} y={sh.y1} width={w} height={h}
                    fill="transparent" stroke="#6366f1" strokeWidth="0.4" strokeDasharray="1,0.5" />
                  {/* Rotate handle — top right corner */}
                  <circle cx={sh.x2} cy={sh.y1 - 2} r="1.5"
                    fill="#6366f1" stroke="white" strokeWidth="0.3"
                    style={{ cursor: "crosshair" }}
                    onMouseDown={onMouseDownRotate} />
                  {/* Corner handles */}
                  {[{x: sh.x1, y: sh.y1},{x: sh.x2, y: sh.y1},{x: sh.x2, y: sh.y2},{x: sh.x1, y: sh.y2}].map((pt, i) => (
                    <rect key={i} x={pt.x - 1} y={pt.y - 1} width={2} height={2}
                      fill="white" stroke="#6366f1" strokeWidth="0.3" rx="0.2" />
                  ))}
                </g>
              )}
            </g>
          );
        }
        if (sh.type === "triangle" && sh.x2 !== undefined && sh.y2 !== undefined && sh.x3 !== undefined && sh.y3 !== undefined) {
          // Compute angles at each vertex
          const ang1 = angleDeg(sh.x2, sh.y2, sh.x1, sh.y1, sh.x3, sh.y3);
          const ang2 = angleDeg(sh.x1, sh.y1, sh.x2, sh.y2, sh.x3, sh.y3);
          const ang3 = angleDeg(sh.x1, sh.y1, sh.x3, sh.y3, sh.x2, sh.y2);
          return (
            <g key={sh.id} transform={transform} style={selStyle} onMouseDown={onMouseDownDrag}>
              <g style={{ filter: pencil }} opacity={op}>
                <polygon points={`${sh.x1},${sh.y1} ${sh.x2},${sh.y2} ${sh.x3},${sh.y3}`}
                  fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
                {/* Side lengths */}
                <text x={(sh.x1+sh.x2)/2} y={(sh.y1+sh.y2)/2 - 1} fontSize="1.8" fill={col}
                  textAnchor="middle" fontFamily="var(--font-homemade)">
                  {lineLength(sh.x1,sh.y1,sh.x2,sh.y2)}
                </text>
                <text x={(sh.x2+sh.x3)/2 + 1} y={(sh.y2+sh.y3)/2} fontSize="1.8" fill={col}
                  textAnchor="start" fontFamily="var(--font-homemade)">
                  {lineLength(sh.x2,sh.y2,sh.x3,sh.y3)}
                </text>
                <text x={(sh.x1+sh.x3)/2} y={(sh.y1+sh.y3)/2 + 2} fontSize="1.8" fill={col}
                  textAnchor="middle" fontFamily="var(--font-homemade)">
                  {lineLength(sh.x1,sh.y1,sh.x3,sh.y3)}
                </text>
                {/* Angle labels */}
                {sh.showMeasure !== false && (
                  <>
                    <text x={sh.x1} y={sh.y1 - 1.2} fontSize="1.6" fill="#6b21a8"
                      textAnchor="middle" fontFamily="var(--font-homemade)">{ang1}</text>
                    <text x={sh.x2 - 2} y={sh.y2 + 2} fontSize="1.6" fill="#6b21a8"
                      textAnchor="middle" fontFamily="var(--font-homemade)">{ang2}</text>
                    <text x={sh.x3 + 2} y={sh.y3 + 2} fontSize="1.6" fill="#6b21a8"
                      textAnchor="middle" fontFamily="var(--font-homemade)">{ang3}</text>
                  </>
                )}
              </g>
              {isSelected && editMode && (
                <g>
                  <polygon points={`${sh.x1},${sh.y1} ${sh.x2},${sh.y2} ${sh.x3},${sh.y3}`}
                    fill="transparent" stroke="#6366f1" strokeWidth="0.4" strokeDasharray="1,0.5" />
                  {/* Rotate handle */}
                  <circle cx={cx} cy={cy - 5} r="1.5"
                    fill="#6366f1" stroke="white" strokeWidth="0.3"
                    style={{ cursor: "crosshair" }}
                    onMouseDown={onMouseDownRotate} />
                  {/* Vertex handles */}
                  {[{x: sh.x1, y: sh.y1},{x: sh.x2, y: sh.y2},{x: sh.x3, y: sh.y3}].map((pt, i) => (
                    <circle key={i} cx={pt.x} cy={pt.y} r="1.3"
                      fill="white" stroke="#6366f1" strokeWidth="0.3" />
                  ))}
                </g>
              )}
            </g>
          );
        }
        return null;
      })}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER COMMENT LAYER
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
        let bx = q.x, by = q.y;
        if (c.position === "right")  { bx = Math.min(q.x + (q.maxWidth ?? 60) + 2, 85); by = q.y; }
        if (c.position === "above")  { bx = q.x; by = Math.max(2, q.y - 5); }
        if (c.position === "below")  { bx = q.x; by = q.y + 7; }
        if (c.position === "margin") { bx = 1;   by = q.y; }
        const cx = bx + c.ox, cy = by + c.oy;
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
            {(c.symbol === "✓" || c.style === "check") && (
              <text x={cx - 2} y={cy} fontSize={fSize + 1.5} fill={fill}
                fontFamily="Arial" fontWeight="bold" opacity={0.92}
                style={{ filter: `url(#ink-blur-${filterId})` }}>✓</text>
            )}
            {(c.symbol === "✗" || c.style === "cross") && (
              <text x={cx - 2} y={cy} fontSize={fSize + 1.5} fill={fill}
                fontFamily="Arial" fontWeight="bold" opacity={0.92}
                style={{ filter: `url(#ink-blur-${filterId})` }}>✗</text>
            )}
            {c.style === "underline" && (
              <line x1={q.x} y1={q.y + 2.5} x2={q.x + (q.maxWidth ?? 60) * 0.5} y2={q.y + 2.5}
                stroke={fill} strokeWidth="0.3" strokeLinecap="round" opacity={0.8}
                style={{ filter: `url(#ink-blur-${filterId})` }} />
            )}
            {c.style === "circle" && (
              <ellipse cx={cx + 8} cy={cy - 1.5} rx="9" ry="3.5"
                fill="none" stroke={fill} strokeWidth="0.5"
                opacity={0.75} style={{ filter: `url(#ink-blur-${filterId})` }} />
            )}
            {c.style === "arrow" && (
              <line x1={cx + 2} y1={cy - 1} x2={q.x + 5} y2={q.y + 2}
                stroke={fill} strokeWidth="0.4" strokeLinecap="round"
                markerEnd={`url(#arrow-${filterId})`} opacity={0.85} />
            )}
            {draggable && (
              <circle cx={cx - 1} cy={cy - fSize * 0.5} r="0.7" fill={fill} opacity={0.5} />
            )}
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
// DRAGGABLE ANSWER OVERLAY
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
      left: `${question.x}%`, top: `${question.y}%`,
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      cursor: editMode ? "move" : "default",
      maxWidth: `${question.maxWidth ?? 78}%`,
      zIndex: 5, userSelect: "none",
    }}>
      {editMode && (
        <div style={{
          position: "absolute", top: -14, left: 0, fontSize: 8,
          background: "#6366f1", color: "#fff", padding: "1px 4px",
          borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none",
        }}>✥ {question.id}</div>
      )}
      <HandwrittenText text={answer} qId={question.id}
        profile={profile} variantSeed={variantSeed} effects={effects} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE GRADE MARK (✓ ✗ note finale date)
// ─────────────────────────────────────────────────────────────────────────────
function DraggableGradeMark({ mark, editMode, onMove, onSelect, selected }: {
  mark: GradeMark; editMode: boolean;
  onMove: (id: string, dx: number, dy: number) => void;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ sx: number; sy: number } | null>(null);

  useEffect(() => {
    if (!editMode) return;
    const getPos = (e: MouseEvent | TouchEvent) => {
      if ("touches" in e) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
    };
    const mv = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current || !ref.current) return;
      const container = ref.current.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pos = getPos(e);
      const dx = ((pos.x - dragging.current.sx) / rect.width) * 100;
      const dy = ((pos.y - dragging.current.sy) / rect.height) * 100;
      dragging.current = { sx: pos.x, sy: pos.y };
      onMove(mark.id, dx, dy);
    };
    const up = () => { dragging.current = null; };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv);
      window.removeEventListener("touchend", up);
    };
  }, [editMode, onMove, mark.id]);

  const fontSizePx = mark.fontSize * 14;
  const isSymbol = mark.type === "check" || mark.type === "cross";
  const isGrade = mark.type === "grade";

  return (
    <div
      ref={ref}
      onMouseDown={e => {
        if (!editMode) return;
        e.stopPropagation();
        dragging.current = { sx: e.clientX, sy: e.clientY };
        onSelect(mark.id);
      }}
      onTouchStart={e => {
        if (!editMode) return;
        e.stopPropagation();
        const t = e.touches[0];
        dragging.current = { sx: t.clientX, sy: t.clientY };
        onSelect(mark.id);
      }}
      style={{
        position: "absolute",
        left: `${mark.x}%`, top: `${mark.y}%`,
        color: mark.color,
        fontSize: fontSizePx,
        fontFamily: isSymbol ? "Arial, sans-serif" : "'Homemade Apple', cursive",
        fontWeight: isSymbol ? 900 : 700,
        fontStyle: "italic",
        zIndex: 8,
        cursor: editMode ? "grab" : "default",
        userSelect: "none",
        transform: `rotate(${isSymbol ? -3 : isGrade ? -2 : -1.5}deg)`,
        filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.15)) ${isGrade ? "drop-shadow(0 0 4px rgba(220,38,38,0.3))" : ""}`,
        lineHeight: 1,
        outline: selected && editMode ? `2px dashed ${mark.color}` : "none",
        borderRadius: 2,
        padding: selected && editMode ? "2px 4px" : 0,
        transition: "filter 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {mark.text}
      {editMode && (
        <div style={{
          position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
          fontSize: 7, background: "rgba(220,38,38,0.85)", color: "#fff",
          padding: "1px 3px", borderRadius: 2, whiteSpace: "nowrap", pointerEvents: "none",
          opacity: selected ? 1 : 0, transition: "opacity 0.15s",
        }}>✥ glisser</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE ART IMAGE (drag + resize + crop)
// ─────────────────────────────────────────────────────────────────────────────
function DraggableArtImage({ src, transform, editMode, onUpdate }: {
  src: string; transform: ArtTransform; editMode: boolean;
  onUpdate: (patch: Partial<ArtTransform>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ type: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  useEffect(() => {
    if (!editMode) return;
    const getPos = (e: MouseEvent | TouchEvent) => {
      if ("touches" in e && e.touches.length > 0)
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
    };
    const mv = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current || !ref.current) return;
      const container = ref.current.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pos = getPos(e);
      const dx = ((pos.x - dragRef.current.sx) / rect.width) * 100;
      const dy = ((pos.y - dragRef.current.sy) / rect.height) * 100;
      if (dragRef.current.type === "move") {
        onUpdate({
          x: Math.max(0, Math.min(90, dragRef.current.ox + dx)),
          y: Math.max(0, Math.min(90, dragRef.current.oy + dy)),
        });
      } else {
        onUpdate({
          w: Math.max(5, Math.min(100, dragRef.current.ow + dx)),
          h: Math.max(5, Math.min(100, dragRef.current.oh + dy)),
        });
      }
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv);
      window.removeEventListener("touchend", up);
    };
  }, [editMode, onUpdate]);

  const { cropX, cropY, cropW, cropH } = transform;
  const hasCrop = cropW < 100 || cropH < 100 || cropX > 0 || cropY > 0;

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = { type: "move", sx: clientX, sy: clientY, ox: transform.x, oy: transform.y, ow: transform.w, oh: transform.h };
  };
  const startResize = (clientX: number, clientY: number) => {
    dragRef.current = { type: "resize", sx: clientX, sy: clientY, ox: transform.x, oy: transform.y, ow: transform.w, oh: transform.h };
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: `${transform.x}%`, top: `${transform.y}%`,
        width: `${transform.w}%`, height: `${transform.h}%`,
        zIndex: 4,
        cursor: editMode ? "grab" : "default",
        overflow: "hidden",
        borderRadius: 2,
        transform: `rotate(${transform.rotation}deg)`,
        outline: editMode ? "2px dashed rgba(99,102,241,0.7)" : "none",
        boxShadow: editMode ? "0 0 0 1px rgba(99,102,241,0.3)" : "none",
      }}
      onMouseDown={e => {
        if (!editMode) return;
        e.stopPropagation();
        startDrag(e.clientX, e.clientY);
      }}
      onTouchStart={e => {
        if (!editMode) return;
        e.stopPropagation();
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }}
    >
      <img
        src={src}
        alt="Art"
        draggable={false}
        style={{
          position: "absolute",
          left: hasCrop ? `${-(cropX / cropW) * 100}%` : 0,
          top:  hasCrop ? `${-(cropY / cropH) * 100}%` : 0,
          width: hasCrop ? `${(100 / cropW) * 100}%` : "100%",
          height: hasCrop ? `${(100 / cropH) * 100}%` : "100%",
          objectFit: "fill",
          pointerEvents: "none",
        }}
      />
      {/* Drag hint overlay */}
      {editMode && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(99,102,241,0.08)", pointerEvents: "none",
        }}>
          <div style={{ background: "rgba(99,102,241,0.85)", color: "#fff", fontSize: 9, fontWeight: 700,
            padding: "2px 6px", borderRadius: 4, opacity: 0.85 }}>
            ✥ Glisser
          </div>
        </div>
      )}
      {/* Resize handle — bottom-right corner */}
      {editMode && (
        <div
          onMouseDown={e => {
            e.stopPropagation();
            startResize(e.clientX, e.clientY);
          }}
          onTouchStart={e => {
            e.stopPropagation();
            startResize(e.touches[0].clientX, e.touches[0].clientY);
          }}
          style={{
            position: "absolute", right: 0, bottom: 0,
            width: 20, height: 20,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            cursor: "se-resize", borderRadius: "6px 0 0 0",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#fff", fontWeight: 900, zIndex: 2,
            boxShadow: "0 -1px 4px rgba(99,102,241,0.4)",
          }}
        >⤡</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE LABEL (student name / teacher note)
// ─────────────────────────────────────────────────────────────────────────────
function DraggableLabel({ label, x, y, fontFamily, fontSize, color, editMode, onMove, italic, maxWidth }: {
  label: string; x: number; y: number;
  fontFamily: string; fontSize: number; color: string;
  editMode?: boolean;
  onMove?: (dx: number, dy: number) => void;
  italic?: boolean; maxWidth?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ startX: number; startY: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    dragging.current = { startX: e.clientX, startY: e.clientY };
  };

  useEffect(() => {
    if (!editMode) return;
    const mv = (e: MouseEvent) => {
      if (!dragging.current || !ref.current) return;
      const container = ref.current.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const dx = ((e.clientX - dragging.current.startX) / rect.width) * 100;
      const dy = ((e.clientY - dragging.current.startY) / rect.height) * 100;
      dragging.current = { startX: e.clientX, startY: e.clientY };
      onMove?.(dx, dy);
    };
    const up = () => { dragging.current = null; };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [editMode, onMove]);

  return (
    <div ref={ref} onMouseDown={onMouseDown} style={{
      position: "absolute",
      left: `${x}%`, top: `${y}%`,
      fontFamily: `'${fontFamily}', cursive`,
      fontSize,
      color,
      zIndex: 7,
      cursor: editMode ? "move" : "default",
      userSelect: "none",
      transform: "rotate(-1.2deg)",
      opacity: 0.92,
      maxWidth: maxWidth || "44%",
      fontStyle: italic ? "italic" : "normal",
      lineHeight: 1.4,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    }}>
      {editMode && (
        <div style={{
          position: "absolute", top: -12, left: 0, fontSize: 8,
          background: "#7c3aed", color: "#fff", padding: "1px 4px",
          borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none",
        }}>✥ déplacer</div>
      )}
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE LAYER
// ─────────────────────────────────────────────────────────────────────────────
function PageLayer({ page, pi, questions, answers, profile, variantSeed,
  editMode, offsets, onOffsetChange, effects, shapes, comments,
  onCommentDrag, forPrint, artImageOverride, artTransform, onArtUpdate, studentName,
  onUpdateShape, selectedShapeId, onSelectShape,
  showName, namePosX, namePosY, onNameMove,
  teacherNote, onTeacherNoteMove,
  gradeMarks, onGradeMarkMove, selectedGradeMarkId, onSelectGradeMark }: {
  page: EvalPage; pi: number;
  questions: DetectedQuestion[]; answers: Record<string, string>;
  profile: StudentProfile; variantSeed: number;
  editMode: boolean; offsets: Record<string, { x: number; y: number }>;
  onOffsetChange: (id: string, dx: number, dy: number) => void;
  effects: PageEffectOverrides; shapes: GeometryShape[];
  comments: TeacherComment[];
  onCommentDrag?: (qId: string, svgDx: number, svgDy: number) => void;
  forPrint?: boolean;
  artImageOverride?: string;
  artTransform?: ArtTransform;
  onArtUpdate?: (patch: Partial<ArtTransform>) => void;
  studentName?: string;
  onUpdateShape?: (id: string, patch: Partial<GeometryShape>) => void;
  selectedShapeId?: string | null;
  onSelectShape?: (id: string | null) => void;
  showName?: boolean;
  namePosX?: number; namePosY?: number;
  onNameMove?: (dx: number, dy: number) => void;
  teacherNote?: TeacherNote | null;
  onTeacherNoteMove?: (dx: number, dy: number) => void;
  gradeMarks?: GradeMark[];
  onGradeMarkMove?: (id: string, dx: number, dy: number) => void;
  selectedGradeMarkId?: string | null;
  onSelectGradeMark?: (id: string) => void;
}) {
  const filterId = `p${pi}`;
  const pageQ    = questions.filter(q => q.pageIndex === pi);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageGradeMarks = (gradeMarks ?? []).filter(m => m.pageIndex === pi);

  const defaultArtTransform: ArtTransform = { x: 0, y: 0, w: 100, h: 100, cropX: 0, cropY: 0, cropW: 100, cropH: 100, rotation: 0 };
  const artT = artTransform ?? defaultArtTransform;

  return (
    <div ref={containerRef} className="relative bg-white" style={{
      width: "100%", aspectRatio: "210/297", overflow: "hidden",
      pageBreakAfter: forPrint ? "always" : "auto",
    }}>
      {page.base64 && (
        <img src={page.base64} alt={`Page ${pi + 1}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }}
          draggable={false} />
      )}
      {artImageOverride && !forPrint && (
        <DraggableArtImage
          src={artImageOverride}
          transform={artT}
          editMode={editMode}
          onUpdate={p => onArtUpdate?.(p)}
        />
      )}
      {artImageOverride && forPrint && (
        <img src={artImageOverride} alt="Art"
          style={{ position: "absolute", left: `${artT.x}%`, top: `${artT.y}%`, width: `${artT.w}%`, height: `${artT.h}%`, objectFit: "fill", zIndex: 3, pointerEvents: "none", transform: `rotate(${artT.rotation}deg)` }}
          draggable={false} />
      )}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible",
        pointerEvents: (editMode && !forPrint) ? "auto" : "none" }}
        viewBox="0 0 100 141.4" preserveAspectRatio="none">
        <PencilDefs id={filterId} />
        {effects.showGeometry && (
        <GeometryLayer
          shapes={shapes} pageIndex={pi} filterId={filterId}
          editMode={editMode && !forPrint}
          onUpdateShape={onUpdateShape}
          selectedShapeId={selectedShapeId}
          onSelectShape={onSelectShape}
        />
      )}
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
      {/* Grade marks (✓ ✗ note date) */}
      {pageGradeMarks.map(m => (
        <DraggableGradeMark
          key={m.id}
          mark={m}
          editMode={editMode && !forPrint}
          onMove={(id, dx, dy) => onGradeMarkMove?.(id, dx, dy)}
          onSelect={id => onSelectGradeMark?.(id)}
          selected={selectedGradeMarkId === m.id}
        />
      ))}
      {/* Draggable student name — page 0 only */}
      {pi === 0 && studentName && showName !== false && (
        <DraggableLabel
          label={studentName}
          x={namePosX ?? 55} y={namePosY ?? 4}
          fontFamily={getFontFamily(profile.fontKey)}
          fontSize={Math.max(13, profile.fontSize)}
          color={profile.inkColor}
          editMode={editMode}
          onMove={onNameMove}
        />
      )}
      {/* Draggable teacher evaluation note — page 0 only */}
      {pi === 0 && teacherNote && (
        <DraggableLabel
          label={teacherNote.text}
          x={teacherNote.x} y={teacherNote.y}
          fontFamily={getFontFamily(teacherNote.fontKey)}
          fontSize={teacherNote.fontSize * 4.5}
          color={teacherNote.color}
          editMode={editMode}
          onMove={(dx, dy) => onTeacherNoteMove?.(dx, dy)}
          italic
          maxWidth="70%"
        />
      )}
      {editMode && !forPrint && (
        <div style={{ position: "absolute", inset: 0, border: "2px dashed #6366f1",
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
  const ts: { key: keyof PageEffectOverrides; label: string; emoji: string }[] = [
    { key: "showRatures",  label: "Ratures",      emoji: "✏️" },
    { key: "showBlanco",   label: "Blanco",        emoji: "⬜" },
    { key: "showSmudges",  label: "Bavures",       emoji: "💧" },
    { key: "showPressure", label: "Pression",      emoji: "🖊️" },
    { key: "showWobble",   label: "Tremblement",   emoji: "〰️" },
    { key: "showComments", label: "Corrections",   emoji: "🔴" },
    { key: "showGeometry", label: "Géométrie",     emoji: "📐" },
  ];
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {ts.map(t => (
        <button key={t.key} onClick={() => onChange(t.key, !effects[t.key])}
          className={`flex items-center gap-2.5 p-2 rounded-lg text-left transition-all text-sm
            ${effects[t.key]
              ? "bg-indigo-50 border border-indigo-200 text-indigo-800"
              : "bg-slate-50 border border-slate-200 text-slate-400"}`}>
          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all
            ${effects[t.key] ? "bg-indigo-500 border-indigo-500" : "border-slate-300"}`}>
            {effects[t.key] && <CheckCircle className="h-2.5 w-2.5 text-white" />}
          </div>
          <span className="text-[11px] font-semibold">{t.emoji} {t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER COMMENT MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function CommentManager({ comments, questions, answers, onUpdate, onGenerate, isGenerating }: {
  comments: TeacherComment[]; questions: DetectedQuestion[];
  answers: Record<string, string>;
  onUpdate: (c: TeacherComment[]) => void;
  onGenerate: () => void; isGenerating: boolean;
}) {
  const [gFont,  setGFont]  = useState(DEFAULT_TEACHER_FONT);
  const [gColor, setGColor] = useState(DEFAULT_TEACHER_COLOR);
  const [gSize,  setGSize]  = useState(DEFAULT_TEACHER_FONTSIZE);

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

  return (
    <div className="space-y-3">
      {/* Global style */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2.5">
        <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
          <Palette className="h-3 w-3" /> Style de correction
        </p>
        <div className="grid grid-cols-3 gap-1">
          {HANDWRITING_FONTS.map(f => (
            <button key={f.key} onClick={() => setGFont(f.key)}
              className={`px-1 py-1.5 text-[9px] border rounded-lg transition font-semibold
                ${gFont === f.key ? "border-red-500 bg-red-100 text-red-800" : "border-slate-200 hover:border-red-300 bg-white"}`}
              style={{ fontFamily: f.family, color: gColor }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {TEACHER_COLORS.map(tc => (
            <button key={tc.value} title={tc.label} onClick={() => setGColor(tc.value)}
              className={`w-5 h-5 rounded-full border-2 transition
                ${gColor === tc.value ? "border-slate-700 scale-110" : "border-transparent hover:border-slate-400"}`}
              style={{ background: tc.value }} />
          ))}
          <label className="w-5 h-5 rounded-full border-2 border-slate-300 cursor-pointer relative overflow-hidden">
            <input type="color" value={gColor} onChange={e => setGColor(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            <div className="w-full h-full rounded-full" style={{ background: gColor }} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-medium w-12 shrink-0">Taille</span>
          <input type="range" min={1.5} max={5} step={0.1} value={gSize}
            onChange={e => setGSize(parseFloat(e.target.value))}
            className="flex-1 accent-red-500 h-1.5" />
          <span className="text-[10px] font-bold w-7 text-right" style={{ color: gColor }}>{gSize.toFixed(1)}</span>
        </div>
        <div className="bg-white rounded-lg px-2 py-1 border border-red-100">
          <span style={{ fontFamily: `'${getFontFamily(gFont)}', cursive`, color: gColor, fontSize: 13 }}>
            Aperçu correction prof
          </span>
        </div>
      </div>

      <button onClick={onGenerate} disabled={isGenerating || !Object.keys(answers).length}
        className="w-full py-2 bg-red-500 text-white rounded-xl font-bold text-xs
          flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-red-600 transition">
        {isGenerating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        Générer commentaires (Gemini)
      </button>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {questions.filter(q => answers[q.id]).map(q => {
          const c = comments.find(c => c.qId === q.id);
          return (
            <div key={q.id} className="bg-white border border-red-100 rounded-xl p-2 space-y-1.5">
              <p className="text-[9px] font-bold text-slate-400 truncate">{q.text.substring(0, 50)}…</p>
              <div className="flex gap-1">
                <input value={c?.text ?? ""} onChange={e => upsert(q.id, e.target.value)}
                  placeholder="Commentaire…"
                  className="flex-1 border border-red-200 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:border-red-500"
                  style={{ color: c?.teacherColor || gColor, fontFamily: `'${getFontFamily(c?.teacherFontKey || gFont)}', cursive` }} />
                <select value={c?.position ?? "right"}
                  onChange={e => setField(q.id, { position: e.target.value as TeacherComment["position"] })}
                  className="border border-slate-200 rounded text-[8px] px-0.5 w-16 bg-white">
                  <option value="right">→ Droite</option>
                  <option value="above">↑ Haut</option>
                  <option value="below">↓ Bas</option>
                  <option value="margin">◀ Marge</option>
                </select>
                {c && (
                  <button onClick={() => onUpdate(comments.filter(cc => cc.qId !== q.id))}
                    className="p-1 rounded hover:bg-red-50 transition">
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </button>
                )}
              </div>
              <div className="flex gap-1">
                {(["check","cross","circle","underline","arrow"] as const).map(sym => (
                  <button key={sym} onClick={() => setField(q.id, { style: c?.style === sym ? undefined : sym })}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition
                      ${c?.style === sym ? "bg-red-500 text-white border-red-600" : "border-slate-200 hover:border-red-400 bg-white"}`}>
                    {sym === "check" ? "✓" : sym === "cross" ? "✗" : sym === "circle" ? "○" : sym === "underline" ? "U̲" : "↗"}
                  </button>
                ))}
              </div>
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
// Triangle coordinate presets
function triangleCoords(sub: TriangleSubtype): { x1:number; y1:number; x2:number; y2:number; x3:number; y3:number } {
  if (sub === "equilateral") {
    // equilateral: all sides equal, angles 60°
    return { x1: 35, y1: 28, x2: 15, y2: 68, x3: 55, y3: 68 };
  }
  if (sub === "rectangle") {
    // right angle at x2,y2 (bottom-left)
    return { x1: 15, y1: 28, x2: 15, y2: 68, x3: 55, y3: 68 };
  }
  if (sub === "isocele") {
    // apex centred, two equal sides
    return { x1: 35, y1: 28, x2: 15, y2: 68, x3: 55, y3: 68 };
  }
  // quelconque — generic scalene
  return { x1: 30, y1: 30, x2: 10, y2: 70, x3: 62, y3: 65 };
}

const GEO_PRESETS: { label: string; emoji: string; shape: Omit<GeometryShape, "id" | "pageIndex"> }[] = [
  { label: "Segment",   emoji: "📏", shape: { type: "line",      x1: 10, y1: 30, x2: 60, y2: 30, label: "6 cm", pencilNoise: 0.2 } },
  { label: "Cercle",    emoji: "⭕", shape: { type: "circle",    x1: 50, y1: 60, radius: 15, label: "r=3cm", pencilNoise: 0.3 } },
  { label: "Rectangle", emoji: "▭", shape: { type: "rectangle", x1: 15, y1: 40, x2: 55, y2: 65, pencilNoise: 0.25 } },
];

const TRIANGLE_SUBTYPES: { sub: TriangleSubtype; label: string; desc: string }[] = [
  { sub: "quelconque",  label: "Quelconque",   desc: "Côtés tous différents" },
  { sub: "rectangle",  label: "Rectangle",    desc: "Un angle de 90°" },
  { sub: "equilateral",label: "Équilatéral",  desc: "Tous côtés égaux" },
  { sub: "isocele",    label: "Isocèle",      desc: "Deux côtés égaux" },
];

function GeometryBuilder({ pageIndex, onAdd }: { pageIndex: number; onAdd: (s: GeometryShape) => void }) {
  const [noise, setNoise]             = useState(0.3);
  const [color, setColor]             = useState("#2d2d3a");
  const [triSub, setTriSub]           = useState<TriangleSubtype>("quelconque");
  const [showTriPicker, setShowTriPicker] = useState(false);

  const addShape = (base: Omit<GeometryShape, "id" | "pageIndex">) => {
    onAdd({ ...base, id: `geo_${Date.now()}`, pageIndex, pencilNoise: noise, strokeColor: color });
  };

  return (
    <div className="space-y-2">
      {/* Crayon */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 font-medium w-14 shrink-0">Crayon</span>
        <input type="range" min={0} max={1} step={0.05} value={noise}
          onChange={e => setNoise(parseFloat(e.target.value))} className="flex-1 accent-slate-700 h-1.5" />
        <span className="text-[10px] font-bold w-16 text-right">{noise < 0.2 ? "Règle" : noise < 0.6 ? "Normal" : "Brouillon"}</span>
      </div>
      {/* Couleur */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 font-medium w-14 shrink-0">Couleur</span>
        {["#2d2d3a","#6b4226","#1d3278"].map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border-2 ${color === c ? "border-slate-700 scale-110" : "border-transparent hover:border-slate-400"}`}
            style={{ background: c }} />
        ))}
        <label className="w-5 h-5 rounded-full border-2 border-slate-300 cursor-pointer relative overflow-hidden">
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
          <div className="w-full h-full rounded-full" style={{ background: color }} />
        </label>
      </div>
      {/* Shape buttons */}
      <div className="grid grid-cols-2 gap-1.5">
        {GEO_PRESETS.map(p => (
          <button key={p.label} onClick={() => addShape(p.shape)}
            className="flex items-center gap-1.5 px-2 py-2 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition text-left">
            <span className="text-base">{p.emoji}</span>
            <span className="text-[10px] font-semibold">{p.label}</span>
          </button>
        ))}
        {/* Triangle with subtype picker */}
        <div className="relative">
          <button onClick={() => setShowTriPicker(v => !v)}
            className="w-full flex items-center gap-1.5 px-2 py-2 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition text-left">
            <span className="text-base">△</span>
            <span className="text-[10px] font-semibold flex-1">Triangle</span>
            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${showTriPicker ? "rotate-180" : ""}`} />
          </button>
          {showTriPicker && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
              {TRIANGLE_SUBTYPES.map(({ sub, label, desc }) => (
                <button key={sub}
                  onClick={() => {
                    setTriSub(sub);
                    setShowTriPicker(false);
                    const coords = triangleCoords(sub);
                    addShape({ type: "triangle", triangleSubtype: sub, ...coords, pencilNoise: noise });
                  }}
                  className={`w-full text-left px-2.5 py-2 text-[10px] hover:bg-indigo-50 transition border-b border-slate-100 last:border-0
                    ${triSub === sub ? "bg-indigo-50 text-indigo-700 font-bold" : "text-slate-700"}`}>
                  <span className="font-bold">{label}</span>
                  <span className="text-slate-400 ml-1">— {desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
  const levelColors: Record<string, string> = {
    "1-2": "bg-red-100 text-red-700 border-red-200",
    "3-4": "bg-orange-100 text-orange-700 border-orange-200",
    "5-6": "bg-blue-100 text-blue-700 border-blue-200",
    "7-8": "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  const lc = levelColors[bs.criteriaLevel] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <div className={`flex items-center gap-2 p-2.5 border rounded-xl transition
      ${bs.isDone ? "border-emerald-300 bg-emerald-50" : bs.isGenerating ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0
        ${bs.isDone ? "bg-emerald-500 text-white" : bs.isGenerating ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-600"}`}>
        {bs.isGenerating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : bs.isDone ? <CheckCircle className="h-3.5 w-3.5" /> : (bs.profile.name[0]?.toUpperCase() || "?")}
      </div>
      <div className="flex-1 min-w-0">
        <select value={bs.profile.name}
          onChange={e => {
            const p = savedProfiles.find(p => p.name === e.target.value);
            if (p) onUpdate(bs.id, { profile: { ...p, hwImage: p.hwImageBase64 || p.hwImage || null } });
          }}
          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold bg-white focus:outline-none focus:border-indigo-400">
          <option value="">— Choisir élève —</option>
          {savedProfiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      {/* Level selector — prominent pill style */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide">Niveau</span>
        <select value={bs.criteriaLevel}
          onChange={e => onUpdate(bs.id, { criteriaLevel: e.target.value as CriteriaLevel })}
          className={`w-14 border rounded-lg px-1 py-1 text-[10px] font-bold focus:outline-none cursor-pointer ${lc}`}>
          {EXAM_CRITERIA_LEVELS.map(l => <option key={l.level} value={l.level}>{l.level}/8</option>)}
        </select>
      </div>
      {bs.isDone ? (
        <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold whitespace-nowrap">
          <CheckCircle className="h-3.5 w-3.5" /> OK
        </div>
      ) : (
        <button onClick={() => onGenerate(bs.id)}
          disabled={bs.isGenerating || !bs.profile.name || questions.length === 0}
          className="px-2.5 py-1.5 bg-indigo-500 text-white rounded-lg text-[10px] font-bold
            disabled:opacity-50 hover:bg-indigo-600 active:scale-95 transition flex items-center gap-1 whitespace-nowrap">
          {bs.isGenerating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {bs.isGenerating ? "…" : "Go"}
        </button>
      )}
      <button onClick={() => onRemove(bs.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition shrink-0" title="Supprimer">
        <Trash2 className="h-3.5 w-3.5 text-red-400" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function buildPrintHTML(
  pages: EvalPage[], questions: DetectedQuestion[], answers: Record<string, string>,
  offsets: Record<string, { x: number; y: number }>, profile: StudentProfile,
  comments: TeacherComment[], effects: PageEffectOverrides,
  studentName: string, artImages?: Record<number, string>,
  teacherNote?: TeacherNote | null,
  namePos?: { x: number; y: number },
  gradeMarks?: GradeMark[],
  artTransforms?: Record<number, ArtTransform>,
): string {
  const fp       = profile.fingerprint;
  // 40% threshold for max fidelity in print output
  const useFP    = !!fp && (fp.confidenceScore ?? 0) >= 40;
  const fontSize = useFP ? Math.max(11, fp.suggestedSize) : Math.max(11, profile.fontSize);
  const inkCol   = profile.inkColor;
  const fontFam  = getFontFamily(profile.fontKey);
  const lHeight  = (useFP ? fp.lineHeightMultiplier : 1.6) * fontSize;

  const buildPageCommentsSVG = (pi: number) => {
    return comments.filter(c => questions.find(qq => qq.id === c.qId)?.pageIndex === pi).map(c => {
      const q = questions.find(qq => qq.id === c.qId);
      if (!q) return "";
      let bx = q.x, by = q.y;
      if (c.position === "right")  bx = Math.min(q.x + (q.maxWidth ?? 60) + 2, 85);
      if (c.position === "above")  by = Math.max(2, q.y - 5);
      if (c.position === "below")  by = q.y + 7;
      if (c.position === "margin") bx = 1;
      const cx = bx + c.ox, cy = by + c.oy;
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
    return questions.filter(q => q.pageIndex === pi).map(q => {
      const ans = answers[q.id] ?? "";
      if (!ans) return "";
      const off = offsets[q.id] ?? { x: 0, y: 0 };
      const lineHTML = ans.split("\n").map(l =>
        `<div style="margin:0;padding:0;line-height:${lHeight}px">${l || "&nbsp;"}</div>`
      ).join("");
      return `<div style="position:absolute;left:${q.x}%;top:${q.y}%;transform:translate(${off.x}px,${off.y}px);max-width:${q.maxWidth ?? 78}%;font-family:'${fontFam}',cursive;font-size:${fontSize}px;color:${inkCol};pointer-events:none;z-index:5">${lineHTML}</div>`;
    }).join("\n");
  };

  const namePct = namePos ?? { x: 55, y: 4 };
  const nameHTML = (pi0: number) => pi0 === 0 && studentName
    ? `<div style="position:absolute;left:${namePct.x}%;top:${namePct.y}%;font-family:'${fontFam}',cursive;font-size:${Math.max(13, fontSize)}px;color:${inkCol};z-index:6;pointer-events:none;transform:rotate(-1.5deg);opacity:0.9;max-width:45%">${studentName}</div>`
    : "";

  const noteHTML = (pi0: number) => {
    if (pi0 !== 0 || !teacherNote) return "";
    const nff  = getFontFamily(teacherNote.fontKey);
    const nfs  = Math.max(8, teacherNote.fontSize * 4.5);
    return `<div style="position:absolute;left:${teacherNote.x}%;top:${teacherNote.y}%;font-family:'${nff}',cursive;font-size:${nfs}px;color:${teacherNote.color};z-index:7;pointer-events:none;max-width:90%;line-height:1.4;transform:rotate(-0.8deg);opacity:0.95">${teacherNote.text.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</div>`;
  };

  const buildGradeMarksHTML = (pi: number) =>
    (gradeMarks ?? []).filter(m => m.pageIndex === pi).map(m => {
      const fsPx = m.fontSize * 14;
      const ff = (m.type === "check" || m.type === "cross") ? "Arial, sans-serif" : "'Homemade Apple', cursive";
      const fw = (m.type === "check" || m.type === "cross") ? "900" : "700";
      return `<div style="position:absolute;left:${m.x}%;top:${m.y}%;color:${m.color};font-size:${fsPx}px;font-family:${ff};font-weight:${fw};font-style:italic;z-index:8;transform:rotate(-2deg);line-height:1">${m.text}</div>`;
    }).join("\n");

  const pagesHTML = pages.map((page, pi) => {
    const imgHTML = page.base64 ? `<img src="${page.base64}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"/>` : "";
    const artT = artTransforms?.[pi];
    const artImg  = artImages?.[pi]
      ? artT
        ? `<img src="${artImages[pi]}" style="position:absolute;left:${artT.x}%;top:${artT.y}%;width:${artT.w}%;height:${artT.h}%;object-fit:fill;z-index:3;pointer-events:none;transform:rotate(${artT.rotation}deg)"/>`
        : `<img src="${artImages[pi]}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;pointer-events:none"/>`
      : "";
    const commSVG = effects.showComments ? buildPageCommentsSVG(pi) : "";
    const ansHTML = buildAnswersHTML(pi);
    const gradeHTML = buildGradeMarksHTML(pi);
    return `<div style="position:relative;width:210mm;height:297mm;overflow:hidden;background:white;page-break-after:always;box-sizing:border-box">
  ${imgHTML}${artImg}
  ${commSVG ? `<svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" viewBox="0 0 100 141.4" preserveAspectRatio="none">${commSVG}</svg>` : ""}
  ${nameHTML(pi)}${noteHTML(pi)}${gradeHTML}${ansHTML}
</div>`;
  }).join("\n");

  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"/>
<title>${studentName} — nanobanana PRO</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Homemade+Apple&family=Marck+Script&family=Parisienne&family=Allura&family=La+Belle+Aurore&family=Bad+Script&family=Caveat:wght@400;600&family=Dancing+Script:wght@400;600&family=Sacramento&family=Satisfy&family=Great+Vibes&family=Kalam:wght@300;400;700&family=Indie+Flower&family=Shadows+Into+Light&family=Patrick+Hand&family=Nothing+You+Could+Do&display=swap">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:white}@page{margin:0;size:A4 portrait}</style>
</head><body>${pagesHTML}
<script>document.fonts.ready.then(()=>{setTimeout(()=>{window.print();},600);});<\/script>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT PROFILE QUICK-EDIT MODAL
// ─────────────────────────────────────────────────────────────────────────────
const FONT_CATEGORIES = [
  { id: "enfant",   label: "Écolier / Cahier" },
  { id: "cursive",  label: "Cursive / Stylo"  },
  { id: "elegante", label: "Élégante / Calligraphie" },
];

function StudentProfileModal({
  profile, onSave, onClose, effects, variantSeed,
  isAnalyzing, analyzeHandwriting,
}: {
  profile: StudentProfile;
  onSave: (p: StudentProfile) => void;
  onClose: () => void;
  effects: PageEffectOverrides;
  variantSeed: number;
  isAnalyzing: boolean;
  analyzeHandwriting: (b64: string, name: string) => void;
}) {
  // Merge with defaults to ensure no field is undefined (handles old profiles)
  const def = defaultProfile(profile.name);
  const [local, setLocal] = React.useState<StudentProfile>({ ...def, ...profile });
  const upd = <K extends keyof StudentProfile>(k: K, v: StudentProfile[K]) =>
    setLocal(prev => ({ ...prev, [k]: v }));
  // Start on the tab that contains the current font
  const initialCat = HANDWRITING_FONTS.find(f => f.key === profile.fontKey)?.category ?? "enfant";
  const [fontCat, setFontCat] = React.useState<string>(initialCat);

  const fontsInCat = HANDWRITING_FONTS.filter(f => f.category === fontCat);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.65)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.25)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100"
          style={{ background: "linear-gradient(135deg,#f8faff,#f0f4ff)" }}>
          <div className="w-10 h-10 rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-indigo-200">
            {local.name[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Modifier l'élève</p>
            <p className="font-black text-slate-900 text-base leading-none mt-0.5">{local.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-500 font-bold text-lg">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Name */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nom de l'élève</label>
            <input type="text" value={local.name} onChange={e => upd("name", e.target.value)}
              className="w-full mt-1.5 border-2 border-slate-200 focus:border-indigo-400 rounded-2xl px-4 py-2.5 text-sm font-bold focus:outline-none transition"
              placeholder="Ex: Ahmed Benali…" />
          </div>

          {/* Handwriting sample */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Photo d'écriture (empreinte AI)</label>
            <label className="mt-1.5 flex items-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition relative">
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const r = new FileReader();
                  r.onload = ev => analyzeHandwriting(ev.target?.result as string, f.name);
                  r.readAsDataURL(f);
                }} />
              {isAnalyzing
                ? <><RefreshCw className="h-5 w-5 animate-spin text-indigo-500" /><span className="text-xs font-bold text-indigo-600">Analyse Gemini en cours…</span></>
                : local.fingerprint
                  ? <><CheckCircle className="h-5 w-5 text-emerald-500" /><div><p className="text-xs font-bold text-emerald-700">Empreinte analysée — {local.fingerprint.confidenceScore}% confiance</p><p className="text-[10px] text-emerald-600">{local.analysisDescription?.substring(0, 80)}…</p></div></>
                  : <><BookOpen className="h-5 w-5 text-slate-300" /><span className="text-xs font-semibold text-slate-400">Déposer une photo pour analyser l'écriture</span></>}
            </label>
          </div>

          {/* Font category tabs */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Style d'écriture</label>
            {/* Category tabs */}
            <div className="flex gap-1.5 mt-2 mb-3">
              {FONT_CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setFontCat(cat.id)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold transition border
                    ${fontCat === cat.id ? "bg-indigo-500 text-white border-indigo-500 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600"}`}>
                  {cat.label}
                </button>
              ))}
            </div>
            {/* Font grid */}
            <div className="grid grid-cols-3 gap-2">
              {fontsInCat.map(f => (
                <button key={f.key} onClick={() => upd("fontKey", f.key)}
                  className={`relative px-3 py-3 border-2 rounded-2xl transition flex flex-col items-center gap-1 group
                    ${local.fontKey === f.key ? "border-indigo-400 bg-indigo-50 shadow-md shadow-indigo-100" : "border-slate-200 hover:border-indigo-200 bg-white hover:bg-indigo-50/30"}`}>
                  {local.fontKey === f.key && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                  <span style={{ fontFamily: f.family, fontSize: 22, color: local.inkColor, lineHeight: 1 }}>
                    Abc
                  </span>
                  <span className="text-[9px] font-bold text-slate-500">{f.label}</span>
                  <span className="text-[8px] text-slate-300 hidden group-hover:block absolute bottom-0 left-0 right-0 text-center pb-0.5">{f.family}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ink color */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Couleur d'encre</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {INK_COLORS.map(c => (
                <button key={c.value} title={c.label} onClick={() => upd("inkColor", c.value)}
                  className={`w-8 h-8 rounded-full border-3 transition shadow-sm
                    ${local.inkColor === c.value ? "border-slate-700 scale-110 ring-2 ring-offset-2 ring-indigo-400" : "border-transparent hover:border-slate-400 hover:scale-105"}`}
                  style={{ background: c.value }} />
              ))}
              <label className="w-8 h-8 rounded-full border-2 border-slate-300 cursor-pointer relative overflow-hidden hover:scale-105 transition">
                <input type="color" value={local.inkColor} onChange={e => upd("inkColor", e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                <div className="w-full h-full rounded-full" style={{ background: local.inkColor }} />
              </label>
            </div>
          </div>

          {/* Sliders */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Sliders className="h-3 w-3" /> Paramètres d'écriture
            </label>
            <div className="space-y-3 mt-2">
              {[
                { k: "fontSize"           as const, label: "Taille de police", icon: "📝", min: 11, max: 26, step: 0.5  },
                { k: "messinessIntensity" as const, label: "Désordre / naturel", icon: "🌀", min: 0,  max: 6,  step: 0.1  },
                { k: "lineWobbleAmp"      as const, label: "Tremblement des lignes", icon: "〰️", min: 0,  max: 5,  step: 0.1  },
                { k: "penThickness"       as const, label: "Épaisseur du trait", icon: "🖊️", min: 0.5,max: 3.5,step: 0.1  },
                { k: "skewAngle"          as const, label: "Inclinaison", icon: "📐", min: -15,max: 15, step: 0.5  },
                { k: "letterSpacing"      as const, label: "Espacement lettres", icon: "↔️", min: -3, max: 6,  step: 0.1  },
              ].map(s => (
                <div key={s.k} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2">
                  <span className="text-sm w-5 text-center shrink-0">{s.icon}</span>
                  <span className="text-[10px] font-semibold text-slate-500 w-28 shrink-0">{s.label}</span>
                  <input type="range" min={s.min} max={s.max} step={s.step}
                    value={(local[s.k] as number) ?? s.min}
                    onChange={e => upd(s.k, parseFloat(e.target.value))}
                    className="flex-1 accent-indigo-500 h-1.5 rounded" />
                  <span className="text-[10px] font-black text-indigo-700 w-8 text-right shrink-0">{((local[s.k] as number) ?? 0).toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Realism effects */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Zap className="h-3 w-3" /> Effets de réalisme
            </label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { k: "enableRatures" as const, label: "Ratures",      emoji: "✏️", sub: "raturesRate" as const, min: 0.01, max: 0.15 },
                { k: "enableBlanco"  as const, label: "Blanco",       emoji: "⬜", sub: "blancoRate"  as const, min: 0.01, max: 0.10 },
                { k: "enableSmudges" as const, label: "Bavures",      emoji: "💧", sub: null, min: 0, max: 0 },
                { k: "enablePressureVar" as const, label: "Pression var.", emoji: "👁️", sub: null, min: 0, max: 0 },
                { k: "enableLineWobble"  as const, label: "Ligne ondulée", emoji: "〰️", sub: "lineWobbleAmp" as const, min: 0, max: 5 },
                { k: "inkDrySkipping"    as const, label: "Encre sèche", emoji: "💦", sub: null, min: 0, max: 0 },
                { k: "enableUnreadableLetters" as const, label: "Illisible", emoji: "🔤", sub: null, min: 0, max: 0 },
                { k: "letterCaseChaos"         as const, label: "Casse aléat.", emoji: "Aa", sub: null, min: 0, max: 0 },
              ].map(s => (
                <div key={s.k}
                  className={`p-2.5 border-2 rounded-xl transition cursor-pointer select-none
                    ${local[s.k] ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-slate-50 hover:border-slate-200"}`}
                  onClick={() => upd(s.k, !local[s.k] as any)}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{s.emoji}</span>
                    <p className="text-[10px] font-bold text-slate-700 flex-1">{s.label}</p>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition
                      ${local[s.k] ? "bg-indigo-500 border-indigo-500" : "border-slate-300"}`}>
                      {local[s.k] && <CheckCircle className="h-2.5 w-2.5 text-white" />}
                    </div>
                  </div>
                  {s.sub && local[s.k] && (
                    <input type="range" min={s.min} max={s.max} step={0.005}
                      value={(local[s.sub] as number) ?? s.min}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); upd(s.sub!, parseFloat(e.target.value)); }}
                      className="w-full mt-1.5 accent-indigo-400 h-1 rounded" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className="border-2 border-slate-100 rounded-2xl p-4 bg-slate-50">
            <p className="text-[9px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Aperçu en direct</p>
            <HandwrittenText
              text="Voici mon écriture en direct avec tous les effets."
              qId="modal-preview" profile={local} variantSeed={variantSeed} effects={effects} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-white">
          <button onClick={onClose}
            className="flex-1 py-2.5 border-2 border-slate-200 rounded-2xl font-bold text-sm text-slate-600 hover:bg-slate-50 transition">
            Annuler
          </button>
          <button onClick={() => onSave(local)}
            disabled={!local.name.trim()}
            className="flex-1 py-2.5 bg-indigo-500 text-white rounded-2xl font-black text-sm hover:bg-indigo-600 transition shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState<WorkflowStep>("import");

  const [evalPages, setEvalPages]       = useState<EvalPage[]>([]);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [usePreloaded, setUsePreloaded] = useState(false);

  // Word document (.docx) editing state
  const [wordHtml, setWordHtml]           = useState<string>("");
  const [wordEditing, setWordEditing]     = useState(false);
  const [wordFileName, setWordFileName]   = useState("");
  const [wordEditorRef]                   = useState(() => React.createRef<HTMLDivElement>());

  const [questions, setQuestions]     = useState<DetectedQuestion[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectErr, setDetectErr]     = useState("");
  const [detectRetry, setDetectRetry]   = useState(0);

  const [savedProfiles, setSavedProfiles] = useState<StudentProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<StudentProfile>(defaultProfile());
  const [isSaving, setIsSaving]           = useState(false);
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [mongoOk, setMongoOk]             = useState(false);

  const [batchMode, setBatchMode]         = useState(false);
  const [batchStudents, setBatchStudents] = useState<BatchStudent[]>([]);

  const [criteriaLevel, setCriteriaLevel] = useState<CriteriaLevel>(CriteriaLevel.LEVEL_5_6);
  const [variantSeed, setVariantSeed]     = useState(1);

  const [answers, setAnswers]           = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [genErr, setGenErr]             = useState("");
  const [refreshKey, setRefreshKey]     = useState(0);
  const [genProgress, setGenProgress]   = useState<string>("");

  const [previewPage, setPreviewPage]   = useState(0);
  const [editMode, setEditMode]         = useState(false);
  const [offsets, setOffsets]           = useState<Record<string, { x: number; y: number }>>({});
  // Student profile quick-edit modal
  const [editProfileTarget, setEditProfileTarget] = useState<StudentProfile | null>(null);
  const [activeBatchIdx, setActiveBatchIdx] = useState(0);

  const [effects, setEffects]           = useState<PageEffectOverrides>(defaultEffects());

  const [comments, setComments]           = useState<TeacherComment[]>([]);
  const [isGenComments, setIsGenComments] = useState(false);

  const [shapes, setShapes]             = useState<GeometryShape[]>([]);
  const [artImages, setArtImages]       = useState<Record<number, string>>({});
  const [sidePanel, setSidePanel]       = useState<"position" | "effects" | "comments" | "geometry" | "art" | "grades">("position");

  // Teacher evaluation note (draggable, page 0)
  const [teacherNote, setTeacherNote]   = useState<TeacherNote | null>(null);
  const [isGenNote, setIsGenNote]       = useState(false);
  const [genNoteErr, setGenNoteErr]     = useState("");

  // Draggable student name position (% of page)
  const [namePos, setNamePos]           = useState<{ x: number; y: number }>({ x: 55, y: 4 });
  const [showName, setShowName]         = useState(true);

  // Batch generation progress
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedGradeMarkId, setSelectedGradeMarkId] = useState<string | null>(null);

  // Grade marks overlay (✓ / ✗ / grade / date) — draggable red-pen elements
  const [gradeMarks, setGradeMarks] = useState<GradeMark[]>([]);

  // Art image transforms (drag + resize + crop)
  const [artTransforms, setArtTransforms] = useState<Record<number, ArtTransform>>({});

  const handleUpdateShape = useCallback((id: string, patch: Partial<GeometryShape>) => {
    setShapes(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const addGradeMark = useCallback((type: GradeMark["type"], pageIndex: number) => {
    const defaults: Record<GradeMark["type"], string> = {
      check: "✓", cross: "✗", grade: "6/8", date: new Date().toLocaleDateString("fr-FR"), custom: "?",
    };
    const newMark: GradeMark = {
      id: `gm_${Date.now()}`,
      pageIndex, type,
      text: defaults[type],
      x: 45, y: 45,
      fontSize: type === "grade" ? 3.5 : 2.8,
      color: "#dc2626",
    };
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, gradeMarks: [...b.gradeMarks, newMark] }
        : b));
    } else {
      setGradeMarks(prev => [...prev, newMark]);
    }
  }, [batchMode, currentBatch]);

  const updateGradeMark = useCallback((id: string, patch: Partial<GradeMark>) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, gradeMarks: b.gradeMarks.map(m => m.id === id ? { ...m, ...patch } : m) }
        : b));
    } else {
      setGradeMarks(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    }
  }, [batchMode, currentBatch]);

  const deleteGradeMark = useCallback((id: string) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, gradeMarks: b.gradeMarks.filter(m => m.id !== id) }
        : b));
    } else {
      setGradeMarks(prev => prev.filter(m => m.id !== id));
    }
  }, [batchMode, currentBatch]);

  const currentBatch       = batchMode ? batchStudents[activeBatchIdx] ?? null : null;
  const activeAnswers      = batchMode ? (currentBatch?.answers ?? {}) : answers;
  const activeComments     = batchMode ? (currentBatch?.comments ?? []) : comments;
  const activeOffsets      = batchMode ? (currentBatch?.offsets  ?? {}) : offsets;
  const activeVarSeed      = batchMode ? (activeBatchIdx + 1) * 3 : variantSeed;
  const activeDisplayProfile = batchMode ? (currentBatch?.profile ?? activeProfile) : activeProfile;
  // Per-student state isolation: route to currentBatch in batch mode, global state otherwise
  const activeTeacherNote   = batchMode ? (currentBatch?.teacherNote   ?? null)              : teacherNote;
  const activeGradeMarks    = batchMode ? (currentBatch?.gradeMarks    ?? [])                : gradeMarks;
  const activeArtImages     = batchMode ? (currentBatch?.artImages     ?? {})                : artImages;
  const activeArtTransforms = batchMode ? (currentBatch?.artTransforms ?? {})                : artTransforms;
  const activeNamePos       = batchMode ? (currentBatch?.namePos       ?? { x: 55, y: 4 })  : namePos;
  const activeEffects       = batchMode ? (currentBatch?.effects       ?? defaultEffects())  : effects;

  // ── Batch-aware setters ────────────────────────────────────────────────────
  const setActiveTeacherNote = useCallback((updater: TeacherNote | null | ((prev: TeacherNote | null) => TeacherNote | null)) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, teacherNote: typeof updater === "function" ? updater(b.teacherNote) : updater }
        : b));
    } else {
      setTeacherNote(updater as any);
    }
  }, [batchMode, currentBatch]);

  const setActiveGradeMarks = useCallback((updater: GradeMark[] | ((prev: GradeMark[]) => GradeMark[])) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, gradeMarks: typeof updater === "function" ? updater(b.gradeMarks) : updater }
        : b));
    } else {
      setGradeMarks(updater as any);
    }
  }, [batchMode, currentBatch]);

  const setActiveArtImages = useCallback((updater: Record<number, string> | ((prev: Record<number, string>) => Record<number, string>)) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, artImages: typeof updater === "function" ? updater(b.artImages) : updater }
        : b));
    } else {
      setArtImages(updater as any);
    }
  }, [batchMode, currentBatch]);

  const setActiveArtTransforms = useCallback((updater: Record<number, ArtTransform> | ((prev: Record<number, ArtTransform>) => Record<number, ArtTransform>)) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, artTransforms: typeof updater === "function" ? updater(b.artTransforms) : updater }
        : b));
    } else {
      setArtTransforms(updater as any);
    }
  }, [batchMode, currentBatch]);

  const setActiveNamePos = useCallback((updater: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, namePos: typeof updater === "function" ? updater(b.namePos) : updater }
        : b));
    } else {
      setNamePos(updater as any);
    }
  }, [batchMode, currentBatch]);

  const setActiveEffects = useCallback((updater: PageEffectOverrides | ((prev: PageEffectOverrides) => PageEffectOverrides)) => {
    if (batchMode && currentBatch) {
      setBatchStudents(prev => prev.map(b => b.id === currentBatch.id
        ? { ...b, effects: typeof updater === "function" ? updater(b.effects) : updater }
        : b));
    } else {
      setEffects(updater as any);
    }
  }, [batchMode, currentBatch]);

  // ── On startup: clear bloated localStorage (old versions stored full base64 images) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem("student_profiles_v3");
      if (raw && raw.length > 500_000) {
        // Too large — strip all images and re-save lean version
        const profiles: StudentProfile[] = JSON.parse(raw);
        const lean = profiles.map(p => ({ ...p, hwImage: null, hwImageBase64: "" }));
        localStorage.setItem("student_profiles_v3", JSON.stringify(lean));
      }
    } catch {
      // If even reading fails (QuotaError on read is rare but possible), wipe it
      try { localStorage.removeItem("student_profiles_v3"); } catch {}
    }
  }, []);

  // PDF.js + Mammoth (Word) loaders
  useEffect(() => {
    if (!(window as any).pdfjsLib) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
      s.async = true;
      s.onload = () => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
      };
      document.body.appendChild(s);
    }
    if (!(window as any).mammoth) {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);

  // ── Save profiles to localStorage — strips full images to avoid QuotaExceededError ─
  const saveToLocalStorage = async (profiles: StudentProfile[]) => {
    try {
      // Strip hwImage/hwImageBase64 from each profile before storing
      const light = profiles.map(p => ({ ...p, hwImage: null, hwImageBase64: "" }));
      const json = JSON.stringify(light);
      localStorage.setItem("student_profiles_v3", json);
    } catch (e) {
      // If still too large, clear and retry without any images
      try {
        localStorage.removeItem("student_profiles_v3");
        const minimal = profiles.map(p => ({ ...p, hwImage: null, hwImageBase64: "" }));
        localStorage.setItem("student_profiles_v3", JSON.stringify(minimal));
      } catch { /* storage unavailable — rely on MongoDB only */ }
    }
  };

  const loadProfiles = useCallback(async () => {
    try {
      const r = await fetch("/api/students");
      const d = await r.json();
      if (d.success) {
        setMongoOk(!d.offline);
        if (d.students?.length) {
          // MongoDB returns full hwImageBase64 — merge with defaults for safety
          const def = defaultProfile();
          setSavedProfiles(d.students.map((s: any) => ({ ...def, ...s, hwImage: s.hwImageBase64 || null })));
          return;
        }
      }
    } catch {}
    // Fallback: localStorage (no images stored there, but profile settings preserved)
    try {
      const loc = localStorage.getItem("student_profiles_v3");
      if (loc) {
        const def = defaultProfile();
        setSavedProfiles((JSON.parse(loc) as StudentProfile[]).map(s => ({ ...def, ...s, hwImage: null })));
      }
    } catch {}
  }, []);
  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const saveProfile = async (p: StudentProfile) => {
    setIsSaving(true);
    try {
      // Send full image to MongoDB API
      const r = await fetch("/api/students", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, hwImageBase64: p.hwImage || "" }),
      });
      const d = await r.json();
      if (d.success) {
        // Keep full hwImage in React state (for this session), strip for localStorage
        const saved = d.student ? { ...d.student, hwImage: d.student.hwImageBase64 || p.hwImage || null } : p;
        setSavedProfiles(prev => {
          const next = [saved, ...prev.filter(x => x.name.toLowerCase() !== p.name.toLowerCase())];
          saveToLocalStorage(next); // async, fire-and-forget — stripped images
          return next;
        });
      }
    } catch {
      // Offline fallback — keep profile in state and localStorage (no image in LS)
      setSavedProfiles(prev => {
        const next = [p, ...prev.filter(x => x.name.toLowerCase() !== p.name.toLowerCase())];
        saveToLocalStorage(next);
        return next;
      });
    }
    setIsSaving(false);
  };

  const deleteProfile = async (name: string) => {
    try { await fetch(`/api/students?name=${encodeURIComponent(name)}`, { method: "DELETE" }); } catch {}
    setSavedProfiles(prev => {
      const n = prev.filter(p => p.name !== name);
      saveToLocalStorage(n);
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
        // Build the fingerprint patch (shared between active profile and modal)
        const fpPatch = (prev: StudentProfile) => ({
          ...prev,
          hwImage: b64, hwImageBase64: b64, hwImageName: fileName,
          fontKey, inkColor,
          fontSize:         Math.max(11, s.suggestedSize ?? prev.fontSize),
          skewAngle:        s.suggestedRotation   ?? prev.skewAngle,
          messinessIntensity: s.messinessIntensity ?? prev.messinessIntensity,
          letterSpacing:    s.letterSpacingEm != null ? s.letterSpacingEm * 17 : prev.letterSpacing,
          wordDrift:        s.wordSpacingPx != null ? Math.max(0.5, s.wordSpacingPx / 5) : prev.wordDrift,
          penThickness:     s.penThickness    ?? prev.penThickness,
          lineWobbleAmp:    s.baselineWobbleAmp ?? prev.lineWobbleAmp,
          enableUnreadableLetters: s.enableUnreadableLetters ?? true,
          letterCaseChaos:         s.letterCaseChaos         ?? true,
          inkDrySkipping:          (s.inkDrySkipRate ?? 0) > 0.02 ? true : prev.inkDrySkipping,
          // 100% fidelity: ALWAYS ON
          enableRatures: true, raturesRate: Math.max(0.02, s.inferredRaturesRate ?? 0.05),
          enableBlanco:  true, blancoRate:  Math.max(0.015, s.inferredBlancoRate ?? 0.025),
          enableSmudges: true, enablePressureVar: true, enableLineWobble: true,
          fingerprint: s, analysisDescription: s.analysisDescription, confidenceScore: s.confidenceScore,
        });
        // Apply to modal (if open) OR to active profile
        if (editProfileTarget) {
          setEditProfileTarget(prev => prev ? fpPatch(prev) : prev);
        } else {
          setActiveProfile(prev => fpPatch(prev));
        }
      }
    } catch (err) { console.error(err); }
    setIsAnalyzing(false);
  };

  const handleEvalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    // reset on re-upload
    setQuestions([]); setAnswers({}); setUsePreloaded(false);
    setComments([]); setShapes([]); setArtImages({});
    e.target.value = ""; // allow re-selecting same file

    const isWord = file.name.endsWith(".docx") || file.name.endsWith(".doc") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type === "application/msword";

    if (isWord) {
      // ── Word .docx → HTML via Mammoth ──
      setIsPdfLoading(true);
      const reader = new FileReader();
      reader.onload = async ev => {
        try {
          const lib = (window as any).mammoth;
          if (!lib) {
            // try loading again
            await new Promise<void>(res => {
              const s = document.createElement("script");
              s.src = "https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js";
              s.onload = () => res();
              document.body.appendChild(s);
            });
          }
          const mm = (window as any).mammoth;
          if (!mm) { alert("Impossible de charger Mammoth. Vérifiez votre connexion."); setIsPdfLoading(false); return; }
          const result = await mm.convertToHtml({ arrayBuffer: ev.target?.result as ArrayBuffer });
          setWordHtml(result.value || "<p>(Document vide)</p>");
          setWordFileName(file.name);
          setWordEditing(true);
        } catch (err) { console.error(err); alert("Erreur lecture Word."); }
        finally { setIsPdfLoading(false); }
      };
      reader.readAsArrayBuffer(file);
    } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
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
        } catch (err) { console.error(err); alert("Erreur lecture PDF."); }
        finally { setIsPdfLoading(false); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Image
      const reader = new FileReader();
      reader.onload = ev => {
        setEvalPages([{ base64: ev.target?.result as string, pageNum: 1 }]);
        setStep("students");
      };
      reader.readAsDataURL(file);
    }
  };

  /** Convert the live-edited Word HTML (in the contentEditable div) into a page image */
  const convertWordToImage = async () => {
    setIsPdfLoading(true);
    try {
      const editorDiv = wordEditorRef.current;
      if (!editorDiv) return;
      const htmlContent = editorDiv.innerHTML;

      // Build a styled A4 HTML document and render it to canvas via window.print capture trick
      // We use an iframe + html2canvas-like approach via blob URL
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5;
    padding: 20mm 20mm 20mm 25mm; background: white; width: 210mm; }
  h1,h2,h3 { margin: 0.5em 0; }
  p { margin: 0.3em 0; }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  td, th { border: 1px solid #999; padding: 4px 8px; }
  li { margin-left: 1.5em; }
</style>
</head><body>${htmlContent}</body></html>`;

      // Use an off-screen iframe to render and capture
      const blob = new Blob([fullHtml], { type: "text/html" });
      const url  = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:794px;height:1123px;border:0;visibility:hidden;";
      document.body.appendChild(iframe);

      await new Promise<void>(res => {
        iframe.onload = () => res();
        iframe.src = url;
      });

      // Give fonts a moment to render
      await new Promise(r => setTimeout(r, 400));

      // Draw iframe content to canvas
      try {
        const cv = document.createElement("canvas");
        cv.width = 794; cv.height = 1123;
        const ctx = cv.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 794, 1123);
        // Use foreignObject approach
        const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:794px;height:1123px;overflow:hidden;background:white;font-family:Times New Roman,serif;font-size:12pt;line-height:1.5;padding:75px 75px 75px 94px;">${htmlContent}</div>
          </foreignObject>
        </svg>`;
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const svgUrl = URL.createObjectURL(svgBlob);
        await new Promise<void>((res, rej) => {
          img.onload = () => { ctx.drawImage(img, 0, 0); res(); };
          img.onerror = rej;
          img.src = svgUrl;
        });
        URL.revokeObjectURL(svgUrl);
        const base64 = cv.toDataURL("image/jpeg", 0.93);
        setEvalPages([{ base64, pageNum: 1 }]);
        setPreviewPage(0);
      } finally {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }
      setWordEditing(false);
      setStep("students");
    } catch (err) {
      console.error("Word→Image error:", err);
      // Fallback: proceed without image (blank page)
      setEvalPages([{ base64: "", pageNum: 1 }]);
      setWordEditing(false);
      setStep("students");
    } finally {
      setIsPdfLoading(false);
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

  const detectQuestions = async () => {
    if (!evalPages.length) return;
    setIsDetecting(true); setDetectErr("");
    try {
      const r = await fetch("/api/detect-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfPagesBase64: evalPages.map(p => p.base64) }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        setDetectErr(`Erreur serveur (${r.status}). ${text.substring(0, 120)}`);
        setIsDetecting(false);
        return;
      }
      const d = await r.json();
      if (d.success && d.questions?.length) {
        setQuestions(d.questions);
        setDetectErr("");
        setStep("grade");
      } else {
        setDetectErr(d.error || "Aucune question détectée. Vérifiez que le document contient des zones de réponse.");
      }
    } catch (e: any) {
      setDetectErr(`Erreur réseau : ${e?.message || "connexion impossible"}. Vérifiez votre connexion et réessayez.`);
    }
    setIsDetecting(false);
  };

  // ── Core: single API call with retry x3 ─────────────────────────────────────
  const generateAnswersForPage = async (
    pageQuestions: DetectedQuestion[],
    attempt = 1
  ): Promise<Record<string, string>> => {
    const MAX_RETRIES = 3;
    const TIMEOUT_MS  = 45_000;

    setGenProgress(`Tentative ${attempt}/${MAX_RETRIES} · ${pageQuestions.length} questions…`);
    console.log(`[generateAnswersForPage] attempt ${attempt} for`, pageQuestions.map(q => q.id));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const r = await fetch("/api/generate-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          questions: pageQuestions,
          criteriaLevel,
          studentName: activeProfile.name,
          variantSeed,
          pdfPagesBase64: evalPages.map(p => p.base64),
          saveSession: attempt === 1, // only save on first attempt
        }),
      });
      clearTimeout(timer);

      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status}: ${text.substring(0, 150)}`);
      }

      const d = await r.json();
      console.log("[generateAnswersForPage] server response:", JSON.stringify(d).substring(0, 400));

      if (!d.success) throw new Error(d.error || "Réponse serveur invalide");

      const rawAnswers: Record<string, unknown> = d.answers || {};
      console.log("[Gemini RAW answers]", rawAnswers);

      // 4-tier ID normalization
      const normalized = normalizeGeminiAnswers(rawAnswers, pageQuestions);
      console.log("[Mapped answers]", normalized);

      // If we got at least one answer, return it
      if (Object.keys(normalized).length > 0) return normalized;

      // Ultimate fallback: if rawAnswers has values but normalization returned 0
      if (Object.keys(rawAnswers).length > 0) {
        console.warn("[generateAnswersForPage] normalization returned 0 — applying pure positional fallback");
        const allValues = Object.values(rawAnswers).map(v => flattenValue(v)).filter(Boolean);
        const positional: Record<string, string> = {};
        pageQuestions.forEach((q, i) => {
          if (allValues[i]) positional[q.id] = allValues[i];
        });
        if (Object.keys(positional).length > 0) return positional;
      }

      throw new Error(`0 réponse mappée sur ${Object.keys(rawAnswers).length} reçues`);

    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);

      if (attempt < MAX_RETRIES) {
        const delay = attempt * 1500; // 1.5s → 3s backoff
        console.warn(`[generateAnswersForPage] attempt ${attempt} failed (${msg}) — retry in ${delay}ms`);
        setGenProgress(`Échec tentative ${attempt}. Nouvel essai dans ${delay / 1000}s…`);
        await new Promise(res => setTimeout(res, delay));
        return generateAnswersForPage(pageQuestions, attempt + 1);
      }

      throw new Error(`Échec après ${MAX_RETRIES} tentatives: ${msg}`);
    }
  };

  // ── Main orchestrator ─────────────────────────────────────────────────────
  const generateAllAnswers = async (fromPreview = false) => {
    if (!questions.length) {
      setGenErr("Aucune question détectée. Allez à l'étape 'Résoudre' et détectez d'abord les questions.");
      return;
    }

    console.log("[generateAllAnswers] Questions détectées:", questions);
    setIsGenerating(true);
    setGenErr("");
    setGenProgress("Initialisation…");

    try {
      // Generate all answers in one call (server handles multiple pages)
      const normalized = await generateAnswersForPage(questions);

      // Apply answers to state
      setAnswers(normalized);
      setOffsets({});
      setRefreshKey(k => k + 1); // force React rerender

      // Navigate to first page that has answers
      const answeredQuestions = questions.filter(q => normalized[q.id]);
      if (answeredQuestions.length > 0) {
        const firstPage = answeredQuestions.reduce((min, q) => Math.min(min, q.pageIndex), Infinity);
        setPreviewPage(firstPage === Infinity ? 0 : firstPage);
      }

      setGenProgress("");
      setGenErr("");

      if (!fromPreview) {
        setStep("preview");
        setSidePanel("position");
      }

      console.log(
        "[generateAllAnswers] ✅ Done.",
        Object.keys(normalized).length, "/", questions.length, "answers set"
      );

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[generateAllAnswers] ❌ Fatal:", msg);
      setGenErr(`Erreur de génération: ${msg}`);
      setGenProgress("");
    }

    setIsGenerating(false);
  };

  // Alias for backward compat with places calling generateAnswers()
  const generateAnswers = generateAllAnswers;

  const generateBatchStudentAnswers = async (bsId: string) => {
    const bs = batchStudents.find(b => b.id === bsId);
    if (!bs || !questions.length) return;
    setBatchStudents(prev => prev.map(b => b.id === bsId ? { ...b, isGenerating: true } : b));
    try {
      // Unique seed: combine index + timestamp hash so same-level students get different answers
      const idx = batchStudents.findIndex(b => b.id === bsId);
      const seed = idx * 7 + 1 + (parseInt(bsId.replace(/\D/g, "").slice(-4) || "0") % 97);
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

  // Generate ALL batch students sequentially with global progress tracking
  const generateAllBatchStudents = async () => {
    const pending = batchStudents.filter(b => !b.isDone && b.profile.name);
    if (!pending.length || !questions.length) return;
    setBatchProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      setBatchProgress({ done: i, total: pending.length });
      await generateBatchStudentAnswers(pending[i].id);
      setBatchProgress({ done: i + 1, total: pending.length });
    }
    setBatchProgress(null);
  };

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
          setBatchStudents(prev => prev.map(b => b.id === currentBatch.id ? { ...b, comments: nc } : b));
        } else {
          setComments(nc);
        }
        setActiveEffects(prev => ({ ...prev, showComments: true }));
      }
    } catch (err) { console.error(err); }
    setIsGenComments(false);
  };

  // ── Generate teacher evaluation note ─────────────────────────────────────
  const generateTeacherNote = async () => {
    setIsGenNote(true); setGenNoteErr("");
    try {
      // Build a rich context-aware prompt using actual student answers + grading grid (page 1)
      const answersSummary = Object.entries(activeAnswers)
        .map(([qId, ans]) => {
          const q = questions.find(x => x.id === qId);
          return q ? `Q: ${q.text}\nRéponse: ${ans}` : `Q(${qId}): ${ans}`;
        })
        .join("\n\n");

      const promptText = `Tu es un enseignant bienveillant et précis. Rédige un commentaire d'évaluation en 2-3 phrases pour l'élève "${activeDisplayProfile.name}" qui a obtenu le niveau ${criteriaLevel}/8.

${answersSummary ? `Voici les réponses de l'élève :\n${answersSummary}\n\n` : ""}Appuie-toi sur la grille de notation visible dans l'image (page 1) pour justifier ce niveau. Sois pédagogique, bienveillant et précis. Texte brut uniquement, sans markdown ni puces.`;

      const summaryQ = [{ id: "teacher_note", text: promptText }];

      // Include page 1 (grading grid) as image context if available
      const page1Base64 = evalPages.length > 0 ? evalPages[0].base64 : "";

      const r = await fetch("/api/generate-answers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: summaryQ,
          criteriaLevel,
          studentName: activeDisplayProfile.name,
          variantSeed: Date.now() % 1000,
          pdfPagesBase64: page1Base64 ? [page1Base64] : [],
          saveSession: false,
        }),
      });
      const d = await r.json();
      const noteText = d?.answers?.teacher_note || d?.answers?.[Object.keys(d?.answers ?? {})[0]] || "";
      if (noteText) {
        setActiveTeacherNote({
          text: noteText,
          x: 5, y: 88,
          color: DEFAULT_TEACHER_COLOR,
          fontKey: DEFAULT_TEACHER_FONT,
          fontSize: DEFAULT_TEACHER_FONTSIZE,
        });
      } else {
        setGenNoteErr(d.error || "Pas de texte généré.");
      }
    } catch (e: any) {
      setGenNoteErr(e?.message || "Erreur réseau");
    }
    setIsGenNote(false);
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

  const printSingle = useCallback((
    pProfile: StudentProfile,
    pAnswers: Record<string, string>,
    pOffsets: Record<string, { x: number; y: number }>,
    pComments: TeacherComment[],
  ) => {
    const pages = evalPages.length > 0 ? evalPages : [{ base64: "", pageNum: 1 }];
    const html = buildPrintHTML(pages, questions, pAnswers, pOffsets, pProfile, pComments, activeEffects, pProfile.name, activeArtImages, activeTeacherNote, activeNamePos, activeGradeMarks, activeArtTransforms);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("Autorisez les pop-ups pour imprimer."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }, [evalPages, questions, activeEffects, activeArtImages, activeTeacherNote, activeNamePos, activeGradeMarks, activeArtTransforms]);

  const printAllBatch = useCallback(() => {
    const pages = evalPages.length > 0 ? evalPages : [{ base64: "", pageNum: 1 }];
    // Reuse buildPrintHTML for each student — each with their own per-student overlays
    const allHTML = batchStudents.filter(b => b.isDone).map(bs => {
      // Extract inner body HTML from buildPrintHTML (strip full html wrapper)
      const fullHtml = buildPrintHTML(
        pages, questions, bs.answers, bs.offsets, bs.profile,
        bs.comments, bs.effects, bs.profile.name,
        bs.artImages, bs.teacherNote, bs.namePos,
        bs.gradeMarks, bs.artTransforms,
      );
      // Extract just the <body> contents
      const bodyMatch = fullHtml.match(/<body>([\s\S]*?)<script>/);
      return bodyMatch ? bodyMatch[1].trim() : "";
    }).join("\n");

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Impression groupe — nanobanana PRO</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Homemade+Apple&family=Marck+Script&family=Parisienne&family=Allura&family=La+Belle+Aurore&family=Bad+Script&family=Caveat:wght@400;600&family=Dancing+Script:wght@400;600&family=Sacramento&family=Satisfy&family=Great+Vibes&family=Kalam:wght@300;400;700&family=Indie+Flower&family=Shadows+Into+Light&family=Patrick+Hand&family=Nothing+You+Could+Do&display=swap">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:white}@page{margin:0;size:A4 portrait}</style>
</head><body>${allHTML}
<script>document.fonts.ready.then(()=>{setTimeout(()=>{window.print();},600);});<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("Autorisez les pop-ups."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }, [batchStudents, evalPages, questions]);

  const displayPages = evalPages.length > 0 ? evalPages : [{ base64: "", pageNum: 1 }];
  const upd = <K extends keyof StudentProfile>(k: K, v: StudentProfile[K]) =>
    setActiveProfile(prev => ({ ...prev, [k]: v }));

  // ── Safe profile loader — fills any missing/undefined fields with defaults ──
  // Prevents crashes when old profiles (missing new fields) are loaded from DB/LS
  const safeProfile = (p: StudentProfile): StudentProfile => ({
    ...defaultProfile(p.name),
    ...p,
    hwImage: p.hwImageBase64 || p.hwImage || null,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex antialiased" style={{ background: "linear-gradient(135deg,#f8faff 0%,#f0f4ff 50%,#faf5ff 100%)" }}>
      <StepRail current={step} onGoto={setStep} />

      <div className="flex-1 flex flex-col min-h-screen" style={{ background: "linear-gradient(135deg,#f8faff 0%,#f0f4ff 50%,#faf5ff 100%)" }}>
        {/* Mobile step bar */}
        <StepBar current={step} onGoto={setStep} />

        {/* Header strip */}
        <header className="bg-white/90 backdrop-blur border-b border-slate-200/80 px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black italic text-white text-sm shadow-md"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>IB</div>
            <span className="font-black text-sm text-slate-800">Al Kawthar — Évaluations IB</span>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              {STEPS.map((s, i) => {
                const ci2 = STEPS.findIndex(x => x.key === step);
                const isDone = i < ci2, isActive = s.key === step;
                return (
                  <React.Fragment key={s.key}>
                    {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                    <span className={`font-semibold ${isActive ? "text-indigo-600" : isDone ? "text-slate-500" : "text-slate-300"}`}>
                      {s.label}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {activeProfile.fingerprint && (
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full border
                ${activeProfile.fingerprint.confidenceScore >= 75 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                ✦ {activeProfile.fingerprint.confidenceScore}%
              </span>
            )}
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${mongoOk ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
              {mongoOk ? "● MongoDB" : "● Local"}
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700">⚡ Gemini 2.5</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <AnimatePresence mode="wait">

            {/* ══ WORD EDITOR MODAL ══ */}
            {wordEditing && (
              <motion.div key="word-editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-50 flex flex-col"
                style={{ backdropFilter: "blur(4px)" }}>
                {/* Toolbar */}
                <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2 flex-wrap shrink-0 shadow-lg">
                  <div className="flex items-center gap-2 mr-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-xs"
                      style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>W</div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 leading-none truncate max-w-48">{wordFileName}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Éditeur Word intégré — modifiez avant de convertir</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                    {/* Text formatting toolbar */}
                    {[
                      { cmd: "bold",          label: <strong className="text-xs">G</strong>, title: "Gras (Ctrl+B)" },
                      { cmd: "italic",        label: <em className="text-xs">I</em>,        title: "Italique (Ctrl+I)" },
                      { cmd: "underline",     label: <u className="text-xs">S</u>,          title: "Souligné (Ctrl+U)" },
                    ].map(b => (
                      <button key={b.cmd}
                        onMouseDown={e => { e.preventDefault(); document.execCommand(b.cmd); }}
                        title={b.title}
                        className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-100 flex items-center justify-center transition">
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                    {[
                      { cmd: "justifyLeft",   icon: "⬅", title: "Aligner gauche" },
                      { cmd: "justifyCenter", icon: "☰", title: "Centrer" },
                      { cmd: "justifyRight",  icon: "➡", title: "Aligner droite" },
                    ].map(b => (
                      <button key={b.cmd}
                        onMouseDown={e => { e.preventDefault(); document.execCommand(b.cmd); }}
                        title={b.title}
                        className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-xs transition">
                        {b.icon}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                    {[
                      { cmd: "insertUnorderedList", icon: "•≡", title: "Liste à puces" },
                      { cmd: "insertOrderedList",   icon: "1≡", title: "Liste numérotée" },
                      { cmd: "outdent",             icon: "←", title: "Réduire retrait" },
                      { cmd: "indent",              icon: "→", title: "Augmenter retrait" },
                    ].map(b => (
                      <button key={b.cmd}
                        onMouseDown={e => { e.preventDefault(); document.execCommand(b.cmd); }}
                        title={b.title}
                        className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-[10px] font-bold transition">
                        {b.icon}
                      </button>
                    ))}
                  </div>
                  {/* Font size */}
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                    <span className="text-[10px] text-slate-500">Taille</span>
                    <select className="border border-slate-200 rounded px-1 py-0.5 text-xs focus:outline-none"
                      onChange={e => document.execCommand("fontSize", false, e.target.value)}>
                      {["1","2","3","4","5","6","7"].map(v => <option key={v} value={v}>{["8","10","12","14","18","24","36"][+v-1]}pt</option>)}
                    </select>
                  </div>
                  {/* Line height */}
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                    <span className="text-[10px] text-slate-500 shrink-0">Interligne</span>
                    <select className="border border-slate-200 rounded px-1 py-0.5 text-xs focus:outline-none"
                      onChange={e => {
                        if (wordEditorRef.current) wordEditorRef.current.style.lineHeight = e.target.value;
                      }}>
                      {["1.0","1.15","1.5","2.0","2.5","3.0"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  {/* Delete selection */}
                  <button
                    onMouseDown={e => { e.preventDefault(); document.execCommand("delete"); }}
                    title="Supprimer la sélection"
                    className="w-7 h-7 rounded border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center transition border-l border-l-slate-200 ml-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => { setWordEditing(false); setWordHtml(""); }}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                      ✕ Annuler
                    </button>
                    <button onClick={convertWordToImage} disabled={isPdfLoading}
                      className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm">
                      {isPdfLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                      Convertir & Continuer
                    </button>
                  </div>
                </div>
                {/* A4 editor area */}
                <div className="flex-1 overflow-auto bg-slate-200 p-6">
                  <div className="mx-auto shadow-2xl" style={{ width: 794, minHeight: 1123 }}>
                    <div
                      ref={wordEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      dangerouslySetInnerHTML={{ __html: wordHtml }}
                      style={{
                        width: 794, minHeight: 1123,
                        background: "#fff",
                        padding: "75px 75px 75px 94px",
                        fontFamily: "Times New Roman, serif",
                        fontSize: 12,
                        lineHeight: "1.5",
                        outline: "none",
                        boxSizing: "border-box",
                        color: "#000",
                      }}
                      className="focus:ring-0 word-editor-content"
                    />
                  </div>
                </div>
                {/* Status bar */}
                <div className="bg-white border-t border-slate-200 px-4 py-1.5 flex items-center gap-4 text-[10px] text-slate-500 shrink-0">
                  <span>📄 A4 · Format Word</span>
                  <span>✏️ Cliquez pour éditer · Sélectionnez du texte pour le formater</span>
                  <span className="ml-auto">Ctrl+Z Annuler · Ctrl+A Tout sélectionner · Suppr Effacer</span>
                </div>
              </motion.div>
            )}

            {/* ══ STEP 1 — IMPORT ══ */}
            {step === "import" && !wordEditing && (
              <motion.div key="import" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="max-w-2xl mx-auto space-y-5">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Importer l'évaluation</h2>
                  <p className="text-slate-500 text-sm mt-1">PDF multipage · Word (.docx) · Image</p>
                </div>

                {/* Quick guide */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                  <p className="text-xs font-bold text-indigo-700 mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Comment ça marche ?
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { n: "1", t: "Importez", d: "PDF, Word ou image" },
                      { n: "2", t: "Gemini détecte", d: "Les questions automatiquement" },
                      { n: "3", t: "Réponses générées", d: "En écriture manuscrite réaliste" },
                    ].map(s => (
                      <div key={s.n} className="text-center">
                        <div className="w-7 h-7 bg-indigo-500 text-white rounded-full flex items-center justify-center font-black text-sm mx-auto mb-1">{s.n}</div>
                        <p className="text-[10px] font-bold text-indigo-800">{s.t}</p>
                        <p className="text-[9px] text-indigo-500">{s.d}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Two upload zones side by side */}
                <div className="grid grid-cols-2 gap-3">
                  {/* PDF / Image */}
                  <label className="flex flex-col border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center bg-white cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all group relative">
                    <input type="file" accept="application/pdf,image/*" onChange={handleEvalUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    {isPdfLoading && !wordEditing ? (
                      <div className="flex flex-col items-center gap-2 flex-1 justify-center">
                        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
                        <p className="font-bold text-indigo-600 text-sm">Traitement…</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 flex-1 justify-center">
                        <div className="w-12 h-12 rounded-xl bg-red-100 group-hover:bg-red-200 flex items-center justify-center transition-colors">
                          <FileText className="h-6 w-6 text-red-500" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 text-sm">PDF / Image</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">PDF multipage · PNG · JPG · WebP</p>
                        </div>
                      </div>
                    )}
                  </label>

                  {/* Word .docx */}
                  <label className="flex flex-col border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center bg-white cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group relative">
                    <input type="file" accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                      onChange={handleEvalUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    <div className="flex flex-col items-center gap-2 flex-1 justify-center">
                      <div className="w-12 h-12 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
                        <div className="font-black text-blue-600 text-lg">W</div>
                      </div>
                      <div>
                        <p className="font-bold text-slate-700 text-sm">Word (.docx)</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Éditable · Espacement · Interligne</p>
                      </div>
                      <span className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Éditeur intégré</span>
                    </div>
                  </label>
                </div>

                {/* Or drag anything */}
                <label className="block border-2 border-dashed border-slate-200 rounded-xl py-4 text-center bg-white cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition group relative">
                  <input type="file" accept="application/pdf,image/*,.docx,.doc" onChange={handleEvalUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition" />
                    <p className="text-sm text-slate-400 font-medium">ou glissez-déposez n'importe quel fichier ici</p>
                  </div>
                </label>

                {/* Preloaded */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <h3 className="font-bold text-slate-700 text-sm">Fiches préchargées</h3>
                    <span className="text-[10px] text-slate-400 font-medium">— testez sans PDF</span>
                  </div>
                  <div className="space-y-2">
                    {PRELOADED_TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => loadPreloaded(t.id)}
                        className="w-full flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50 transition text-left group">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-800">{t.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Page {t.pageNumber} · {t.questions.length} question{t.questions.length > 1 ? "s" : ""} prédéfinies</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ══ STEP 2 — STUDENTS ══ */}
            {step === "students" && (
              <motion.div key="students" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="max-w-5xl mx-auto space-y-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">Élèves</h2>
                    <p className="text-slate-500 text-sm">Profils d'écriture et paramètres</p>
                  </div>
                  <button onClick={() => {
                    setBatchMode(b => !b);
                    if (!batchMode && batchStudents.length === 0 && savedProfiles.length > 0) {
                      setBatchStudents([makeBatchStudent(safeProfile(savedProfiles[0]), criteriaLevel)]);
                    }
                  }}
                    className={`flex items-center gap-2 px-4 py-2 border rounded-xl font-bold text-sm transition
                      ${batchMode ? "bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-200" : "bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50"}`}>
                    <Users className="h-4 w-4" />
                    {batchMode ? "Mode Groupe actif" : "Passer en Groupe"}
                  </button>
                </div>

                {batchMode ? (
                  /* ─ BATCH MODE ─ */
                  <div className="space-y-4">
                    {/* ── Select from saved profiles ── */}
                    {savedProfiles.length > 0 && (
                      <div className="bg-white border border-purple-200 rounded-2xl p-4 space-y-3 shadow-sm">
                        <h3 className="font-bold text-sm text-purple-800 flex items-center gap-2">
                          <Users className="h-4 w-4" /> Sélectionner des élèves
                          <span className="ml-auto text-[10px] font-semibold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
                            {batchStudents.length} sélectionné{batchStudents.length > 1 ? "s" : ""}
                          </span>
                        </h3>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {savedProfiles.map(p => {
                            const inBatch = batchStudents.find(b => b.profile.name === p.name);
                            const isInBatch = !!inBatch;
                            return (
                              <div key={p.name} className={`flex items-center gap-2 p-2 rounded-xl border transition
                                ${isInBatch ? "border-purple-400 bg-purple-50" : "border-slate-200 bg-slate-50 hover:border-purple-200 hover:bg-purple-50/50"}`}>
                                {/* Toggle checkbox */}
                                <button
                                  onClick={() => {
                                    if (isInBatch) {
                                      setBatchStudents(prev => prev.filter(b => b.profile.name !== p.name));
                                    } else {
                                      setBatchStudents(prev => [...prev, makeBatchStudent(safeProfile(p), criteriaLevel)]);
                                    }
                                  }}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition
                                    ${isInBatch ? "bg-purple-500 text-white shadow-sm" : "bg-white border-2 border-slate-300 text-slate-500 hover:border-purple-400"}`}>
                                  {isInBatch ? <CheckCircle className="h-4 w-4" /> : p.name[0]?.toUpperCase()}
                                </button>
                                <span className={`text-xs font-semibold flex-1 truncate ${isInBatch ? "text-purple-800" : "text-slate-600"}`}
                                  style={{ fontFamily: getFontFamily(p.fontKey) }}>{p.name}</span>
                                {/* Edit profile button */}
                                <button
                                  onClick={e => { e.stopPropagation(); setEditProfileTarget(safeProfile(p)); }}
                                  title="Modifier le profil"
                                  className="p-1 rounded-lg hover:bg-purple-100 text-slate-300 hover:text-purple-600 transition shrink-0">
                                  <Pencil className="h-3 w-3" />
                                </button>
                                {/* Per-student level selector — only when selected */}
                                {isInBatch && (
                                  <select
                                    value={inBatch.criteriaLevel}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => {
                                      setBatchStudents(prev => prev.map(b =>
                                        b.profile.name === p.name
                                          ? { ...b, criteriaLevel: e.target.value as CriteriaLevel }
                                          : b
                                      ));
                                    }}
                                    className="w-14 border border-purple-300 rounded-lg px-1 py-0.5 text-[10px] font-bold bg-white text-purple-700 focus:outline-none focus:border-purple-500 cursor-pointer">
                                    {EXAM_CRITERIA_LEVELS.map(l => <option key={l.level} value={l.level}>{l.level}/8</option>)}
                                  </select>
                                )}
                                {!isInBatch && (
                                  <span className="text-[9px] text-slate-400 font-medium">Cliquer ici</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 pt-1 border-t border-purple-100">
                          <button onClick={() => setBatchStudents(savedProfiles.map(p => makeBatchStudent(safeProfile(p), criteriaLevel)))}
                            className="flex-1 py-1.5 bg-purple-500 text-white border border-purple-500 rounded-xl text-xs font-bold hover:bg-purple-600 transition flex items-center justify-center gap-1.5 shadow-sm">
                            <CheckCircle className="h-3 w-3" /> Tout sélectionner
                          </button>
                          <button onClick={() => setBatchStudents([])}
                            className="flex-1 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition">
                            ✕ Tout désélectionner
                          </button>
                        </div>
                        {batchStudents.length > 0 && (
                          <p className="text-[9px] text-purple-500 text-center font-medium">
                            💡 Chaque élève a son propre niveau — changez-le directement dans la liste
                          </p>
                        )}
                      </div>
                    )}

                    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-slate-700 flex items-center gap-2">
                          <Users className="h-4 w-4 text-purple-500" />
                          Groupe — {batchStudents.length} élève{batchStudents.length > 1 ? "s" : ""}
                        </h3>
                        {batchStudents.length > 0 && (
                          <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                            {batchStudents.filter(b => b.isDone).length}/{batchStudents.length} générés
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {batchStudents.map(bs => (
                          <BatchStudentRow key={bs.id} bs={bs} savedProfiles={savedProfiles}
                            onUpdate={(id, patch) => setBatchStudents(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))}
                            onRemove={id => setBatchStudents(prev => prev.filter(b => b.id !== id))}
                            onGenerate={generateBatchStudentAnswers} questions={questions} />
                        ))}
                        {batchStudents.length === 0 && (
                          <div className="py-6 text-center">
                            <Users className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                            <p className="text-xs text-slate-400 font-medium">Aucun élève sélectionné</p>
                            <p className="text-[10px] text-slate-300 mt-0.5">Sélectionnez depuis vos profils enregistrés ci-dessus ou ajoutez manuellement</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setBatchStudents(prev => [...prev, makeBatchStudent(defaultProfile(`Élève ${prev.length + 1}`), criteriaLevel)])}
                          className="flex-1 py-2 border border-dashed border-slate-300 rounded-xl text-xs font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition flex items-center justify-center gap-1">
                          <Plus className="h-3.5 w-3.5" /> Ajouter manuel
                        </button>
                        <button onClick={generateAllBatchStudents}
                          disabled={!questions.length || !!batchProgress || batchStudents.length === 0}
                          className="flex-1 py-2 bg-purple-500 text-white rounded-xl text-xs font-bold hover:bg-purple-600 transition disabled:opacity-50 flex items-center justify-center gap-1">
                          {batchProgress ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {batchProgress ? `${batchProgress.done}/${batchProgress.total}…` : "Générer TOUS"}
                        </button>
                      </div>
                      {/* Batch progress bar */}
                      {batchProgress && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] text-purple-600 font-bold">
                            <span>Génération séquentielle…</span>
                            <span>{batchProgress.done}/{batchProgress.total} élèves</span>
                          </div>
                          <div className="h-2.5 bg-purple-100 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full transition-all duration-500"
                              style={{ width: `${batchProgress.total > 0 ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }} />
                          </div>
                          <p className="text-[8px] text-purple-400 text-center">Chaque élève reçoit des réponses uniques adaptées à son niveau</p>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between gap-3">
                      <button onClick={() => setStep("import")}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition">
                        <ChevronLeft className="h-4 w-4" /> Retour
                      </button>
                      <button onClick={() => {
                        if (questions.length === 0 && evalPages.length > 0) setStep("solve");
                        else if (batchStudents.some(b => b.isDone)) setStep("preview");
                        else setStep("grade");
                      }} disabled={batchStudents.length === 0}
                        className="flex items-center gap-1.5 px-7 py-2.5 bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-600 transition disabled:opacity-50">
                        Continuer <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ─ SINGLE MODE ─ */
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                    {/* Saved list */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-slate-700 flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-slate-400" /> Enregistrés
                        </h3>
                        <button onClick={loadProfiles} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition">
                          <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </div>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto">
                        {savedProfiles.length === 0
                          ? <div className="py-8 text-center text-sm text-slate-400 font-medium">Aucun élève enregistré</div>
                          : savedProfiles.map(p => (
                            <div key={p.name}
                              onClick={() => setActiveProfile(safeProfile(p))}
                              className={`flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition group
                                ${activeProfile.name === p.name ? "border-indigo-300 bg-indigo-50 shadow-sm" : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"}`}>
                              {/* Avatar with font preview */}
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center font-black text-base shrink-0 shadow-sm"
                                style={{ fontFamily: getFontFamily(p.fontKey) }}>
                                {p.name[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-xs text-slate-800 truncate">{p.name}</p>
                                <p className="text-[9px] text-slate-400" style={{ fontFamily: getFontFamily(p.fontKey) }}>
                                  {getFontFamily(p.fontKey)}
                                </p>
                                {p.fingerprint && <p className="text-[9px] text-emerald-600 font-bold">✦ Empreinte {p.fingerprint.confidenceScore}%</p>}
                              </div>
                              {activeProfile.name === p.name && <CheckCircle className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                              {/* Edit button — opens quick-edit modal */}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setEditProfileTarget(safeProfile(p));
                                }}
                                title="Modifier l'élève"
                                className="p-1.5 rounded-lg hover:bg-indigo-100 hover:text-indigo-600 text-slate-400 transition shrink-0 opacity-0 group-hover:opacity-100">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); deleteProfile(p.name); }}
                                className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition shrink-0">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                      </div>
                      <button onClick={() => setActiveProfile(defaultProfile())}
                        className="w-full py-2 border border-dashed border-slate-200 rounded-xl text-xs font-semibold text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition flex items-center justify-center gap-1">
                        <Plus className="h-3.5 w-3.5" /> Nouvel élève
                      </button>
                    </div>

                    {/* Profile editor */}
                    <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 overflow-y-auto max-h-[80vh]">
                      <h3 className="font-bold text-sm text-slate-700 flex items-center gap-1.5">
                        <User className="h-4 w-4 text-slate-400" /> Profil actif
                      </h3>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Nom</label>
                        <input type="text" value={activeProfile.name} onChange={e => upd("name", e.target.value)}
                          className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                          placeholder="Ex: Ahmed Benali…" />
                      </div>

                      {/* Handwriting sample */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Échantillon d'écriture (photo)</label>
                        <label className="mt-1 block border border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition relative">
                          <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={e => {
                              const f = e.target.files?.[0]; if (!f) return;
                              const r = new FileReader();
                              r.onload = ev => analyzeHandwriting(ev.target?.result as string, f.name);
                              r.readAsDataURL(f);
                            }} />
                          {isAnalyzing
                            ? <div className="flex flex-col items-center gap-2"><RefreshCw className="h-5 w-5 animate-spin text-indigo-500" /><p className="text-xs font-bold text-indigo-600">Analyse Gemini…</p></div>
                            : activeProfile.fingerprint
                              ? <div className="flex items-center gap-2 justify-center"><CheckCircle className="h-4 w-4 text-emerald-500" /><span className="text-xs font-bold text-emerald-600">Empreinte {activeProfile.fingerprint.confidenceScore}% — cliquer pour changer</span></div>
                              : <div className="flex flex-col items-center gap-1"><BookOpen className="h-5 w-5 text-slate-300" /><p className="text-xs font-semibold text-slate-400">Photo → empreinte 25 paramètres</p></div>}
                        </label>
                        {activeProfile.analysisDescription && (
                          <p className="text-[9px] text-emerald-700 font-medium bg-emerald-50 rounded-lg px-2 py-1 mt-1">✓ {activeProfile.analysisDescription}</p>
                        )}
                      </div>

                      {/* Font */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Style d'écriture</label>
                        {FONT_CATEGORIES.map(cat => (
                          <div key={cat.id} className="mt-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{cat.label}</p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {HANDWRITING_FONTS.filter(f => f.category === cat.id).map(f => (
                                <button key={f.key} onClick={() => upd("fontKey", f.key)}
                                  className={`px-2 py-2.5 border-2 rounded-xl transition flex flex-col items-center gap-0.5
                                    ${activeProfile.fontKey === f.key ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-slate-100 hover:border-slate-300 bg-white"}`}>
                                  <span style={{ fontFamily: f.family, fontSize: 18, color: activeProfile.inkColor, lineHeight: 1 }}>Abc</span>
                                  <span className={`text-[9px] font-bold ${activeProfile.fontKey === f.key ? "text-indigo-700" : "text-slate-500"}`}>{f.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Ink color */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Couleur d'encre</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {INK_COLORS.map(c => (
                            <button key={c.value} title={c.label} onClick={() => upd("inkColor", c.value)}
                              className={`w-7 h-7 rounded-full border-2 transition ${activeProfile.inkColor === c.value ? "border-slate-700 scale-110 ring-2 ring-offset-1 ring-slate-400" : "border-transparent hover:border-slate-400"}`}
                              style={{ background: c.value }} />
                          ))}
                          <label className="w-7 h-7 rounded-full border-2 border-slate-300 cursor-pointer relative overflow-hidden">
                            <input type="color" value={activeProfile.inkColor} onChange={e => upd("inkColor", e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                            <div className="w-full h-full rounded-full" style={{ background: activeProfile.inkColor }} />
                          </label>
                        </div>
                      </div>

                      {/* Sliders */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                          <Sliders className="h-3 w-3" /> Paramètres
                        </label>
                        <div className="space-y-2 mt-1.5">
                          {[
                            { k: "messinessIntensity" as const, label: "Désordre",    min: 0, max: 6,   step: 0.1 },
                            { k: "fontSize"           as const, label: "Taille",      min: 11, max: 26, step: 0.5 },
                            { k: "lineWobbleAmp"      as const, label: "Tremblement", min: 0, max: 5,   step: 0.1 },
                            { k: "penThickness"       as const, label: "Épaisseur",   min: 0.5, max: 3.5, step: 0.1 },
                          ].map(s => (
                            <div key={s.k} className="flex items-center gap-2">
                              <span className="text-[10px] font-medium text-slate-500 w-20 shrink-0">{s.label}</span>
                              <input type="range" min={s.min} max={s.max} step={s.step}
                                value={activeProfile[s.k] as number}
                                onChange={e => upd(s.k, parseFloat(e.target.value))}
                                className="flex-1 accent-indigo-500 h-1.5 rounded" />
                              <span className="text-[10px] font-bold text-slate-600 w-7 text-right">{(activeProfile[s.k] as number).toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Realism toggles */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                          <Zap className="h-3 w-3" /> Effets réalisme
                        </label>
                        <div className="grid grid-cols-2 gap-2 mt-1.5">
                          {[
                            { k: "enableRatures" as const, label: "Ratures",     sub: "raturesRate" as const, min: 0.01, max: 0.15 },
                            { k: "enableBlanco"  as const, label: "Blanco",      sub: "blancoRate"  as const, min: 0.01, max: 0.1  },
                            { k: "enableSmudges" as const, label: "Bavures",     sub: null, min: 0, max: 0 },
                            { k: "enablePressureVar" as const, label: "Pression",sub: null, min: 0, max: 0 },
                            { k: "enableLineWobble"  as const, label: "Ligne",   sub: "lineWobbleAmp" as const, min: 0, max: 5 },
                            { k: "inkDrySkipping"    as const, label: "Encre saute", sub: null, min: 0, max: 0 },
                          ].map(s => (
                            <div key={s.k}
                              className={`p-2.5 border rounded-xl transition cursor-pointer
                                ${activeProfile[s.k] ? "border-indigo-200 bg-indigo-50" : "border-slate-100 bg-slate-50"}`}
                              onClick={() => upd(s.k, !activeProfile[s.k] as any)}>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all
                                  ${activeProfile[s.k] ? "bg-indigo-500 border-indigo-500" : "border-slate-300"}`}>
                                  {activeProfile[s.k] && <CheckCircle className="h-2.5 w-2.5 text-white" />}
                                </div>
                                <p className="text-[10px] font-semibold text-slate-700">{s.label}</p>
                              </div>
                              {s.sub && activeProfile[s.k] && (
                                <input type="range" min={s.min} max={s.max} step={0.01}
                                  value={activeProfile[s.sub] as number}
                                  onChange={e => { e.stopPropagation(); upd(s.sub!, parseFloat(e.target.value)); }}
                                  onClick={e => e.stopPropagation()}
                                  className="w-full mt-1.5 accent-indigo-500 h-1 rounded" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Live preview */}
                      <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 min-h-12">
                        <p className="text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wide">Aperçu live</p>
                        <HandwrittenText text="Voici mon écriture avec tous les effets activés."
                          qId="preview-live" profile={activeProfile} variantSeed={variantSeed} effects={effects} />
                      </div>

                      <button onClick={() => saveProfile(activeProfile)}
                        disabled={!activeProfile.name.trim() || isSaving}
                        className="w-full py-2.5 bg-indigo-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-indigo-600 transition shadow-lg shadow-indigo-200">
                        {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Sauvegarder le profil
                      </button>
                    </div>

                    <div className="lg:col-span-5 flex justify-between gap-3">
                      <button onClick={() => setStep("import")}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition">
                        <ChevronLeft className="h-4 w-4" /> Retour
                      </button>
                      <button onClick={() => {
                        if (evalPages.length > 0 && questions.length === 0) setStep("solve");
                        else setStep("grade");
                      }}
                        disabled={!activeProfile.name.trim()}
                        className="flex items-center gap-1.5 px-7 py-2.5 bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-600 transition disabled:opacity-50">
                        Continuer <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ══ STEP 3 — GRADE ══ */}
            {step === "grade" && (
              <motion.div key="grade" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="max-w-2xl mx-auto space-y-5">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Niveau cible</h2>
                  <p className="text-slate-500 text-sm">Pour <span className="font-bold text-slate-700">{batchMode ? `${batchStudents.length} élèves` : activeProfile.name}</span></p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {EXAM_CRITERIA_LEVELS.map(lvl => (
                    <button key={lvl.level} onClick={() => setCriteriaLevel(lvl.level)}
                      className={`p-4 border-2 rounded-2xl text-left transition-all
                        ${criteriaLevel === lvl.level
                          ? "border-indigo-400 bg-indigo-50 shadow-lg shadow-indigo-100"
                          : "border-slate-200 hover:border-indigo-200 bg-white hover:bg-indigo-50/50"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-2xl font-black text-slate-800">{lvl.level}</span>
                        {criteriaLevel === lvl.level && <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center"><CheckCircle className="h-3 w-3 text-white" /></div>}
                      </div>
                      <p className="text-xs font-bold text-slate-700">{lvl.title.split("(")[1]?.replace(")", "") ?? ""}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{lvl.description.substring(0, 75)}…</p>
                    </button>
                  ))}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-bold text-slate-700">Variante #{variantSeed}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Chaque variante génère des réponses uniques</p>
                  </div>
                  <button onClick={() => setVariantSeed(s => (s % 10) + 1)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Changer
                  </button>
                </div>

                <div className="flex justify-between gap-3">
                  <button onClick={() => setStep("students")}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition">
                    <ChevronLeft className="h-4 w-4" /> Retour
                  </button>
                  <button onClick={() => setStep("solve")}
                    className="flex items-center gap-1.5 px-7 py-2.5 bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-600 transition">
                    Résoudre avec Gemini <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ══ STEP 4 — SOLVE ══ */}
            {step === "solve" && (
              <motion.div key="solve" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="max-w-2xl mx-auto space-y-5">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Résolution AI</h2>
                  <p className="text-slate-500 text-sm">
                    Gemini génère pour <span className="font-bold text-slate-700">{batchMode ? `${batchStudents.length} élève${batchStudents.length > 1 ? "s" : ""}` : activeProfile.name}</span> — niveau {criteriaLevel}
                  </p>
                </div>

                {/* Status summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Document", val: evalPages.length > 0 ? `${evalPages.length} page${evalPages.length > 1 ? "s" : ""}` : "Non chargé", ok: evalPages.length > 0 },
                    { label: "Questions", val: questions.length > 0 ? `${questions.length} détectée${questions.length > 1 ? "s" : ""}` : usePreloaded ? "Prédéfinies" : "À détecter", ok: questions.length > 0 || usePreloaded },
                    { label: "Niveau", val: `${criteriaLevel}/8`, ok: true },
                  ].map(s => (
                    <div key={s.label} className={`p-3 rounded-xl border ${s.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
                      <p className={`text-xs font-bold mt-0.5 ${s.ok ? "text-emerald-700" : "text-amber-700"}`}>{s.val}</p>
                    </div>
                  ))}
                </div>

                {/* Detect questions */}
                {!usePreloaded && questions.length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <ScanSearch className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-700">Détection des questions</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Gemini analyse le document et identifie toutes les zones de réponse</p>
                      </div>
                    </div>
                    {detectErr && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-red-700">Erreur de détection</p>
                            <p className="text-[10px] font-medium text-red-600 mt-0.5 break-words">{detectErr}</p>
                          </div>
                        </div>
                        <button onClick={() => { setDetectErr(""); detectQuestions(); }}
                          className="w-full py-2 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-100 transition flex items-center justify-center gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
                        </button>
                      </div>
                    )}
                    <button onClick={detectQuestions} disabled={isDetecting}
                      className="w-full py-4 bg-blue-500 text-white border-0 rounded-xl font-bold text-base shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-blue-600 active:scale-[0.99] transition-all">
                      {isDetecting
                        ? <><RefreshCw className="h-5 w-5 animate-spin" /> Analyse Gemini en cours…</>
                        : <><ScanSearch className="h-5 w-5" /> Détecter les questions</>}
                    </button>
                    {isDetecting && (
                      <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        <p className="text-[10px] text-blue-600 font-medium">Gemini analyse chaque page du document… cela peut prendre 15-30 secondes</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Question list */}
                {questions.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      </div>
                      <h3 className="font-bold text-slate-700">{questions.length} question{questions.length > 1 ? "s" : ""} détectée{questions.length > 1 ? "s" : ""}</h3>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {questions.map((q, i) => (
                        <div key={q.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                          <span className="text-[9px] font-bold text-indigo-500 mt-0.5 w-6 shrink-0">Q{i + 1}</span>
                          <p className="text-xs text-slate-700 font-medium flex-1 leading-relaxed">{q.text}</p>
                          <span className="text-[9px] text-slate-400 shrink-0 font-medium">p.{q.pageIndex + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Generate single */}
                {questions.length > 0 && !batchMode && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Wand2 className="h-4 w-4 text-indigo-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-700">Générer les réponses</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Pour <span className="font-bold text-slate-600">{activeProfile.name}</span> — niveau {criteriaLevel}</p>
                      </div>
                    </div>
                    {genErr && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-red-700">Erreur de génération</p>
                            <p className="text-[10px] font-medium text-red-600 mt-0.5 break-words">{genErr}</p>
                          </div>
                        </div>
                        <button onClick={() => { setGenErr(""); generateAnswers(); }}
                          className="w-full py-2 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-100 transition flex items-center justify-center gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5" /> Réessayer la génération
                        </button>
                      </div>
                    )}
                    <button onClick={generateAnswers} disabled={isGenerating}
                      className="w-full py-5 bg-indigo-500 text-white rounded-2xl font-black text-xl shadow-2xl shadow-indigo-200 hover:bg-indigo-600 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-60">
                      {isGenerating
                        ? <><RefreshCw className="h-6 w-6 animate-spin" /> Gemini génère les réponses…</>
                        : <><Sparkles className="h-6 w-6" /> RÉSOUDRE AVEC GEMINI</>}
                    </button>
                    {isGenerating && (
                      <div className="flex items-center gap-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                        <p className="text-[10px] text-indigo-600 font-medium">Génération en cours… Gemini rédige {questions.length} réponse{questions.length > 1 ? "s" : ""} adaptées au niveau {criteriaLevel}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Batch generate */}
                {questions.length > 0 && batchMode && (
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 space-y-3">
                    <h3 className="font-bold text-purple-700 flex items-center gap-2">
                      <Users className="h-4 w-4" /> Génération groupe
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {batchStudents.map(bs => (
                        <BatchStudentRow key={bs.id} bs={bs} savedProfiles={savedProfiles}
                          onUpdate={(id, patch) => setBatchStudents(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))}
                          onRemove={id => setBatchStudents(prev => prev.filter(b => b.id !== id))}
                          onGenerate={generateBatchStudentAnswers} questions={questions} />
                      ))}
                    </div>
                    <button onClick={generateAllBatchStudents}
                      disabled={!batchStudents.some(b => !b.isDone && b.profile.name) || !!batchProgress}
                      className="w-full py-3 bg-purple-500 text-white rounded-xl font-bold text-sm hover:bg-purple-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
                      {batchProgress ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {batchProgress ? `Génération ${batchProgress.done}/${batchProgress.total}…` : "Générer TOUS les élèves"}
                    </button>
                    {/* Batch progress bar */}
                    {batchProgress && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-purple-700 font-bold">
                          <span>Génération séquentielle en cours…</span>
                          <span>{batchProgress.done}/{batchProgress.total}</span>
                        </div>
                        <div className="h-2.5 bg-purple-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${batchProgress.total > 0 ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-purple-500 text-center">
                          Chaque élève reçoit des réponses uniques adaptées à son niveau
                        </p>
                      </div>
                    )}
                    {batchStudents.some(b => b.isDone) && (
                      <button onClick={() => { setPreviewPage(0); setActiveBatchIdx(0); setStep("preview"); }}
                        className="w-full py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition flex items-center justify-center gap-2">
                        <Eye className="h-4 w-4" /> Voir l'aperçu
                      </button>
                    )}
                  </div>
                )}

                <div className="flex justify-start">
                  <button onClick={() => setStep("grade")}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition">
                    <ChevronLeft className="h-4 w-4" /> Retour
                  </button>
                </div>
              </motion.div>
            )}

            {/* ══ STEP 5 — PREVIEW ══ */}
            {step === "preview" && (
              <motion.div key="preview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="space-y-3">

                {/* Floating toolbar */}
                <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                      Aperçu
                      {batchMode && currentBatch && <span className="text-sm font-semibold text-purple-600">— {currentBatch.profile.name}</span>}
                      {Object.keys(activeAnswers).length > 0
                        ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{Object.keys(activeAnswers).length} rép. ✓</span>
                        : <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">0 réponse</span>}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setEditMode(m => !m)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-semibold text-xs transition
                        ${editMode ? "bg-indigo-500 text-white border-indigo-500 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"}`}>
                      <Move className="h-3.5 w-3.5" /> {editMode ? "Déplacement ON" : "Déplacer"}
                    </button>
                    <button onClick={() => {
                      if (batchMode && currentBatch) setBatchStudents(prev => prev.map(b => b.id === currentBatch.id ? { ...b, offsets: {} } : b));
                      else setOffsets({});
                    }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg font-semibold text-xs hover:bg-slate-50 transition">
                      <RotateCcw className="h-3.5 w-3.5" /> Reset
                    </button>
                    {batchMode ? (
                      <button onClick={printAllBatch} disabled={!batchStudents.some(b => b.isDone)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-lg font-bold text-xs shadow-md hover:bg-black transition disabled:opacity-50">
                        <Printer className="h-3.5 w-3.5" /> Imprimer GROUPE
                      </button>
                    ) : (
                      <button onClick={() => setStep("print")}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-lg font-bold text-xs shadow-md hover:bg-black transition">
                        <Printer className="h-3.5 w-3.5" /> Imprimer
                      </button>
                    )}
                  </div>
                </div>

                {/* Batch student tabs */}
                {batchMode && batchStudents.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {batchStudents.map((bs, i) => (
                      <button key={bs.id} onClick={() => setActiveBatchIdx(i)}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition
                          ${activeBatchIdx === i ? "border-purple-400 bg-purple-100 text-purple-700" : "border-slate-200 bg-white hover:border-purple-200"}`}>
                        <div className="w-5 h-5 rounded-full bg-purple-400 text-white flex items-center justify-center text-[9px] font-bold">
                          {bs.profile.name[0]?.toUpperCase() || "?"}
                        </div>
                        <span className="truncate max-w-20">{bs.profile.name || "—"}</span>
                        {bs.isDone ? <CheckCircle className="h-3 w-3 text-emerald-500" /> : bs.isGenerating ? <RefreshCw className="h-3 w-3 animate-spin text-indigo-500" /> : null}
                      </button>
                    ))}
                  </div>
                )}

                {/* Page thumbnails */}
                {displayPages.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {displayPages.map((pg, i) => (
                      <button key={i} onClick={() => setPreviewPage(i)}
                        className={`shrink-0 relative border-2 rounded-xl overflow-hidden transition
                          ${previewPage === i ? "border-indigo-400 shadow-lg shadow-indigo-100 scale-105" : "border-slate-200 hover:border-slate-300"}`}
                        style={{ width: 64 }}>
                        {pg.base64
                          ? <img src={pg.base64} alt={`p${i + 1}`} className="w-full h-16 object-cover" />
                          : <div className="w-16 h-20 bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">P.{i + 1}</div>}
                        <div className={`absolute bottom-0 inset-x-0 text-white text-[8px] text-center font-bold py-0.5
                          ${previewPage === i ? "bg-indigo-500" : "bg-slate-700/70"}`}>
                          P.{i + 1} {questions.filter(q => q.pageIndex === i).length > 0 && `(${questions.filter(q => q.pageIndex === i).length}Q)`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Page warning */}
                {Object.keys(activeAnswers).length > 0 && questions.filter(q => q.pageIndex === previewPage && activeAnswers[q.id]).length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-800">Pas de réponses sur cette page</p>
                      <p className="text-[10px] text-amber-600">
                        Les réponses sont sur :&nbsp;
                        {[...new Set(questions.filter(q => activeAnswers[q.id]).map(q => q.pageIndex + 1))].map(p => (
                          <button key={p} onClick={() => setPreviewPage(p - 1)}
                            className="underline font-bold mx-0.5 hover:text-amber-900">page {p}</button>
                        ))}
                      </p>
                    </div>
                  </div>
                )}

                {/* Main: page + sidebar */}
                <div className="flex gap-4 items-start">
                  {/* Page */}
                  <div className="flex-1 shadow-2xl rounded-xl overflow-hidden border border-slate-200">
                    <PageLayer
                      page={displayPages[previewPage] ?? { base64: "", pageNum: 1 }}
                      pi={previewPage}
                      questions={questions} answers={activeAnswers}
                      profile={activeDisplayProfile} variantSeed={activeVarSeed}
                      editMode={editMode} offsets={activeOffsets}
                      onOffsetChange={handleOffsetChange}
                      effects={activeEffects} shapes={shapes}
                      comments={activeComments}
                      onCommentDrag={handleCommentDrag}
                      artImageOverride={activeArtImages[previewPage]}
                      studentName={activeDisplayProfile.name}
                      onUpdateShape={handleUpdateShape}
                      selectedShapeId={selectedShapeId}
                      onSelectShape={setSelectedShapeId}
                      showName={showName}
                      namePosX={activeNamePos.x} namePosY={activeNamePos.y}
                      onNameMove={(dx, dy) => setActiveNamePos(p => ({ x: Math.max(0, Math.min(90, p.x + dx)), y: Math.max(0, Math.min(90, p.y + dy)) }))}
                      teacherNote={activeTeacherNote}
                      onTeacherNoteMove={(dx, dy) => setActiveTeacherNote(n => n ? { ...n, x: Math.max(0, Math.min(90, n.x + dx)), y: Math.max(0, Math.min(90, n.y + dy)) } : n)}
                      gradeMarks={activeGradeMarks}
                      onGradeMarkMove={(id, dx, dy) => updateGradeMark(id, {
                        x: Math.max(0, Math.min(95, (activeGradeMarks.find(m => m.id === id)?.x ?? 0) + dx)),
                        y: Math.max(0, Math.min(95, (activeGradeMarks.find(m => m.id === id)?.y ?? 0) + dy)),
                      })}
                      selectedGradeMarkId={selectedGradeMarkId}
                      onSelectGradeMark={setSelectedGradeMarkId}
                      artTransform={activeArtTransforms[previewPage]}
                      onArtUpdate={patch => setActiveArtTransforms(prev => ({
                        ...prev,
                        [previewPage]: { ...(prev[previewPage] ?? { x: 0, y: 0, w: 100, h: 100, cropX: 0, cropY: 0, cropW: 100, cropH: 100, rotation: 0 }), ...patch },
                      }))}
                    />
                  </div>

                  {/* Sidebar */}
                  <div className="w-72 shrink-0 space-y-3 sticky top-20 max-h-[87vh] overflow-y-auto">
                    {/* Tab bar */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex border-b border-slate-100">
                        {[
                          { k: "position" as const, label: "Pos.", icon: <Move className="h-3 w-3" /> },
                          { k: "effects"  as const, label: "Effets", icon: <Eye className="h-3 w-3" /> },
                          { k: "comments" as const, label: "Prof",  icon: <MessageSquare className="h-3 w-3" /> },
                          { k: "geometry" as const, label: "Géo",   icon: <Triangle className="h-3 w-3" /> },
                          { k: "art"      as const, label: "Art",   icon: <Image className="h-3 w-3" /> },
                          { k: "grades"   as const, label: "Notes", icon: <Star className="h-3 w-3" /> },
                        ].map(t => (
                          <button key={t.k} onClick={() => setSidePanel(t.k as any)}
                            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[9px] font-bold transition border-r last:border-r-0 border-slate-100
                              ${sidePanel === t.k ? "bg-indigo-500 text-white" : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"}`}>
                            {t.icon}
                            {t.label}
                          </button>
                        ))}
                      </div>

                      <div className="p-3">
                        {/* Position */}
                        {sidePanel === "position" && (
                          <div className="space-y-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Position des réponses</p>
                            {questions.filter(q => q.pageIndex === previewPage && activeAnswers[q.id]).length === 0 ? (
                              <div className="py-6 text-center">
                                <p className="text-xs text-slate-400 font-medium">Aucune réponse sur cette page</p>
                                <p className="text-[9px] text-slate-300 mt-1">Générez d'abord les réponses</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-[9px] text-slate-400">Cliquez les flèches ou faites glisser en mode "Déplacer"</p>
                                {questions.filter(q => q.pageIndex === previewPage && activeAnswers[q.id]).map(q => {
                                  const off = activeOffsets[q.id] ?? { x: 0, y: 0 };
                                  return (
                                    <div key={q.id} className="bg-slate-50 border border-slate-100 rounded-xl p-2 space-y-1.5">
                                      <p className="text-[9px] font-bold text-slate-500 truncate">{q.id}: {q.text.substring(0, 30)}…</p>
                                      <div className="flex items-center gap-2">
                                        <div className="grid grid-cols-3 gap-0.5">
                                          <div />
                                          <button onClick={() => handleOffsetChange(q.id, 0, -10)}
                                            className="w-7 h-7 bg-white border border-slate-200 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 flex items-center justify-center transition">↑</button>
                                          <div />
                                          <button onClick={() => handleOffsetChange(q.id, -10, 0)}
                                            className="w-7 h-7 bg-white border border-slate-200 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 flex items-center justify-center transition">←</button>
                                          <button onClick={() => {
                                            if (batchMode && currentBatch) setBatchStudents(prev => prev.map(b => b.id === currentBatch.id ? { ...b, offsets: { ...b.offsets, [q.id]: { x: 0, y: 0 } } } : b));
                                            else setOffsets(prev => ({ ...prev, [q.id]: { x: 0, y: 0 } }));
                                          }}
                                            className="w-7 h-7 bg-indigo-500 text-white border border-indigo-500 rounded-lg text-[9px] font-bold hover:bg-indigo-600 flex items-center justify-center transition">○</button>
                                          <button onClick={() => handleOffsetChange(q.id, 10, 0)}
                                            className="w-7 h-7 bg-white border border-slate-200 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 flex items-center justify-center transition">→</button>
                                          <div />
                                          <button onClick={() => handleOffsetChange(q.id, 0, 10)}
                                            className="w-7 h-7 bg-white border border-slate-200 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 flex items-center justify-center transition">↓</button>
                                          <div />
                                        </div>
                                        <div className="text-[8px] text-slate-400 font-medium">
                                          <div>x:{Math.round(off.x)}</div>
                                          <div>y:{Math.round(off.y)}</div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Effects */}
                        {sidePanel === "effects" && (
                          <div className="space-y-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Effets visibles</p>
                            <EffectToggles effects={activeEffects} onChange={(k, v) => setActiveEffects(prev => ({ ...prev, [k]: v }))} />
                            <button onClick={() => setActiveEffects(defaultEffects())}
                              className="w-full py-1.5 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-500 hover:bg-slate-50 transition mt-1">
                              Tout activer
                            </button>
                          </div>
                        )}

                        {/* Comments + Teacher Note */}
                        {sidePanel === "comments" && (
                          <div className="space-y-3">
                            {/* ─ Teacher evaluation note ─ */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                              <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                                🏅 Commentaire d'évaluation (page 1)
                              </p>
                              <p className="text-[8px] text-amber-600">Gemini explique pourquoi l'élève mérite sa note. Affiché en bas de la 1ère page, déplaçable librement.</p>
                              {activeTeacherNote ? (
                                <div className="space-y-1.5">
                                  <textarea
                                    value={activeTeacherNote.text}
                                    onChange={e => setActiveTeacherNote(n => n ? { ...n, text: e.target.value } : n)}
                                    rows={3}
                                    className="w-full border border-amber-200 rounded-lg p-1.5 text-[9px] focus:outline-none focus:border-amber-400 bg-white resize-none"
                                  />
                                  {/* ─ Couleur ─ */}
                                  <div className="flex gap-1 items-center">
                                    {TEACHER_COLORS.map(c => (
                                      <button key={c.value} onClick={() => setActiveTeacherNote(n => n ? { ...n, color: c.value } : n)}
                                        className={`w-4 h-4 rounded-full border-2 ${activeTeacherNote.color === c.value ? "border-slate-700 scale-110" : "border-transparent"}`}
                                        style={{ background: c.value }} title={c.label} />
                                    ))}
                                    <button onClick={() => setActiveTeacherNote(null)}
                                      className="ml-auto px-1.5 py-0.5 bg-red-50 border border-red-200 rounded text-[8px] text-red-500 font-bold hover:bg-red-100 transition">
                                      ✕ Supprimer
                                    </button>
                                  </div>
                                  {/* ─ Taille ─ */}
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] text-slate-500 w-10 shrink-0">Taille</span>
                                    <input type="range" min={1.5} max={5} step={0.1}
                                      value={activeTeacherNote.fontSize}
                                      onChange={e => setActiveTeacherNote(n => n ? { ...n, fontSize: parseFloat(e.target.value) } : n)}
                                      className="flex-1 accent-amber-500 h-1" />
                                    <span className="text-[8px] font-bold text-amber-600 w-6">{activeTeacherNote.fontSize.toFixed(1)}</span>
                                  </div>
                                  {/* ─ Police ─ */}
                                  <div className="space-y-1">
                                    <span className="text-[8px] text-slate-500 font-semibold">Police du commentaire</span>
                                    <div className="grid grid-cols-3 gap-1">
                                      {HANDWRITING_FONTS.map(f => (
                                        <button key={f.key}
                                          onClick={() => setActiveTeacherNote(n => n ? { ...n, fontKey: f.key } : n)}
                                          className={`px-1 py-1 rounded border text-[7px] truncate transition ${activeTeacherNote.fontKey === f.key ? "border-amber-400 bg-amber-50 font-bold text-amber-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                                          style={{ fontFamily: f.family }}
                                          title={f.label}>
                                          {f.label}
                                        </button>
                                      ))}
                                    </div>
                                    {/* Live preview */}
                                    <div className="mt-1 px-2 py-1.5 bg-white border border-amber-100 rounded-lg overflow-hidden">
                                      <span style={{
                                        fontFamily: getFontFamily(activeTeacherNote.fontKey),
                                        color: activeTeacherNote.color,
                                        fontSize: "11px",
                                        lineHeight: 1.4,
                                      }}>
                                        {activeTeacherNote.text.slice(0, 60) || "Aperçu du commentaire…"}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-[8px] text-amber-500">📌 Mode Déplacer → glissez le commentaire sur la page</p>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {genNoteErr && <p className="text-[8px] text-red-500">{genNoteErr}</p>}
                                  <button onClick={generateTeacherNote} disabled={isGenNote || !Object.keys(activeAnswers).some(Boolean)}
                                    className="w-full py-2 bg-amber-500 text-white rounded-xl font-bold text-[10px] flex items-center justify-center gap-1.5 hover:bg-amber-600 transition disabled:opacity-50">
                                    {isGenNote ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                    {isGenNote ? "Génération…" : "Générer commentaire Gemini"}
                                  </button>
                                  <button onClick={() => setActiveTeacherNote({ text: "Bon travail dans l'ensemble. L'élève démontre une compréhension satisfaisante du sujet.", x: 5, y: 88, color: DEFAULT_TEACHER_COLOR, fontKey: DEFAULT_TEACHER_FONT, fontSize: DEFAULT_TEACHER_FONTSIZE })}
                                    className="w-full py-1.5 border border-amber-200 rounded-xl text-[9px] font-semibold text-amber-700 hover:bg-amber-100 transition">
                                    ✏️ Écrire manuellement
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* ─ Nom élève visible/draggable ─ */}
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <p className="text-[9px] font-bold text-indigo-700">✍️ Nom de l'élève (page 1)</p>
                                <button onClick={() => setShowName(v => !v)}
                                  className={`px-2 py-0.5 rounded text-[8px] font-bold transition ${showName ? "bg-indigo-500 text-white" : "border border-slate-300 text-slate-500"}`}>
                                  {showName ? "Visible" : "Masqué"}
                                </button>
                              </div>
                              {showName && <p className="text-[8px] text-indigo-500">📌 Mode Déplacer → glissez le nom sur la page</p>}
                            </div>

                            {/* ─ Per-question corrections ─ */}
                            <div>
                              <p className="text-[9px] font-bold text-red-500 uppercase tracking-wide flex items-center gap-1 mb-1">
                                ● Corrections par question
                              </p>
                              <CommentManager
                                comments={activeComments} questions={questions} answers={activeAnswers}
                                onUpdate={handleCommentsUpdate}
                                onGenerate={generateComments} isGenerating={isGenComments}
                              />
                            </div>
                          </div>
                        )}

                        {/* Geometry */}
                        {sidePanel === "geometry" && (
                          <div className="space-y-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                              <PenTool className="h-3 w-3" /> Formes géométriques
                            </p>
                            <GeometryBuilder pageIndex={previewPage} onAdd={s => { setShapes(prev => [...prev, s]); setSelectedShapeId(s.id); }} />
                            {shapes.filter(s => s.pageIndex === previewPage).length > 0 && (
                              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wide flex items-center gap-1">
                                  ★ Cliquer une forme pour la sélectionner
                                </p>
                                {shapes.filter(s => s.pageIndex === previewPage).map(s => {
                                  const isSel = selectedShapeId === s.id;
                                  const rot = s.rotation ?? 0;
                                  const typeLabel = s.type === "triangle"
                                    ? `△ ${s.triangleSubtype ? TRIANGLE_SUBTYPES.find(t => t.sub === s.triangleSubtype)?.label ?? s.triangleSubtype : "triangle"}`
                                    : s.type === "line" ? "📏 Segment"
                                    : s.type === "circle" ? "⭕ Cercle"
                                    : "▭ Rectangle";
                                  return (
                                    <div key={s.id}
                                      className={`p-2 rounded-lg border transition cursor-pointer ${
                                        isSel ? "border-indigo-400 bg-indigo-50" : "border-slate-100 bg-slate-50 hover:border-slate-300"
                                      }`}
                                      onClick={() => setSelectedShapeId(isSel ? null : s.id)}>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold text-slate-600 flex-1">{typeLabel}</span>
                                        <button onClick={e => { e.stopPropagation(); setShapes(prev => prev.filter(sh => sh.id !== s.id)); if (selectedShapeId === s.id) setSelectedShapeId(null); }}
                                          className="p-0.5 rounded hover:bg-red-50 transition">
                                          <Trash2 className="h-3 w-3 text-red-400" />
                                        </button>
                                      </div>
                                      {isSel && (
                                        <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>

                                          {/* ── Editable measures ── */}
                                          {s.type === "line" && s.x2 !== undefined && s.y2 !== undefined && (
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[9px] text-slate-500 w-14 shrink-0">Longueur</span>
                                              <input
                                                type="number" min={0.1} max={50} step={0.1}
                                                value={s.measureL !== undefined ? s.measureL : parseFloat(lineLength(s.x1,s.y1,s.x2,s.y2))}
                                                onFocus={e => e.target.select()}
                                                onChange={e => {
                                                  const val = parseFloat(e.target.value);
                                                  if (!isNaN(val) && val > 0) {
                                                    // Scale x2,y2 to achieve the desired length
                                                    const dx = s.x2! - s.x1, dy = (s.y2 ?? 0) - s.y1;
                                                    const curLen = Math.sqrt(dx*dx + dy*dy);
                                                    if (curLen > 0) {
                                                      const ratio = (val / 21 * 100) / curLen;
                                                      handleUpdateShape(s.id, { x2: s.x1 + dx * ratio, y2: s.y1 + dy * ratio, measureL: val });
                                                    }
                                                  }
                                                }}
                                                className="flex-1 border border-slate-200 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-indigo-400 bg-white"
                                              />
                                              <span className="text-[9px] text-slate-400">cm</span>
                                            </div>
                                          )}
                                          {s.type === "circle" && s.radius !== undefined && (
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[9px] text-slate-500 w-14 shrink-0">Rayon</span>
                                              <input
                                                type="number" min={0.5} max={40} step={0.5}
                                                value={s.measureR !== undefined ? s.measureR : parseFloat((s.radius / 100 * 21).toFixed(1))}
                                                onFocus={e => e.target.select()}
                                                onChange={e => {
                                                  const val = parseFloat(e.target.value);
                                                  if (!isNaN(val) && val > 0) {
                                                    handleUpdateShape(s.id, { radius: val / 21 * 100, measureR: val });
                                                  }
                                                }}
                                                className="flex-1 border border-slate-200 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-indigo-400 bg-white"
                                              />
                                              <span className="text-[9px] text-slate-400">cm</span>
                                            </div>
                                          )}
                                          {s.type === "rectangle" && s.x2 !== undefined && s.y2 !== undefined && (
                                            <>
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[9px] text-slate-500 w-14 shrink-0">Largeur</span>
                                                <input
                                                  type="number" min={0.1} max={50} step={0.1}
                                                  value={s.measureW !== undefined ? s.measureW : parseFloat((Math.abs(s.x2-s.x1)/100*21).toFixed(1))}
                                                  onFocus={e => e.target.select()}
                                                  onChange={e => {
                                                    const val = parseFloat(e.target.value);
                                                    if (!isNaN(val) && val > 0) {
                                                      handleUpdateShape(s.id, { x2: s.x1 + val / 21 * 100, measureW: val });
                                                    }
                                                  }}
                                                  className="flex-1 border border-slate-200 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-indigo-400 bg-white"
                                                />
                                                <span className="text-[9px] text-slate-400">cm</span>
                                              </div>
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[9px] text-slate-500 w-14 shrink-0">Hauteur</span>
                                                <input
                                                  type="number" min={0.1} max={50} step={0.1}
                                                  value={s.measureH !== undefined ? s.measureH : parseFloat((Math.abs((s.y2??0)-s.y1)/141.4*29.7).toFixed(1))}
                                                  onFocus={e => e.target.select()}
                                                  onChange={e => {
                                                    const val = parseFloat(e.target.value);
                                                    if (!isNaN(val) && val > 0) {
                                                      handleUpdateShape(s.id, { y2: s.y1 + val / 29.7 * 141.4, measureH: val });
                                                    }
                                                  }}
                                                  className="flex-1 border border-slate-200 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-indigo-400 bg-white"
                                                />
                                                <span className="text-[9px] text-slate-400">cm</span>
                                              </div>
                                            </>
                                          )}

                                          {/* Label override */}
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] text-slate-500 w-14 shrink-0">Étiquette</span>
                                            <input value={s.label || ""}
                                              onChange={e => handleUpdateShape(s.id, { label: e.target.value })}
                                              onFocus={e => e.target.select()}
                                              className="flex-1 border border-slate-200 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-indigo-400 bg-white"
                                              placeholder="ex: AB = 6 cm" />
                                          </div>

                                          {/* Rotation */}
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] text-slate-500 w-14 shrink-0">Rotation</span>
                                            <input type="range" min={-180} max={180} step={1} value={rot}
                                              onChange={e => handleUpdateShape(s.id, { rotation: parseFloat(e.target.value) })}
                                              className="flex-1 accent-indigo-500 h-1.5" />
                                            <span className="text-[9px] font-bold text-indigo-600 w-10 text-right">{rot.toFixed(0)}°</span>
                                          </div>
                                          <button onClick={() => handleUpdateShape(s.id, { rotation: 0 })}
                                            className="w-full py-1 border border-slate-200 rounded text-[9px] font-semibold text-slate-500 hover:bg-slate-100 transition">
                                            ↺ Réinitialiser rotation
                                          </button>

                                          {/* Measure toggle */}
                                          {(s.type === "triangle" || s.type === "line") && (
                                            <button onClick={() => handleUpdateShape(s.id, { showMeasure: !(s.showMeasure !== false) })}
                                              className={`w-full py-1 border rounded text-[9px] font-semibold transition ${
                                                s.showMeasure !== false
                                                  ? "bg-indigo-500 text-white border-indigo-500"
                                                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
                                              }`}>
                                              📏 {s.showMeasure !== false ? "Mesures ON" : "Mesures OFF"}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {shapes.filter(s => s.pageIndex === previewPage).length === 0 && (
                              <p className="text-[9px] text-slate-300 text-center py-2">Aucune forme sur cette page</p>
                            )}
                          </div>
                        )}

                        {/* Art */}
                        {sidePanel === "art" && (
                          <div className="space-y-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                              <Palette className="h-3 w-3" /> Photo / Dessin — déplaçable
                            </p>
                            <label className="block border-2 border-dashed border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition relative">
                              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={e => {
                                  const f = e.target.files?.[0]; if (!f) return;
                                  const r = new FileReader();
                                  r.onload = ev => {
                                    setActiveArtImages(prev => ({ ...prev, [previewPage]: ev.target?.result as string }));
                                    setActiveArtTransforms(prev => ({
                                      ...prev,
                                      [previewPage]: { x: 5, y: 5, w: 60, h: 60, cropX: 0, cropY: 0, cropW: 100, cropH: 100, rotation: 0 },
                                    }));
                                  };
                                  r.readAsDataURL(f);
                                }} />
                              <Image className="h-5 w-5 text-slate-300 mx-auto mb-1" />
                              <p className="text-[9px] font-semibold text-slate-400">{activeArtImages[previewPage] ? "Changer photo" : "Insérer photo / dessin"}</p>
                            </label>
                            {activeArtImages[previewPage] && (() => {
                              const at = activeArtTransforms[previewPage] ?? { x: 5, y: 5, w: 60, h: 60, cropX: 0, cropY: 0, cropW: 100, cropH: 100, rotation: 0 };
                              return (
                                <div className="space-y-2">
                                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 space-y-2">
                                    <p className="text-[9px] font-bold text-slate-500">Position & Taille</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {[
                                        { label: "X (%)", val: at.x, key: "x" as const, min: 0, max: 90 },
                                        { label: "Y (%)", val: at.y, key: "y" as const, min: 0, max: 90 },
                                        { label: "Larg.(%)", val: at.w, key: "w" as const, min: 5, max: 100 },
                                        { label: "Haut.(%)", val: at.h, key: "h" as const, min: 5, max: 100 },
                                      ].map(ctrl => (
                                        <div key={ctrl.key} className="space-y-0.5">
                                          <p className="text-[8px] text-slate-400 font-medium">{ctrl.label}</p>
                                          <input type="number" min={ctrl.min} max={ctrl.max} step={1}
                                            value={Math.round(ctrl.val)}
                                            onFocus={e => e.target.select()}
                                            onChange={e => {
                                              const v = parseFloat(e.target.value);
                                              if (!isNaN(v)) setActiveArtTransforms(prev => ({ ...prev, [previewPage]: { ...at, [ctrl.key]: v } }));
                                            }}
                                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-indigo-400 bg-white" />
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] text-slate-500 w-12 shrink-0">Rotation</span>
                                      <input type="range" min={-180} max={180} step={1} value={at.rotation}
                                        onChange={e => setActiveArtTransforms(prev => ({ ...prev, [previewPage]: { ...at, rotation: parseFloat(e.target.value) } }))}
                                        className="flex-1 accent-indigo-500 h-1.5" />
                                      <span className="text-[9px] font-bold text-indigo-600 w-8 text-right">{at.rotation}°</span>
                                    </div>
                                    <button onClick={() => setActiveArtTransforms(prev => ({ ...prev, [previewPage]: { x: 5, y: 5, w: 60, h: 60, cropX: 0, cropY: 0, cropW: 100, cropH: 100, rotation: 0 } }))}
                                      className="w-full py-1 border border-slate-200 rounded text-[9px] font-semibold text-slate-500 hover:bg-slate-100 transition">
                                      ↺ Réinitialiser position
                                    </button>
                                  </div>
                                  <p className="text-[8px] text-indigo-500">📌 Mode Déplacer → glissez l'image sur la page · ⤡ coin bas-droit pour redimensionner</p>
                                  <button onClick={() => { setActiveArtImages(prev => { const n = { ...prev }; delete n[previewPage]; return n; }); setActiveArtTransforms(prev => { const n = { ...prev }; delete n[previewPage]; return n; }); }}
                                    className="w-full py-1 border border-red-200 rounded-lg text-[9px] font-semibold text-red-500 hover:bg-red-50 transition">
                                    🗑 Supprimer image
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Grades */}
                        {(sidePanel as string) === "grades" && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-1.5">
                              <Star className="h-3.5 w-3.5 text-red-500" />
                              <p className="text-[10px] font-black text-red-600 uppercase tracking-wide flex-1">Annotations Notation</p>
                              {activeGradeMarks.length > 0 && (
                                <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                                  {activeGradeMarks.length} total
                                </span>
                              )}
                            </div>
                            <p className="text-[8px] text-slate-400 leading-relaxed">Stylo rouge — ✓ ✗ notes et textes libres. Activez <strong>Mode Déplacer</strong> puis glissez sur la page.</p>

                            {/* Quick-add buttons — 2+3 grid */}
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { type: "check"  as const, label: "✓ Correct",     bg: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100", icon: "✓" },
                                { type: "cross"  as const, label: "✗ Faux",        bg: "bg-red-50 border-red-300 text-red-700 hover:bg-red-100",         icon: "✗" },
                                { type: "grade"  as const, label: "🔢 Note /8",    bg: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100",  icon: "N" },
                                { type: "date"   as const, label: "📅 Date",       bg: "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100",     icon: "D" },
                              ].map(btn => (
                                <button key={btn.type}
                                  onClick={() => addGradeMark(btn.type, previewPage)}
                                  className={`border rounded-xl py-2.5 text-[10px] font-bold transition active:scale-95 ${btn.bg}`}>
                                  {btn.label}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => addGradeMark("custom", previewPage)}
                              className="w-full border border-dashed border-slate-300 rounded-xl py-2 text-[10px] font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition flex items-center justify-center gap-1.5">
                              <Plus className="h-3 w-3" /> Texte libre personnalisé
                            </button>

                            {/* Existing marks list */}
                            {activeGradeMarks.filter(m => m.pageIndex === previewPage).length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Sur cette page ({activeGradeMarks.filter(m => m.pageIndex === previewPage).length}) :</p>
                                {activeGradeMarks.filter(m => m.pageIndex === previewPage).map(m => (
                                  <div key={m.id}
                                    onClick={() => setSelectedGradeMarkId(selectedGradeMarkId === m.id ? null : m.id)}
                                    className={`rounded-xl border p-2 space-y-1.5 cursor-pointer transition
                                      ${selectedGradeMarkId === m.id
                                        ? "border-red-400 bg-red-50 shadow-sm"
                                        : "border-slate-200 bg-white hover:border-red-200 hover:bg-red-50/30"}`}>
                                    <div className="flex items-center gap-1.5">
                                      <span style={{ color: m.color, fontSize: 18, fontFamily: "Arial", fontWeight: 900, lineHeight: 1 }}>{m.text}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[9px] font-bold text-slate-600 capitalize truncate">{m.type === "check" ? "Correct ✓" : m.type === "cross" ? "Faux ✗" : m.type === "grade" ? "Note" : m.type === "date" ? "Date" : "Texte"}</p>
                                        <p className="text-[8px] text-slate-400">x:{m.x.toFixed(0)}% y:{m.y.toFixed(0)}%</p>
                                      </div>
                                      <button onClick={e => { e.stopPropagation(); deleteGradeMark(m.id); }}
                                        className="p-1 rounded-lg hover:bg-red-100 transition shrink-0" title="Supprimer">
                                        <Trash2 className="h-3 w-3 text-red-400" />
                                      </button>
                                    </div>
                                    {selectedGradeMarkId === m.id && (
                                      <div className="space-y-2 pt-1.5 border-t border-red-200">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[8px] text-slate-500 w-10 shrink-0 font-semibold">Texte</span>
                                          <input value={m.text}
                                            onChange={e => updateGradeMark(m.id, { text: e.target.value })}
                                            onFocus={e => e.target.select()}
                                            onClick={e => e.stopPropagation()}
                                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-[9px] focus:outline-none focus:border-red-400 bg-white font-bold"
                                          />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[8px] text-slate-500 w-10 shrink-0 font-semibold">Taille</span>
                                          <input type="range" min={1.5} max={10} step={0.1} value={m.fontSize}
                                            onChange={e => updateGradeMark(m.id, { fontSize: parseFloat(e.target.value) })}
                                            onClick={e => e.stopPropagation()}
                                            className="flex-1 accent-red-500 h-1.5" />
                                          <span className="text-[8px] font-black text-red-600 w-7 text-right">{m.fontSize.toFixed(1)}</span>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap">
                                          {TEACHER_COLORS.map(c => (
                                            <button key={c.value} onClick={e => { e.stopPropagation(); updateGradeMark(m.id, { color: c.value }); }}
                                              style={{ background: c.value }}
                                              className={`w-5 h-5 rounded-full border-2 transition ${m.color === c.value ? "border-slate-700 scale-110 ring-2 ring-offset-1 ring-slate-400" : "border-transparent hover:border-slate-300"}`}
                                              title={c.label} />
                                          ))}
                                        </div>
                                        <div className="grid grid-cols-2 gap-1">
                                          <div>
                                            <p className="text-[7px] text-slate-400 mb-0.5">X (%)</p>
                                            <input type="number" min={0} max={95} step={1} value={Math.round(m.x)}
                                              onChange={e => updateGradeMark(m.id, { x: parseFloat(e.target.value) })}
                                              onClick={e => e.stopPropagation()}
                                              className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-red-400 bg-white" />
                                          </div>
                                          <div>
                                            <p className="text-[7px] text-slate-400 mb-0.5">Y (%)</p>
                                            <input type="number" min={0} max={95} step={1} value={Math.round(m.y)}
                                              onChange={e => updateGradeMark(m.id, { y: parseFloat(e.target.value) })}
                                              onClick={e => e.stopPropagation()}
                                              className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:border-red-400 bg-white" />
                                          </div>
                                        </div>
                                        <p className="text-[8px] text-red-500 font-medium flex items-center gap-1">
                                          <Move className="h-2.5 w-2.5" /> Mode Déplacer → glissez sur la page
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* All pages summary */}
                            {activeGradeMarks.length > 0 && (
                              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                                <span className="text-[8px] text-slate-400">Total toutes pages: {activeGradeMarks.length}</span>
                                <button onClick={() => setActiveGradeMarks([])}
                                  className="text-[8px] font-semibold text-red-400 hover:text-red-600 transition">
                                  🗑 Tout effacer
                                </button>
                              </div>
                            )}

                            {activeGradeMarks.filter(m => m.pageIndex === previewPage).length === 0 && (
                              <div className="py-5 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                <Star className="h-6 w-6 text-slate-200 mx-auto mb-1.5" />
                                <p className="text-[9px] text-slate-400 font-semibold">Aucune annotation sur P.{previewPage + 1}</p>
                                <p className="text-[8px] text-slate-300 mt-0.5">Cliquez un bouton ci-dessus pour ajouter</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Editable answers panel — always visible when questions exist */}
                    {questions.length > 0 && (() => {
                      const activeAnswersForPanel = batchMode && currentBatch ? currentBatch.answers : answers;
                      const answeredCount = Object.values(activeAnswersForPanel).filter(Boolean).length;
                      const totalCount    = questions.length;

                      // Per-page answer counters
                      const pageNums = [...new Set(questions.map(q => q.pageIndex))].sort((a, b) => a - b);
                      const pageCounters = pageNums.map(pg => {
                        const pgQs  = questions.filter(q => q.pageIndex === pg);
                        const pgAns = pgQs.filter(q => activeAnswersForPanel[q.id]).length;
                        return { pg, total: pgQs.length, answered: pgAns };
                      });

                      return (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          {/* Header */}
                          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1.5">
                            <Edit3 className="h-3 w-3 text-indigo-500" />
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex-1">
                              RÉPONSES
                              <span className={`ml-1 font-normal ${answeredCount === totalCount ? "text-emerald-500" : "text-slate-400"}`}>
                                ({answeredCount}/{totalCount})
                              </span>
                            </p>
                            {/* Per-page badges */}
                            <div className="flex gap-0.5 flex-wrap">
                              {pageCounters.map(({ pg, total, answered }) => (
                                <button
                                  key={pg}
                                  onClick={() => setPreviewPage(pg)}
                                  title={`Page ${pg + 1}: ${answered}/${total} réponses`}
                                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded transition ${
                                    pg === previewPage
                                      ? "bg-indigo-500 text-white"
                                      : answered === total
                                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                      : answered > 0
                                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                  }`}>
                                  P.{pg + 1} ({answered}/{total})
                                </button>
                              ))}
                            </div>
                            {/* Generate / Régénérer button */}
                            <button
                              onClick={() => generateAllAnswers(true)}
                              disabled={isGenerating}
                              title={answeredCount > 0 ? "Régénérer toutes les réponses" : "Générer les réponses avec Gemini"}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition ${
                                isGenerating
                                  ? "bg-indigo-100 text-indigo-500 cursor-wait"
                                  : answeredCount > 0
                                  ? "bg-amber-500 text-white hover:bg-amber-600"
                                  : "bg-indigo-500 text-white hover:bg-indigo-600"
                              }`}>
                              {isGenerating
                                ? <RefreshCw className="h-3 w-3 animate-spin" />
                                : answeredCount > 0
                                ? <RefreshCw className="h-3 w-3" />
                                : <Sparkles className="h-3 w-3" />}
                              {isGenerating ? "En cours…" : answeredCount > 0 ? "Régénérer" : "Générer"}
                            </button>
                          </div>

                          {/* Error */}
                          {genErr && (
                            <div className="mx-3 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                              <div className="flex items-start gap-1.5">
                                <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-[9px] font-medium text-red-600 flex-1 break-words">{genErr}</p>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <button onClick={() => setGenErr("")} className="text-[8px] text-red-400 underline">Fermer</button>
                                <button onClick={() => generateAllAnswers(true)} className="text-[8px] text-indigo-500 underline font-bold">Réessayer</button>
                              </div>
                            </div>
                          )}

                          {/* Progress / Spinner */}
                          {isGenerating && (
                            <div className="mx-3 mt-2 mb-1 p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                              <div className="flex items-center gap-2">
                                <RefreshCw className="h-3.5 w-3.5 text-indigo-500 animate-spin shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[9px] text-indigo-700 font-bold truncate">
                                    {genProgress || "Gemini rédige les réponses…"}
                                  </p>
                                  <p className="text-[8px] text-indigo-400">{totalCount} questions · niveau {criteriaLevel} · {activeProfile.name}</p>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div className="mt-1.5 bg-indigo-100 rounded-full h-1 overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                  style={{ width: `${totalCount > 0 ? (answeredCount / totalCount) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Questions list */}
                          <div key={refreshKey} className="p-3 space-y-2 max-h-72 overflow-y-auto">
                            {/* Empty state CTA */}
                            {!batchMode && answeredCount === 0 && !isGenerating && (
                              <div className="p-3 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl text-center space-y-2">
                                <div className="flex items-center justify-center gap-2">
                                  <Sparkles className="h-5 w-5 text-indigo-400" />
                                  <p className="text-xs font-black text-indigo-700">
                                    {totalCount} question{totalCount !== 1 ? "s" : ""} prête{totalCount !== 1 ? "s" : ""}
                                  </p>
                                </div>
                                <p className="text-[9px] text-indigo-500">
                                  Cliquez Générer pour que Gemini écrive les réponses automatiquement dans chaque case
                                </p>
                                <button
                                  onClick={() => generateAllAnswers(true)}
                                  disabled={isGenerating}
                                  className="w-full py-2.5 bg-indigo-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 hover:bg-indigo-600 transition">
                                  <Sparkles className="h-3.5 w-3.5" /> Générer avec Gemini
                                </button>
                              </div>
                            )}

                            {questions.map((q) => {
                              const val = batchMode && currentBatch
                                ? (currentBatch.answers[q.id] ?? "")
                                : (answers[q.id] ?? "");
                              const isCurrentPage = q.pageIndex === previewPage;
                              const statusIcon = isGenerating && !val ? "⏳" : val ? "✅" : "⚠️";
                              return (
                                <div
                                  key={q.id}
                                  className={`space-y-1 p-1.5 rounded-lg border transition-all duration-200 ${
                                    val
                                      ? "border-emerald-200 bg-emerald-50/40"
                                      : isCurrentPage
                                      ? "border-indigo-200 bg-indigo-50/30"
                                      : "border-slate-100 bg-slate-50"
                                  }`}
                                >
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => setPreviewPage(q.pageIndex)}
                                      className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 transition ${
                                        isCurrentPage
                                          ? "bg-indigo-500 text-white"
                                          : "bg-slate-200 text-slate-500 hover:bg-indigo-200"
                                      }`}>
                                      P.{q.pageIndex + 1}
                                    </button>
                                    <label className="text-[9px] font-bold flex-1 truncate cursor-default" title={q.text}>
                                      <span className={val ? "text-emerald-600" : "text-slate-400"}>
                                        {statusIcon} {q.text.substring(0, 30)}{q.text.length > 30 ? "…" : ""}
                                      </span>
                                    </label>
                                  </div>
                                  <div className="flex gap-1 items-start">
                                    <textarea
                                      value={val}
                                      onChange={e => {
                                        const v = e.target.value;
                                        if (batchMode && currentBatch) {
                                          setBatchStudents(prev => prev.map(b =>
                                            b.id === currentBatch.id
                                              ? { ...b, answers: { ...b.answers, [q.id]: v } }
                                              : b
                                          ));
                                        } else {
                                          setAnswers(prev => ({ ...prev, [q.id]: v }));
                                        }
                                      }}
                                      rows={val ? 3 : 2}
                                      className={`flex-1 border rounded-lg p-1.5 text-[10px] focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none font-medium transition ${
                                        val ? "border-emerald-200 bg-white" : "border-slate-200 bg-slate-50"
                                      }`}
                                      placeholder={isGenerating ? "Génération en cours…" : "Réponse IA (cliquer Générer) ou taper manuellement"}
                                    />
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <button
                                        title="Recentrer sur la page"
                                        onClick={() => {
                                          if (batchMode && currentBatch) {
                                            setBatchStudents(prev => prev.map(b =>
                                              b.id === currentBatch.id
                                                ? { ...b, offsets: { ...b.offsets, [q.id]: { x: 0, y: 0 } } }
                                                : b
                                            ));
                                          } else {
                                            setOffsets(prev => ({ ...prev, [q.id]: { x: 0, y: 0 } }));
                                          }
                                        }}
                                        className="px-1.5 py-1 bg-indigo-500 text-white rounded-lg text-[9px] font-bold hover:bg-indigo-600 transition shrink-0"
                                      >○</button>
                                      {val && (
                                        <button
                                          title="Effacer cette réponse"
                                          onClick={() => {
                                            if (batchMode && currentBatch) {
                                              setBatchStudents(prev => prev.map(b =>
                                                b.id === currentBatch.id
                                                  ? { ...b, answers: { ...b.answers, [q.id]: "" } }
                                                  : b
                                              ));
                                            } else {
                                              setAnswers(prev => ({ ...prev, [q.id]: "" }));
                                            }
                                          }}
                                          className="px-1.5 py-1 bg-red-50 border border-red-200 text-red-400 rounded-lg text-[9px] hover:bg-red-100 transition shrink-0"
                                        >✕</button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="px-3 py-1.5 border-t border-slate-100">
                            <p className="text-[8px] text-slate-300 font-medium">
                              Édition temps réel · ○ recentre · ✅ réponse présente · ⚠️ manquante
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex justify-between gap-3 pt-1">
                  <button onClick={() => setStep("grade")}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition">
                    <ChevronLeft className="h-4 w-4" /> Modifier
                  </button>
                  {batchMode ? (
                    <button onClick={printAllBatch} disabled={!batchStudents.some(b => b.isDone)}
                      className="flex items-center gap-2 px-7 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-black transition disabled:opacity-50">
                      <Printer className="h-4 w-4" /> Imprimer GROUPE ({batchStudents.filter(b => b.isDone).length} élèves)
                    </button>
                  ) : (
                    <button onClick={() => setStep("print")}
                      className="flex items-center gap-2 px-7 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-black transition">
                      <Printer className="h-4 w-4" /> Imprimer ({displayPages.length} page{displayPages.length > 1 ? "s" : ""})
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ══ STEP 6 — PRINT ══ */}
            {step === "print" && (
              <motion.div key="print" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="max-w-lg mx-auto space-y-5">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Impression finale</h2>
                  <p className="text-slate-500 text-sm">
                    {batchMode ? `${batchStudents.filter(b => b.isDone).length} élèves prêts` : `${activeProfile.name} — ${displayPages.length} page(s)`}
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-2">
                    {(batchMode ? [
                      ["Mode", "Groupe 👥"],
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
                      <div key={k} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{k}</p>
                        <p className="font-bold text-sm text-slate-800 mt-0.5 truncate">{v}</p>
                      </div>
                    ))}
                  </div>

                  {/* Effect toggles for print */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-2">Inclure dans l'impression</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { k: "showRatures" as const,  label: "Ratures"  },
                        { k: "showBlanco" as const,   label: "Blanco"   },
                        { k: "showSmudges" as const,  label: "Bavures"  },
                        { k: "showComments" as const, label: "Corrections" },
                        { k: "showGeometry" as const, label: "Géométrie" },
                        { k: "showPressure" as const, label: "Pression"  },
                      ].map(t => (
                        <button key={t.k} onClick={() => setActiveEffects(prev => ({ ...prev, [t.k]: !prev[t.k] }))}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition
                            ${activeEffects[t.k] ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-slate-400 border-slate-200"}`}>
                          {activeEffects[t.k] ? <CheckCircle className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                    <p className="font-bold text-sm text-emerald-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Prêt pour impression</p>
                    <p className="text-[10px] text-emerald-600">✓ Réponses manuscrites directement sur les pages</p>
                    {batchMode
                      ? <p className="text-[10px] text-emerald-600">✓ {batchStudents.filter(b => b.isDone).length} copies élèves uniques générées</p>
                      : <p className="text-[10px] text-emerald-600">✓ Écriture unique de {activeProfile.name}</p>}
                  </div>

                  <button onClick={() => {
                    if (batchMode) printAllBatch();
                    else printSingle(activeProfile, activeAnswers, activeOffsets, activeComments);
                  }}
                    className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xl shadow-2xl hover:bg-black hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3">
                    <Printer className="h-6 w-6" />
                    {batchMode ? `IMPRIMER ${batchStudents.filter(b => b.isDone).length} ÉLÈVES` : "IMPRIMER TOUTES LES PAGES"}
                  </button>

                  <div className="flex gap-2">
                    <button onClick={() => setStep("preview")}
                      className="flex-1 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-xs hover:bg-slate-50 transition flex items-center justify-center gap-1">
                      <ChevronLeft className="h-3.5 w-3.5" /> Aperçu
                    </button>
                    <button onClick={() => { setStep("students"); setVariantSeed(s => (s % 10) + 1); }}
                      className="flex-1 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-xs hover:bg-slate-50 transition flex items-center justify-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Autre élève
                    </button>
                    <button onClick={() => { setStep("import"); setEvalPages([]); setQuestions([]); setAnswers({}); setComments([]); setShapes([]); setBatchStudents([]); setArtImages({}); }}
                      className="flex-1 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-xs hover:bg-slate-50 transition flex items-center justify-center gap-1">
                      <RotateCcw className="h-3.5 w-3.5" /> Nouvelle éval
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* ══ STUDENT PROFILE QUICK-EDIT MODAL ══ */}
      {editProfileTarget && (
        <StudentProfileModal
          profile={editProfileTarget}
          onClose={() => setEditProfileTarget(null)}
          onSave={async (updated) => {
            // Save to DB and update lists
            await saveProfile(updated);
            // If this was the active profile, update it too
            if (activeProfile.name === editProfileTarget.name) {
              setActiveProfile({ ...updated, hwImage: updated.hwImageBase64 || updated.hwImage || null });
            }
            // Update in batch students if present
            setBatchStudents(prev => prev.map(b =>
              b.profile.name === editProfileTarget.name ? { ...b, profile: { ...updated, hwImage: updated.hwImageBase64 || updated.hwImage || null } } : b
            ));
            setEditProfileTarget(null);
          }}
          effects={effects}
          variantSeed={variantSeed}
          isAnalyzing={isAnalyzing}
          analyzeHandwriting={analyzeHandwriting}
        />
      )}
    </div>
  );
}
