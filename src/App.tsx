/**
 * @license SPDX-License-Identifier: Apache-2.0
 * nanobanana PRO v3 — Full realistic student worksheet engine
 * Features:
 *  1. Answers directly overlaid on eval pages in student handwriting
 *  2. All pages printed together (window.print + print-root)
 *  3. Bad-writing realism: ratures, blanco, smudges, pressure, wobble
 *  4. Geometry/drawing auto-tool: ruler lines, compass circles, protractor arcs
 *  5. Preview: teacher comments (red, auto or manual) + live effect toggles
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Sparkles, RotateCcw, CheckCircle, AlertCircle,
  Edit3, RefreshCw, User, Users, Plus, Trash2, ChevronLeft, ChevronRight,
  Search, Save, Printer, Move, BookOpen, Zap, Sliders, Eye,
  PenTool, Triangle, Circle, Minus, MessageSquare, X, Settings,
  ToggleLeft, ToggleRight, Eraser,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRELOADED_TEMPLATES, EXAM_CRITERIA_LEVELS } from "./templates";
import { CriteriaLevel } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface HandwritingFingerprint {
  suggestedFont: string;
  suggestedColor: string;
  suggestedSize: number;
  letterSpacingEm: number;
  wordSpacingPx: number;
  lineHeightMultiplier: number;
  suggestedRotation: number;
  baselineWobbleAmp: number;
  baselineWobbleFreq: number;
  letterRotVariance: number;
  letterYVariance: number;
  letterXVariance: number;
  penThickness: number;
  inkOpacityMin: number;
  inkOpacityMax: number;
  inkDrySkipRate: number;
  inkBleedRadius: number;
  messinessIntensity: number;
  letterSizeVariance: number;
  letterCaseChaos: boolean;
  enableUnreadableLetters: boolean;
  inferredRaturesRate: number;
  inferredBlancoRate: number;
  inferredSmudgeFreq: number;
  letterShapeFingerprint: number[];
  analysisDescription: string;
  confidenceScore: number;
}

interface StudentProfile {
  _id?: string;
  name: string;
  hwImage: string | null;
  hwImageBase64?: string;
  hwImageName: string;
  fontKey: string;
  inkColor: string;
  fontSize: number;
  rotationAngle: number;
  skewAngle: number;
  wordDrift: number;
  letterSpacing: number;
  messinessIntensity: number;
  enableUnreadableLetters: boolean;
  letterCaseChaos: boolean;
  inkDrySkipping: boolean;
  penThickness: number;
  penType: "ballpoint" | "gel" | "felt" | "pencil";
  // Realism effects
  enableRatures: boolean;
  raturesRate: number;
  enableBlanco: boolean;
  blancoRate: number;
  enableSmudges: boolean;
  enablePressureVar: boolean;
  enableLineWobble: boolean;
  lineWobbleAmp: number;
  // Fingerprint
  fingerprint?: HandwritingFingerprint;
  analysisDescription?: string;
  confidenceScore?: number;
}

interface DetectedQuestion {
  id: string;
  text: string;
  pageIndex: number;
  x: number;
  y: number;
  maxWidth?: number;
}

interface EvalPage {
  base64: string;
  pageNum: number;
}

/** Teacher comment attached to a question answer */
interface TeacherComment {
  qId: string;
  text: string;
  symbol?: string;
  position: "above" | "right" | "below" | "margin";
  style?: "check" | "cross" | "circle" | "underline" | "arrow";
  /** offset from default position in px */
  ox: number;
  oy: number;
}

/** Geometry shape drawn on a page */
interface GeometryShape {
  id: string;
  pageIndex: number;
  type: "line" | "circle" | "arc" | "rectangle" | "triangle" | "angle";
  // All coords in % of page dimensions
  x1: number; y1: number;
  x2?: number; y2?: number;
  x3?: number; y3?: number;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  label?: string;
  strokeColor?: string;
  strokeWidth?: number;
  pencilNoise?: number; // 0=ruler-perfect, 1=very wobbly pencil
}

/** Per-page live effect overrides (for preview toggles) */
interface PageEffectOverrides {
  showRatures: boolean;
  showBlanco: boolean;
  showSmudges: boolean;
  showPressure: boolean;
  showWobble: boolean;
  showComments: boolean;
  showGeometry: boolean;
}

type WorkflowStep = "import" | "students" | "grade" | "solve" | "preview" | "print";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const HANDWRITING_FONTS = [
  { key: "homemade-apple",  label: "Écolier Naturel",  family: "Homemade Apple",  cssVar: "--font-homemade"   },
  { key: "marck-script",    label: "Cursive Feutre",   family: "Marck Script",    cssVar: "--font-marck"     },
  { key: "parisienne",      label: "Cursive Fine",     family: "Parisienne",      cssVar: "--font-parisienne" },
  { key: "allura",          label: "Cursive Fluide",   family: "Allura",          cssVar: "--font-allura"    },
  { key: "la-belle-aurore", label: "Cursive Stylée",   family: "La Belle Aurore", cssVar: "--font-la-belle"  },
  { key: "bad-script",      label: "Écriture Plume",   family: "Bad Script",      cssVar: "--font-badscript" },
];
const INK_COLORS = [
  { label: "Bleu stylo",     value: "#1d3278" },
  { label: "Bleu royal",     value: "#1e40af" },
  { label: "Bleu marine",    value: "#172554" },
  { label: "Noir encre",     value: "#1c1c1e" },
  { label: "Noir profond",   value: "#0a0a0a" },
  { label: "Rouge bordeaux", value: "#be0000" },
  { label: "Vert forêt",    value: "#0a7a2a" },
  { label: "Violet",         value: "#6b21a8" },
  { label: "Bleu-vert",      value: "#0e7490" },
  { label: "Brun sépia",     value: "#78350f" },
  { label: "Gris foncé",     value: "#374151" },
  { label: "Indigo",         value: "#3730a3" },
];
const FONT_KEY_MAP: Record<string, string> = {
  "homemade apple": "homemade-apple", "marck script": "marck-script",
  parisienne: "parisienne", allura: "allura",
  "la belle aurore": "la-belle-aurore", "bad script": "bad-script",
};
const COLOR_MAP: Record<string, string> = {
  blue: "#1d3278", black: "#1c1c1e", red: "#be0000", green: "#0a7a2a",
};

function getFontVar(key: string) { return HANDWRITING_FONTS.find(f => f.key === key)?.cssVar ?? "--font-homemade"; }
function getFontFamily(key: string) { return HANDWRITING_FONTS.find(f => f.key === key)?.family ?? "Homemade Apple"; }

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

const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: "import",   label: "Importer"  },
  { key: "students", label: "Élève"     },
  { key: "grade",    label: "Note"      },
  { key: "solve",    label: "Résoudre"  },
  { key: "preview",  label: "Aperçu"    },
  { key: "print",    label: "Imprimer"  },
];

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
// PENCIL SVG FILTER
// ─────────────────────────────────────────────────────────────────────────────
function PencilDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`pencil-${id}`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9 0.4" numOctaves="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.35" xChannelSelector="R" yChannelSelector="G" result="displaced" />
        <feGaussianBlur in="displaced" stdDeviation="0.08" />
      </filter>
      <filter id={`pencil-rough-${id}`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.7 0.3" numOctaves="5" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.7" xChannelSelector="R" yChannelSelector="G" result="displaced" />
        <feGaussianBlur in="displaced" stdDeviation="0.12" />
      </filter>
      <filter id={`ink-blur-${id}`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.12" />
      </filter>
      <filter id={`smudge-${id}`} x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85 0.55" numOctaves="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.45" />
      </filter>
    </defs>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY SVG RENDERER
// Draws ruler lines, compass circles, protractor arcs with pencil realism
// ─────────────────────────────────────────────────────────────────────────────
function GeometryLayer({ shapes, pageIndex, filterId }: {
  shapes: GeometryShape[];
  pageIndex: number;
  filterId: string;
}) {
  const pageShapes = shapes.filter(s => s.pageIndex === pageIndex);
  if (!pageShapes.length) return null;

  return (
    <>
      {pageShapes.map(shape => {
        const pencil = `url(#pencil-${filterId})`;
        const rough  = `url(#pencil-rough-${filterId})`;
        const strokeCol = shape.strokeColor || "#2d2d3a";
        const sw   = shape.strokeWidth ?? 0.35;
        const noisy = (shape.pencilNoise ?? 0.5) > 0.6 ? rough : pencil;
        const opacity = 0.82 + (shape.pencilNoise ?? 0.5) * 0.08;

        if (shape.type === "line" && shape.x2 !== undefined && shape.y2 !== undefined) {
          // Ruler line — draw with slight wobble if pencilNoise high
          const n = shape.pencilNoise ?? 0.5;
          const midX = (shape.x1 + shape.x2) / 2 + (n - 0.5) * 0.4;
          const midY = (shape.y1 + shape.y2) / 2 + (n - 0.5) * 0.4;
          return (
            <g key={shape.id} style={{ filter: noisy }} opacity={opacity}>
              <polyline
                points={`${shape.x1},${shape.y1} ${midX},${midY} ${shape.x2},${shape.y2}`}
                fill="none" stroke={strokeCol} strokeWidth={sw} strokeLinecap="round"
              />
              {/* Ruler tick marks */}
              {Array.from({ length: 6 }, (_, i) => {
                const t = (i + 1) / 7;
                const tx = shape.x1 + (shape.x2! - shape.x1) * t;
                const ty = shape.y1 + (shape.y2! - shape.y1) * t;
                const dx = -(shape.y2! - shape.y1) / Math.hypot(shape.x2! - shape.x1, shape.y2! - shape.y1);
                const dy = (shape.x2! - shape.x1) / Math.hypot(shape.x2! - shape.x1, shape.y2! - shape.y1);
                const tickLen = i === 2 ? 0.5 : 0.3;
                return (
                  <line key={i}
                    x1={tx + dx * tickLen} y1={ty + dy * tickLen}
                    x2={tx - dx * tickLen} y2={ty - dy * tickLen}
                    stroke={strokeCol} strokeWidth={sw * 0.6} strokeLinecap="round"
                  />
                );
              })}
              {shape.label && (
                <text x={(shape.x1 + shape.x2) / 2} y={(shape.y1 + shape.y2) / 2 - 1}
                  fontSize="2" fill={strokeCol} textAnchor="middle"
                  fontFamily="var(--font-homemade)" opacity={0.9}
                >{shape.label}</text>
              )}
            </g>
          );
        }

        if (shape.type === "circle" && shape.radius) {
          const cx = shape.x1, cy = shape.y1, r = shape.radius;
          // Slightly imperfect circle — offset by noise
          const n = shape.pencilNoise ?? 0.3;
          const pointsCount = 48;
          const pts = Array.from({ length: pointsCount + 1 }, (_, i) => {
            const angle = (i / pointsCount) * 2 * Math.PI;
            const rr = r + Math.sin(angle * 7 + n * 10) * n * 0.3;
            return `${cx + Math.cos(angle) * rr},${cy + Math.sin(angle) * rr}`;
          }).join(" ");
          return (
            <g key={shape.id} style={{ filter: noisy }} opacity={opacity}>
              <polyline points={pts} fill="none" stroke={strokeCol} strokeWidth={sw} strokeLinecap="round" />
              {shape.label && (
                <text x={cx} y={cy - r - 0.8} fontSize="2" fill={strokeCol} textAnchor="middle"
                  fontFamily="var(--font-homemade)">{shape.label}</text>
              )}
              {/* Center dot */}
              <circle cx={cx} cy={cy} r="0.18" fill={strokeCol} opacity={0.7} />
            </g>
          );
        }

        if (shape.type === "arc" && shape.radius && shape.startAngle !== undefined && shape.endAngle !== undefined) {
          const cx = shape.x1, cy = shape.y1, r = shape.radius;
          const start = (shape.startAngle * Math.PI) / 180;
          const end   = (shape.endAngle   * Math.PI) / 180;
          const steps = 32;
          const pts = Array.from({ length: steps + 1 }, (_, i) => {
            const a = start + (end - start) * (i / steps);
            const n = (shape.pencilNoise ?? 0.3);
            const rr = r + Math.sin(a * 5 + n * 8) * n * 0.2;
            return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
          }).join(" ");
          return (
            <g key={shape.id} style={{ filter: noisy }} opacity={opacity}>
              <polyline points={pts} fill="none" stroke={strokeCol} strokeWidth={sw} strokeLinecap="round" />
              {/* Angle label */}
              {shape.label && (
                <text x={cx + Math.cos((start + end) / 2) * (r + 1.5)} y={cy + Math.sin((start + end) / 2) * (r + 1.5)}
                  fontSize="2" fill={strokeCol} textAnchor="middle" fontFamily="var(--font-homemade)">{shape.label}°</text>
              )}
              {/* Radii lines */}
              <line x1={cx} y1={cy} x2={cx + Math.cos(start) * r} y2={cy + Math.sin(start) * r}
                stroke={strokeCol} strokeWidth={sw * 0.7} strokeLinecap="round" />
              <line x1={cx} y1={cy} x2={cx + Math.cos(end) * r} y2={cy + Math.sin(end) * r}
                stroke={strokeCol} strokeWidth={sw * 0.7} strokeLinecap="round" />
            </g>
          );
        }

        if (shape.type === "rectangle" && shape.x2 !== undefined && shape.y2 !== undefined) {
          const w = shape.x2 - shape.x1, h = shape.y2 - shape.y1;
          const n = shape.pencilNoise ?? 0.4;
          const pts = [
            `${shape.x1 + n * 0.1},${shape.y1}`,
            `${shape.x2},${shape.y1 + n * 0.1}`,
            `${shape.x2 - n * 0.1},${shape.y2}`,
            `${shape.x1},${shape.y2 - n * 0.1}`,
            `${shape.x1 + n * 0.1},${shape.y1}`,
          ].join(" ");
          return (
            <g key={shape.id} style={{ filter: noisy }} opacity={opacity}>
              <polyline points={pts} fill="none" stroke={strokeCol} strokeWidth={sw} strokeLinecap="round" />
              {shape.label && (
                <text x={shape.x1 + w / 2} y={shape.y1 - 0.8} fontSize="2" fill={strokeCol} textAnchor="middle"
                  fontFamily="var(--font-homemade)">{shape.label}</text>
              )}
              {/* Right angle mark at corner */}
              <polyline points={`${shape.x1},${shape.y1 + 1.2} ${shape.x1 + 1.2},${shape.y1 + 1.2} ${shape.x1 + 1.2},${shape.y1}`}
                fill="none" stroke={strokeCol} strokeWidth={sw * 0.6} />
            </g>
          );
        }

        if (shape.type === "triangle" && shape.x2 !== undefined && shape.y2 !== undefined
          && shape.x3 !== undefined && shape.y3 !== undefined) {
          const n = shape.pencilNoise ?? 0.4;
          return (
            <g key={shape.id} style={{ filter: noisy }} opacity={opacity}>
              <polygon
                points={`${shape.x1 + n * 0.1},${shape.y1} ${shape.x2},${shape.y2 + n * 0.1} ${shape.x3},${shape.y3}`}
                fill="none" stroke={strokeCol} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
              />
              {shape.label && (
                <text x={(shape.x1 + shape.x2 + shape.x3) / 3} y={(shape.y1 + shape.y2 + shape.y3) / 3}
                  fontSize="2" fill={strokeCol} textAnchor="middle" fontFamily="var(--font-homemade)">{shape.label}</text>
              )}
            </g>
          );
        }

        return null;
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER COMMENT LAYER — red ink annotations
// ─────────────────────────────────────────────────────────────────────────────
function TeacherCommentLayer({ comments, questions, answers, filterId, draggable, onDrag }: {
  comments: TeacherComment[];
  questions: DetectedQuestion[];
  answers: Record<string, string>;
  filterId: string;
  draggable?: boolean;
  onDrag?: (qId: string, dx: number, dy: number) => void;
}) {
  const dragging = useRef<string | null>(null);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!draggable) return;
    const mv = (e: MouseEvent) => {
      if (!dragging.current || !onDrag) return;
      onDrag(dragging.current, e.clientX - last.current.x, e.clientY - last.current.y);
      last.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => { dragging.current = null; };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [draggable, onDrag]);

  return (
    <>
      {comments.map(c => {
        const q = questions.find(q => q.id === c.qId);
        if (!q || !answers[c.qId]) return null;

        // Base position relative to the question anchor
        let bx = q.x, by = q.y;
        if (c.position === "right")  { bx = q.x + (q.maxWidth ?? 78) + 2; by = q.y + 1; }
        if (c.position === "above")  { bx = q.x; by = Math.max(1, q.y - 3); }
        if (c.position === "below")  { bx = q.x; by = q.y + 4; }
        if (c.position === "margin") { bx = 1; by = q.y + 1; }

        const cx = bx + c.ox * 0.1;
        const cy = by + c.oy * 0.1;

        return (
          <g key={c.qId}
            style={{ cursor: draggable ? "move" : "default" }}
            onMouseDown={draggable ? (e) => {
              dragging.current = c.qId;
              last.current = { x: e.clientX, y: e.clientY };
              e.preventDefault();
            } : undefined}
          >
            {/* Underline / check / cross symbol */}
            {c.symbol === "✓" || c.style === "check" ? (
              <text x={cx - 2} y={cy} fontSize="3.5" fill="#cc0000"
                fontFamily="Arial" fontWeight="bold" opacity={0.9}
                style={{ filter: `url(#ink-blur-${filterId})` }}>✓</text>
            ) : c.symbol === "✗" || c.style === "cross" ? (
              <text x={cx - 2} y={cy} fontSize="3.5" fill="#cc0000"
                fontFamily="Arial" fontWeight="bold" opacity={0.9}
                style={{ filter: `url(#ink-blur-${filterId})` }}>✗</text>
            ) : null}

            {/* Circle around (for "circle" style) */}
            {c.style === "circle" && (
              <ellipse cx={cx + 5} cy={cy - 1} rx="6" ry="2.5"
                fill="none" stroke="#cc0000" strokeWidth="0.4"
                opacity={0.7} style={{ filter: `url(#ink-blur-${filterId})` }} />
            )}

            {/* Arrow (pointing at answer) */}
            {c.style === "arrow" && (
              <line x1={cx} y1={cy - 1} x2={q.x + 3} y2={q.y + 1}
                stroke="#cc0000" strokeWidth="0.35" strokeLinecap="round"
                markerEnd="url(#arrowhead)" opacity={0.8} />
            )}

            {/* Main comment text — red, slightly slanted, teacher handwriting */}
            {c.text && (
              <text
                x={cx}
                y={cy}
                fontSize="2.4"
                fill="#cc0000"
                fontFamily="var(--font-homemade)"
                transform={`rotate(-1.5,${cx},${cy})`}
                opacity={0.92}
                style={{ filter: `url(#ink-blur-${filterId})` }}
              >
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
// PAGE REALISM SVG — ratures, blanco, smudges
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
  const bleedR = fp?.inkBleedRadius ?? 0.15;

  return (
    <>
      {pageQ.map(q => {
        const ans = answers[q.id] ?? "";
        if (!ans) return null;
        const words = ans.split(/\s+/).filter(Boolean);
        const inkCol = profile.inkColor;
        return (
          <React.Fragment key={q.id}>
            {/* Ratures */}
            {raturesRate > 0 && words.map((_, wi) => {
              const rs = sSeed(profile.name + q.id + "rature", wi * 37 + variantSeed);
              if (rs <= 1 - raturesRate * 3) return null;
              const col = Math.floor(wi / 6), row = wi % 6;
              const rx = q.x + row * 5 + (rs * 12) % 8;
              const ry = q.y + col * 2.4 + 1.1;
              const rw = 3.5 + rs * 7;
              const j1 = (sSeed(profile.name, wi + "j1") - 0.5) * 0.35;
              const j2 = (sSeed(profile.name, wi + "j2") - 0.5) * 0.25;
              return (
                <React.Fragment key={`rat-${wi}`}>
                  <line x1={rx} y1={ry + j1} x2={rx + rw} y2={ry + 0.18 + j1}
                    stroke={inkCol} strokeWidth={rs > 0.75 ? "0.32" : "0.24"} strokeLinecap="round"
                    opacity={0.88} style={{ filter: `url(#ink-blur-${filterId})` }} />
                  {rs > 0.87 && (
                    <line x1={rx - 0.4} y1={ry + 0.38 + j2} x2={rx + rw + 0.4} y2={ry + 0.55 + j2}
                      stroke={inkCol} strokeWidth="0.19" strokeLinecap="round" opacity={0.65} />
                  )}
                  {rs > 0.92 && (
                    <circle cx={rx - 0.3} cy={ry + 0.1} r="0.28"
                      fill={inkCol} opacity={0.55} style={{ filter: `url(#ink-blur-${filterId})` }} />
                  )}
                </React.Fragment>
              );
            })}
            {/* Blanco */}
            {blancoRate > 0 && words.map((_, wi) => {
              const bs = sSeed(profile.name + q.id + "blanco", wi * 53 + variantSeed + 7);
              if (bs <= 1 - blancoRate * 2.5) return null;
              const col = Math.floor(wi / 6), row = wi % 6;
              const bx = q.x + row * 5 + (bs * 10) % 6;
              const by = q.y + col * 2.4 - 0.15;
              const bw = 4.5 + bs * 8, bh = 1.65 + bs * 0.45;
              const tilt = (sSeed(profile.name, wi + "tilt") - 0.5) * 2.5;
              const cx = bx + bw / 2, cy = by + bh / 2;
              return (
                <React.Fragment key={`blanco-${wi}`}>
                  <rect x={bx} y={by} width={bw} height={bh} fill="#f3eedd" opacity={0.96} rx="0.25"
                    transform={`rotate(${tilt},${cx},${cy})`} />
                  <rect x={bx + 0.15} y={by + 0.1} width={bw - 0.3} height={bh * 0.45}
                    fill="#f8f5ec" opacity={0.55} rx="0.15" transform={`rotate(${tilt},${cx},${cy})`} />
                  <rect x={bx} y={by + bh - 0.28} width={bw} height="0.28"
                    fill="#d4c9b0" opacity={0.4} rx="0.1" transform={`rotate(${tilt},${cx},${cy})`} />
                </React.Fragment>
              );
            })}
            {/* Smudges */}
            {smudgeFreq > 0 && (() => {
              const smS = sSeed(profile.name + q.id + "smudge", variantSeed + 99);
              if (smS > (1 - smudgeFreq)) return null;
              const smS2 = sSeed(profile.name + q.id + "smudge2", variantSeed + 77);
              const sx = q.x + smS * 38, sy = q.y + 0.8 + smS2 * 2;
              const r = 0.25 + smS * 0.55, ang = smS * 40 - 20;
              return (
                <>
                  <ellipse cx={sx} cy={sy} rx={r * 2.5} ry={r * 0.55} fill={inkCol}
                    opacity={0.07 + smS * 0.05} transform={`rotate(${ang},${sx},${sy})`}
                    style={{ filter: `url(#smudge-${filterId})` }} />
                  {smS > 0.5 && (
                    <ellipse cx={sx + r * 1.8} cy={sy + 0.3} rx={r * 0.9} ry={r * 0.3}
                      fill={inkCol} opacity={0.05} transform={`rotate(${ang + 15},${sx + r * 1.8},${sy + 0.3})`}
                      style={{ filter: `url(#smudge-${filterId})` }} />
                  )}
                </>
              );
            })()}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDWRITTEN TEXT — deep fingerprint + deterministic deformations
// ─────────────────────────────────────────────────────────────────────────────
function HandwrittenText({ text, qId, profile, variantSeed, effects }: {
  text: string; qId: string; profile: StudentProfile; variantSeed: number;
  effects: PageEffectOverrides;
}) {
  if (!text) return null;
  const fp = profile.fingerprint;
  const useFP = !!fp && (fp.confidenceScore ?? 0) >= 55;

  const baseSeed  = sSeed(profile.name + variantSeed, qId);
  const fontSize  = useFP ? Math.max(11, fp.suggestedSize + (baseSeed * 1.5 - 0.75))
                           : Math.max(11, profile.fontSize + (baseSeed * 2 - 1));
  const slant     = useFP ? fp.suggestedRotation : profile.skewAngle;
  const inkCol    = profile.inkColor;
  const fontKey   = profile.fontKey;
  const wobbleAmp = effects.showWobble ? (useFP ? fp.baselineWobbleAmp : profile.lineWobbleAmp) : 0;
  const wobbleFreq = useFP ? fp.baselineWobbleFreq : 2.1;
  const opacMin   = effects.showPressure ? (useFP ? fp.inkOpacityMin : 0.72) : 1;
  const opacMax   = effects.showPressure ? (useFP ? fp.inkOpacityMax : 1.0)  : 1;
  const dryRate   = useFP ? fp.inkDrySkipRate : 0.06;
  const lRotVar   = useFP ? fp.letterRotVariance  : profile.messinessIntensity * 1.8;
  const lYVar     = useFP ? fp.letterYVariance    : profile.messinessIntensity * 0.6;
  const lXVar     = useFP ? fp.letterXVariance    : profile.messinessIntensity * 0.2;
  const lSzVar    = useFP ? fp.letterSizeVariance : profile.messinessIntensity * 0.35;
  const lSpEm     = useFP ? fp.letterSpacingEm    : profile.letterSpacing / 17;
  const wSpPx     = useFP ? fp.wordSpacingPx      : 5 + profile.messinessIntensity;
  const lHeight   = useFP ? fp.lineHeightMultiplier : 1.6;
  const caseChaos = useFP ? fp.letterCaseChaos   : profile.letterCaseChaos;
  const unread    = useFP ? fp.enableUnreadableLetters : profile.enableUnreadableLetters;
  const messy     = useFP ? fp.messinessIntensity : profile.messinessIntensity;

  const lines = text.split("\n");
  return (
    <div className="select-none" style={{ lineHeight: `${fontSize * lHeight}px` }}>
      {lines.map((line, li) => {
        const words = line.split(/\s+/).filter(Boolean);
        const fpWobble = fp ? fpOff(fp.letterShapeFingerprint, li + 8) * 0.6 : 0;
        const lineWobble = wobbleAmp > 0
          ? Math.sin(li * wobbleFreq + baseSeed * 6) * wobbleAmp + fpWobble : 0;
        return (
          <div key={li} className="flex flex-wrap" style={{ transform: `translateY(${lineWobble}px)` }}>
            {words.map((word, wi) => {
              const wSeed = sSeed(profile.name + word + li, wi + variantSeed * 3);
              const fpWordY = fp ? fpOff(fp.letterShapeFingerprint, wi % 16) * 0.8 : 0;
              const wordY   = (wSeed - 0.5) * 2 * Math.min(messy, 5) * 0.35 + fpWordY;
              const wordRot = (wSeed * 0.6 - 0.3) * Math.min(messy, 5) * 0.12;
              const wordMR  = Math.max(2, wSpPx + (wSeed - 0.5) * 3);
              const letters = word.split("").map((ch, ci) => {
                const cs = sSeed(profile.name + ch + wi, ci + li * 100 + variantSeed);
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
                const lSkew = slant + (csFp - 0.5) * lRotVar * 0.7 + fpLean;
                const lRot  = (csFp - 0.5) * lRotVar * 0.5;
                const lSize = (csFp * 0.7 - 0.35) * lSzVar * 2;
                let opacity = 1;
                if (effects.showPressure && profile.enablePressureVar) {
                  const pressureCycle = Math.sin(ci * 0.8 + baseSeed * 4) * 0.5 + 0.5;
                  const fpP = fp ? fp.letterShapeFingerprint[(ci + 4) % 16] : 0.5;
                  opacity = opacMin + (pressureCycle * 0.5 + fpP * 0.3 + csFp * 0.2) * (opacMax - opacMin);
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
                    textShadow: opacity > 0.85 ? `0.15px 0.2px 0.3px rgba(0,0,0,0.22)` : `0.05px 0.08px 0.12px rgba(0,0,0,0.12)`,
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
// DRAGGABLE ANSWER
// ─────────────────────────────────────────────────────────────────────────────
function DraggableAnswer({ question, answer, profile, variantSeed, editMode, offset, onDelta, effects }: {
  question: DetectedQuestion; answer: string; profile: StudentProfile; variantSeed: number;
  editMode: boolean; offset: { x: number; y: number }; onDelta: (id: string, dx: number, dy: number) => void;
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
      position: "absolute", left: `${question.x}%`, top: `${question.y}%`,
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      cursor: editMode ? "move" : "default", maxWidth: `${question.maxWidth ?? 78}%`,
      zIndex: 5, userSelect: "none",
    }}>
      {editMode && (
        <div style={{ position: "absolute", top: -14, left: 0, fontSize: 8, background: "#3b82f6",
          color: "#fff", padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none" }}>
          ✥ {question.id}
        </div>
      )}
      <HandwrittenText text={answer} qId={question.id} profile={profile} variantSeed={variantSeed} effects={effects} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL PAGE LAYER — image + SVG (realism + geometry + comments) + text
// ─────────────────────────────────────────────────────────────────────────────
function PageLayer({ page, pi, questions, answers, profile, variantSeed,
  editMode, offsets, onOffsetChange, effects, shapes, comments, onCommentDrag, forPrint }: {
  page: EvalPage; pi: number;
  questions: DetectedQuestion[]; answers: Record<string, string>;
  profile: StudentProfile; variantSeed: number;
  editMode: boolean; offsets: Record<string, { x: number; y: number }>;
  onOffsetChange: (id: string, dx: number, dy: number) => void;
  effects: PageEffectOverrides;
  shapes: GeometryShape[]; comments: TeacherComment[];
  onCommentDrag?: (qId: string, dx: number, dy: number) => void;
  forPrint?: boolean;
}) {
  const filterId = `p${pi}`;
  const pageQ = questions.filter(q => q.pageIndex === pi);

  return (
    <div className="relative bg-white" style={{
      width: "100%", aspectRatio: "210/297", overflow: "hidden",
      pageBreakAfter: forPrint ? "always" : "auto",
    }}>
      {page.base64 && (
        <img src={page.base64} alt={`Page ${pi + 1}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }}
          draggable={false} />
      )}

      {/* SVG layer: all vector effects */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: editMode ? "none" : "auto", overflow: "visible" }}
        viewBox="0 0 100 141.4" preserveAspectRatio="none">
        <PencilDefs id={filterId} />
        <defs>
          <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill="#cc0000" />
          </marker>
        </defs>

        {/* Geometry shapes (pencil-drawn) */}
        {effects.showGeometry && (
          <GeometryLayer shapes={shapes} pageIndex={pi} filterId={filterId} />
        )}

        {/* Realism: ratures, blanco, smudges */}
        <PageRealism pi={pi} pageQ={pageQ} answers={answers} profile={profile}
          variantSeed={variantSeed} effects={effects} filterId={filterId} />

        {/* Teacher comments (red) */}
        {effects.showComments && (
          <TeacherCommentLayer comments={comments.filter(c => questions.find(q => q.id === c.qId)?.pageIndex === pi)}
            questions={questions} answers={answers} filterId={filterId}
            draggable={!forPrint && editMode} onDrag={onCommentDrag} />
        )}
      </svg>

      {/* Text overlays */}
      {pageQ.map(q => {
        const ans = answers[q.id] ?? "";
        if (!ans) return null;
        const off = offsets[q.id] ?? { x: 0, y: 0 };
        return (
          <DraggableAnswer key={q.id} question={q} answer={ans} profile={profile}
            variantSeed={variantSeed} editMode={editMode} offset={off}
            onDelta={onOffsetChange} effects={effects} />
        );
      })}

      {editMode && !forPrint && (
        <div style={{ position: "absolute", inset: 0, border: "2px dashed #3b82f6",
          pointerEvents: "none", borderRadius: 2 }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EFFECT TOGGLES — live per-effect switches in preview sidebar
// ─────────────────────────────────────────────────────────────────────────────
function EffectToggles({ effects, onChange }: {
  effects: PageEffectOverrides;
  onChange: (k: keyof PageEffectOverrides, v: boolean) => void;
}) {
  const toggles: { key: keyof PageEffectOverrides; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "showRatures",  label: "Ratures",   icon: <Eraser className="h-3 w-3" />,       color: "bg-red-100 border-red-300"    },
    { key: "showBlanco",   label: "Blanco",    icon: <X className="h-3 w-3" />,              color: "bg-orange-100 border-orange-300" },
    { key: "showSmudges",  label: "Bavures",   icon: <Zap className="h-3 w-3" />,            color: "bg-blue-100 border-blue-300"  },
    { key: "showPressure", label: "Pression",  icon: <PenTool className="h-3 w-3" />,        color: "bg-purple-100 border-purple-300" },
    { key: "showWobble",   label: "Tremblement",icon: <Minus className="h-3 w-3" />,         color: "bg-green-100 border-green-300" },
    { key: "showComments", label: "Corrections",icon: <MessageSquare className="h-3 w-3" />, color: "bg-rose-100 border-rose-300"  },
    { key: "showGeometry", label: "Géométrie", icon: <Triangle className="h-3 w-3" />,       color: "bg-yellow-100 border-yellow-300" },
  ];
  return (
    <div className="space-y-1.5">
      {toggles.map(t => (
        <button key={t.key} onClick={() => onChange(t.key, !effects[t.key])}
          className={`w-full flex items-center gap-2 p-2 rounded-lg border-2 transition text-left ${effects[t.key] ? t.color + " border-current" : "border-black/10 bg-white opacity-50"}`}>
          <div className={`w-5 h-5 rounded border border-black/20 flex items-center justify-center ${effects[t.key] ? "bg-black" : "bg-white"}`}>
            {effects[t.key] ? <ToggleRight className="h-3 w-3 text-yellow-400" /> : <ToggleLeft className="h-3 w-3 text-black/30" />}
          </div>
          {t.icon}
          <span className="text-[10px] font-black">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY BUILDER — add shapes interactively
// ─────────────────────────────────────────────────────────────────────────────
const GEO_PRESETS: { label: string; icon: React.ReactNode; shape: Omit<GeometryShape, "id" | "pageIndex"> }[] = [
  { label: "Segment (règle)", icon: <Minus className="h-3.5 w-3.5" />,
    shape: { type: "line", x1: 10, y1: 30, x2: 60, y2: 30, label: "6 cm", pencilNoise: 0.2 } },
  { label: "Cercle (compas)", icon: <Circle className="h-3.5 w-3.5" />,
    shape: { type: "circle", x1: 50, y1: 60, radius: 15, label: "r = 3cm", pencilNoise: 0.3 } },
  { label: "Arc / Angle", icon: <PenTool className="h-3.5 w-3.5" />,
    shape: { type: "arc", x1: 50, y1: 80, radius: 10, startAngle: 0, endAngle: 60, label: "60", pencilNoise: 0.3 } },
  { label: "Rectangle", icon: <Settings className="h-3.5 w-3.5" />,
    shape: { type: "rectangle", x1: 15, y1: 40, x2: 55, y2: 65, label: "ABCD", pencilNoise: 0.25 } },
  { label: "Triangle", icon: <Triangle className="h-3.5 w-3.5" />,
    shape: { type: "triangle", x1: 30, y1: 30, x2: 10, y2: 70, x3: 60, y3: 70, label: "ABC", pencilNoise: 0.3 } },
];

function GeometryBuilder({ pageIndex, onAdd }: {
  pageIndex: number;
  onAdd: (shape: GeometryShape) => void;
}) {
  const [noise, setNoise] = useState(0.3);
  const [strokeColor, setStrokeColor] = useState("#2d2d3a");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-black/50">CRAYON :</span>
        <input type="range" min={0} max={1} step={0.05} value={noise}
          onChange={e => setNoise(parseFloat(e.target.value))}
          className="flex-1 accent-black h-1.5" />
        <span className="text-[9px] font-black w-12">{noise < 0.2 ? "Règle" : noise < 0.5 ? "Normal" : "Brouillon"}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-black/50">COULEUR :</span>
        {["#2d2d3a","#6b4226","#1d3278"].map(c => (
          <button key={c} onClick={() => setStrokeColor(c)}
            className={`w-5 h-5 rounded-full border-2 ${strokeColor === c ? "border-black scale-110" : "border-transparent"}`}
            style={{ background: c }} />
        ))}
        <label className="w-5 h-5 rounded-full border-2 border-black cursor-pointer relative overflow-hidden">
          <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
          <div className="w-full h-full rounded-full" style={{ background: strokeColor }} />
        </label>
      </div>
      <div className="space-y-1">
        {GEO_PRESETS.map(p => (
          <button key={p.label} onClick={() => onAdd({
            ...p.shape, id: `geo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            pageIndex, pencilNoise: noise, strokeColor,
          })}
            className="w-full flex items-center gap-2 px-2.5 py-2 border-2 border-black/15 rounded-lg hover:border-black hover:bg-yellow-50 transition text-left">
            {p.icon}
            <span className="text-[10px] font-black">{p.label}</span>
            <Plus className="h-3 w-3 ml-auto text-black/30" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER COMMENT MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function CommentManager({ comments, questions, answers, onUpdate, onGenerate, isGenerating }: {
  comments: TeacherComment[];
  questions: DetectedQuestion[];
  answers: Record<string, string>;
  onUpdate: (c: TeacherComment[]) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  const updateComment = (qId: string, text: string) => {
    const existing = comments.find(c => c.qId === qId);
    if (existing) {
      onUpdate(comments.map(c => c.qId === qId ? { ...c, text } : c));
    } else {
      onUpdate([...comments, { qId, text, position: "right", ox: 0, oy: 0 }]);
    }
  };
  const removeComment = (qId: string) => onUpdate(comments.filter(c => c.qId !== qId));

  return (
    <div className="space-y-2">
      <button onClick={onGenerate} disabled={isGenerating || !Object.keys(answers).length}
        className="w-full py-2 bg-red-500 text-white border-2 border-black rounded-xl font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-red-600 transition">
        {isGenerating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Générer corrections (Gemini)
      </button>
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {questions.filter(q => answers[q.id]).map(q => {
          const c = comments.find(c => c.qId === q.id);
          return (
            <div key={q.id} className="space-y-0.5">
              <label className="text-[8px] font-black text-black/40 block truncate">{q.text.substring(0, 40)}…</label>
              <div className="flex gap-1">
                <input
                  value={c?.text ?? ""}
                  onChange={e => updateComment(q.id, e.target.value)}
                  placeholder="Commentaire en rouge…"
                  className="flex-1 border border-red-200 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:border-red-500 font-bold"
                  style={{ color: "#cc0000" }}
                />
                <select value={c?.position ?? "right"} onChange={e => {
                  if (c) onUpdate(comments.map(cc => cc.qId === q.id ? { ...cc, position: e.target.value as any } : cc));
                  else updateComment(q.id, "");
                }} className="border border-black/10 rounded text-[8px] px-0.5 w-14">
                  <option value="right">→ Droite</option>
                  <option value="above">↑ Haut</option>
                  <option value="below">↓ Bas</option>
                  <option value="margin">◀ Marge</option>
                </select>
                {c && (
                  <button onClick={() => removeComment(q.id)}
                    className="p-1 rounded hover:bg-red-100 transition">
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {

  const [step, setStep] = useState<WorkflowStep>("import");

  // Evaluation
  const [evalPages, setEvalPages]       = useState<EvalPage[]>([]);
  const [isRealUpload, setIsRealUpload] = useState(false);
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

  // Grade
  const [criteriaLevel, setCriteriaLevel] = useState<CriteriaLevel>(CriteriaLevel.LEVEL_5_6);
  const [variantSeed, setVariantSeed]     = useState(1);

  // Answers
  const [answers, setAnswers]         = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [genErr, setGenErr]           = useState("");

  // Preview
  const [previewPage, setPreviewPage] = useState(0);
  const [editMode, setEditMode]       = useState(false);
  const [offsets, setOffsets]         = useState<Record<string, { x: number; y: number }>>({});

  // Effects
  const [effects, setEffects]         = useState<PageEffectOverrides>(defaultEffects());

  // Teacher comments
  const [comments, setComments]         = useState<TeacherComment[]>([]);
  const [isGenComments, setIsGenComments] = useState(false);

  // Geometry shapes
  const [shapes, setShapes]           = useState<GeometryShape[]>([]);

  // Sidebar panel
  const [sidePanel, setSidePanel]     = useState<"effects" | "comments" | "geometry">("effects");

  // PDF.js
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

  // Load profiles
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
    } catch { /* fallback */ }
    try {
      const loc = localStorage.getItem("student_profiles_v3");
      if (loc) setSavedProfiles(JSON.parse(loc));
    } catch { /* ignore */ }
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
    try { await fetch(`/api/students?name=${encodeURIComponent(name)}`, { method: "DELETE" }); } catch { }
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
          ...prev, hwImage: b64, hwImageName: fileName,
          fontKey, inkColor,
          fontSize: s.suggestedSize ?? prev.fontSize,
          rotationAngle: s.suggestedRotation ?? prev.rotationAngle,
          skewAngle: s.suggestedRotation ?? prev.skewAngle,
          messinessIntensity: s.messinessIntensity ?? prev.messinessIntensity,
          enableUnreadableLetters: s.enableUnreadableLetters ?? prev.enableUnreadableLetters,
          letterCaseChaos: s.letterCaseChaos ?? prev.letterCaseChaos,
          penThickness: s.penThickness ?? prev.penThickness,
          lineWobbleAmp: s.baselineWobbleAmp ?? prev.lineWobbleAmp,
          raturesRate: s.inferredRaturesRate ?? prev.raturesRate,
          blancoRate: s.inferredBlancoRate ?? prev.blancoRate,
          enableRatures: (s.inferredRaturesRate ?? 0) > 0.01 ? true : prev.enableRatures,
          enableBlanco: (s.inferredBlancoRate ?? 0) > 0.005 ? true : prev.enableBlanco,
          enableSmudges: (s.inferredSmudgeFreq ?? 0) > 0.15 ? true : prev.enableSmudges,
          fingerprint: s,
          analysisDescription: s.analysisDescription,
          confidenceScore: s.confidenceScore,
        }));
      }
    } catch (err) { console.error("analyze:", err); }
    setIsAnalyzing(false);
  };

  const handleEvalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setQuestions([]); setAnswers({}); setIsRealUpload(true); setUsePreloaded(false);
    setComments([]); setShapes([]);
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setIsPdfLoading(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const arr = new Uint8Array(ev.target?.result as ArrayBuffer);
          const lib = (window as any).pdfjsLib;
          if (!lib) { alert("PDF.js non chargé, réessayez."); setIsPdfLoading(false); return; }
          const pdf = await lib.getDocument({ data: arr }).promise;
          const pages: EvalPage[] = [];
          for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n);
            const vp = page.getViewport({ scale: 2.0 });
            const cv = document.createElement("canvas");
            const ctx = cv.getContext("2d")!;
            cv.width = vp.width; cv.height = vp.height;
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            pages.push({ base64: cv.toDataURL("image/png"), pageNum: n });
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
    setUsePreloaded(true); setIsRealUpload(false);
    setAnswers({}); setQuestions([]); setComments([]); setShapes([]);
    const tpl = PRELOADED_TEMPLATES.find(t => t.id === id);
    if (tpl) {
      setQuestions(tpl.questions.map(q => ({
        id: q.id, text: q.questionText, pageIndex: 0,
        x: q.defaultX, y: q.defaultY, maxWidth: q.maxWidth ?? 78,
      })));
    }
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
      const d = await r.json();
      if (d.success && d.questions?.length) { setQuestions(d.questions); setStep("grade"); }
      else setDetectErr("Aucune question détectée. Vérifiez que le document est lisible.");
    } catch { setDetectErr("Erreur de connexion."); }
    setIsDetecting(false);
  };

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

  const generateComments = async () => {
    setIsGenComments(true);
    try {
      const r = await fetch("/api/generate-comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, answers, criteriaLevel, studentName: activeProfile.name }),
      });
      const d = await r.json();
      if (d.success && d.comments) {
        const newComments: TeacherComment[] = Object.entries(d.comments).map(([qId, c]: [string, any]) => ({
          qId, text: c.text || "", symbol: c.symbol, position: c.position || "right",
          style: c.style, ox: 0, oy: 0,
        }));
        setComments(newComments);
        setEffects(prev => ({ ...prev, showComments: true }));
      }
    } catch (err) { console.error("comments:", err); }
    setIsGenComments(false);
  };

  const handleOffsetChange = useCallback((id: string, dx: number, dy: number) => {
    setOffsets(prev => ({ ...prev, [id]: { x: (prev[id]?.x || 0) + dx, y: (prev[id]?.y || 0) + dy } }));
  }, []);

  const handleCommentDrag = useCallback((qId: string, dx: number, dy: number) => {
    setComments(prev => prev.map(c => c.qId === qId ? { ...c, ox: c.ox + dx, oy: c.oy + dy } : c));
  }, []);

  const displayPages: EvalPage[] = usePreloaded ? [{ base64: "", pageNum: 1 }] : evalPages;
  const upd = <K extends keyof StudentProfile>(k: K, v: StudentProfile[K]) =>
    setActiveProfile(prev => ({ ...prev, [k]: v }));

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col antialiased">

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; }
          #print-root .page-wrap {
            width: 210mm; min-height: 297mm; page-break-after: always;
            position: relative; overflow: hidden; background: white;
          }
          #print-root .page-wrap:last-child { page-break-after: auto; }
          @page { margin: 0; size: A4 portrait; }
        }
        #print-root { display: none; }
      `}</style>

      {/* ── Print root (all pages, shown only on print) ── */}
      <div id="print-root">
        {displayPages.map((page, i) => (
          <div key={i} className="page-wrap">
            <PageLayer
              page={page} pi={i}
              questions={questions} answers={answers}
              profile={activeProfile} variantSeed={variantSeed}
              editMode={false} offsets={offsets} onOffsetChange={() => {}}
              effects={effects} shapes={shapes} comments={comments}
              forPrint
            />
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <header className="bg-white border-b-4 border-black px-5 py-3 flex flex-wrap justify-between items-center sticky top-0 z-50 shadow-[0_4px_0_0_rgba(0,0,0,1)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center text-yellow-400 font-black italic text-lg">nb</div>
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              nanobanana
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400 border-2 border-black font-extrabold">PRO</span>
            </h1>
            <p className="text-[9px] font-bold text-black/50">Évaluations 100% réalistes — Gemini AI + Deep Handwriting Engine v3</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1 sm:mt-0 flex-wrap">
          {activeProfile.fingerprint && (
            <span className={`text-[9px] font-black border-2 border-black py-0.5 px-1.5 rounded-lg ${activeProfile.fingerprint.confidenceScore >= 75 ? "bg-green-400" : "bg-yellow-300"}`}>
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
                    <p className="font-black text-sm">{isPdfLoading ? "Traitement PDF..." : "Cliquez ou glissez ici"}</p>
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

          {/* ══ STEP 2 — STUDENT ══ */}
          {step === "students" && (
            <motion.div key="students" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-5xl mx-auto pt-4">
              <h2 className="text-2xl font-black text-center">Sélectionner l'élève</h2>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Saved list */}
                <div className="lg:col-span-2 bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-sm flex items-center gap-1.5"><Users className="h-4 w-4" /> Élèves</h3>
                    <button onClick={loadProfiles} className="p-1 rounded-lg border border-black/20 hover:bg-yellow-50 transition"><RefreshCw className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {savedProfiles.length === 0
                      ? <div className="py-6 text-center text-xs text-black/30 font-bold">Aucun élève</div>
                      : savedProfiles.map(p => (
                        <div key={p.name} onClick={() => setActiveProfile({ ...p, hwImage: p.hwImageBase64 || p.hwImage || null })}
                          className={`flex items-center gap-2 p-2.5 border-2 rounded-xl cursor-pointer transition ${activeProfile.name === p.name ? "border-black bg-yellow-50 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "border-black/15 hover:border-black hover:bg-slate-50"}`}>
                          <div className="w-8 h-8 rounded-full bg-black text-yellow-400 flex items-center justify-center font-black text-sm shrink-0">{p.name[0]?.toUpperCase()}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-xs truncate">{p.name}</p>
                            <p className="text-[9px] text-black/40">{getFontFamily(p.fontKey)}</p>
                            {p.fingerprint && <p className="text-[8px] text-green-600 font-black">✦ {p.fingerprint.confidenceScore}%</p>}
                          </div>
                          {activeProfile.name === p.name && <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
                          <button onClick={e => { e.stopPropagation(); deleteProfile(p.name); }} className="p-1 rounded hover:bg-red-100 transition shrink-0">
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
                      placeholder="Ex: Ahmed Benali..." />
                  </div>

                  {/* Handwriting sample */}
                  <div>
                    <label className="text-[9px] font-black text-black/50">ÉCHANTILLON D'ÉCRITURE — Gemini extrait l'empreinte</label>
                    <label className="mt-0.5 block border-2 border-dashed border-black/20 rounded-xl p-3 text-center cursor-pointer hover:bg-yellow-50 transition relative">
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={e => {
                          const f = e.target.files?.[0]; if (!f) return;
                          const r = new FileReader();
                          r.onload = ev => analyzeHandwriting(ev.target?.result as string, f.name);
                          r.readAsDataURL(f);
                        }} />
                      {isAnalyzing
                        ? <div className="flex flex-col items-center gap-1"><RefreshCw className="h-5 w-5 animate-spin text-blue-400" /><p className="text-xs font-black text-blue-600">Gemini analyse l'écriture…</p></div>
                        : activeProfile.fingerprint
                          ? <div className="flex items-center gap-1.5 justify-center"><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-xs font-black text-green-700">Empreinte {activeProfile.fingerprint.confidenceScore}%</span></div>
                          : <div className="flex flex-col items-center gap-1"><BookOpen className="h-5 w-5 text-black/30" /><p className="text-xs font-black text-black/50">📸 Photo → Empreinte 25 paramètres</p></div>}
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
                          className={`px-2 py-1.5 text-[10px] border-2 rounded-lg transition font-bold ${activeProfile.fontKey === f.key ? "border-black bg-yellow-400 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "border-black/15 hover:border-black"}`}
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
                    <label className="text-[9px] font-black text-black/50 flex items-center gap-1"><Sliders className="h-3 w-3" /> PARAMÈTRES D'ÉCRITURE</label>
                    <div className="space-y-1.5 mt-1">
                      {[
                        { k: "messinessIntensity" as const, label: "Désordre",    min: 0, max: 6,   step: 0.1 },
                        { k: "fontSize"           as const, label: "Taille",      min: 11,max: 26,  step: 0.5 },
                        { k: "wordDrift"          as const, label: "Oscillation", min: 0, max: 5,   step: 0.1 },
                        { k: "lineWobbleAmp"      as const, label: "Tremblement", min: 0, max: 5,   step: 0.1 },
                        { k: "penThickness"       as const, label: "Épaisseur",   min: 0.5,max: 3.5,step: 0.1 },
                      ].map(s => (
                        <div key={s.k} className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-black/40 w-24 shrink-0">{s.label}</span>
                          <input type="range" min={s.min} max={s.max} step={s.step}
                            value={activeProfile[s.k] as number}
                            onChange={e => upd(s.k, parseFloat(e.target.value))}
                            className="flex-1 accent-black h-1.5 rounded" />
                          <span className="text-[9px] font-black w-7 text-right">{(activeProfile[s.k] as number).toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Realism effects */}
                  <div>
                    <label className="text-[9px] font-black text-black/50 flex items-center gap-1"><Zap className="h-3 w-3" /> EFFETS RÉALISME</label>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      {[
                        { k: "enableRatures" as const, label: "Ratures", color: "bg-red-50", sub: "raturesRate" as const, min: 0.01, max: 0.15 },
                        { k: "enableBlanco"  as const, label: "Blanco",  color: "bg-orange-50", sub: "blancoRate" as const, min: 0.01, max: 0.1 },
                        { k: "enableSmudges" as const, label: "Bavures", color: "bg-blue-50",   sub: null, min: 0, max: 0 },
                        { k: "enablePressureVar" as const, label: "Pression", color: "bg-purple-50", sub: null, min: 0, max: 0 },
                        { k: "enableLineWobble"  as const, label: "Lignes obliques", color: "bg-green-50", sub: "lineWobbleAmp" as const, min: 0, max: 5 },
                        { k: "inkDrySkipping"    as const, label: "Encre qui saute", color: "bg-yellow-50", sub: null, min: 0, max: 0 },
                      ].map(s => (
                        <div key={s.k} className={`p-2.5 border-2 rounded-xl transition cursor-pointer ${activeProfile[s.k] ? "border-black " + s.color : "border-black/15"}`}
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
                    <HandwrittenText text="Voici mon écriture personnelle avec tous les effets activés pour ce devoir."
                      qId="preview-live" profile={activeProfile} variantSeed={variantSeed} effects={effects} />
                  </div>

                  <button onClick={() => saveProfile(activeProfile)} disabled={!activeProfile.name.trim() || isSaving}
                    className="w-full py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-xs flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-zinc-800 transition">
                    {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    SAUVEGARDER LE PROFIL
                  </button>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-1">
                <button onClick={() => setStep("import")} className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
                  <ChevronLeft className="h-4 w-4" /> Retour
                </button>
                <button onClick={() => { if (isRealUpload && questions.length === 0) setStep("solve"); else setStep("grade"); }}
                  disabled={!activeProfile.name.trim()}
                  className="flex items-center gap-1.5 px-7 py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition disabled:opacity-50">
                  Continuer <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 3 — GRADE ══ */}
          {step === "grade" && (
            <motion.div key="grade" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-2xl mx-auto pt-6">
              <div className="text-center">
                <h2 className="text-2xl font-black">Note cible</h2>
                <p className="text-sm font-bold text-black/50 mt-1">Niveau pour <span className="text-black">{activeProfile.name}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {EXAM_CRITERIA_LEVELS.map(lvl => (
                  <button key={lvl.level} onClick={() => setCriteriaLevel(lvl.level)}
                    className={`p-4 border-4 rounded-2xl text-left transition ${criteriaLevel === lvl.level ? "border-black bg-yellow-400 shadow-[5px_5px_0_rgba(0,0,0,1)] -translate-y-0.5" : "border-black/15 hover:border-black bg-white"}`}>
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
                  <p className="text-[10px] text-black/40">Chaque variante = réponses uniques pour le même niveau</p>
                </div>
                <button onClick={() => setVariantSeed(s => (s % 10) + 1)}
                  className="px-3 py-2 bg-black text-yellow-400 rounded-xl font-black text-xs border-2 border-black flex items-center gap-1 hover:bg-zinc-800 transition">
                  <RefreshCw className="h-3 w-3" /> Changer
                </button>
              </div>
              <div className="flex justify-center gap-3">
                <button onClick={() => setStep("students")} className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
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
                  Gemini génère pour <span className="text-black font-black">{activeProfile.name}</span> — niveau {criteriaLevel}
                </p>
              </div>

              {isRealUpload && questions.length === 0 && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2"><Search className="h-4 w-4" /> Étape 1 : Détection des questions</h3>
                  <p className="text-sm text-black/50">Gemini analyse {evalPages.length} page(s).</p>
                  {detectErr && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border-2 border-red-200 rounded-xl">
                      <AlertCircle className="h-4 w-4 text-red-500" /><p className="text-xs font-bold text-red-600">{detectErr}</p>
                    </div>
                  )}
                  <button onClick={detectQuestions} disabled={isDetecting}
                    className="w-full py-4 bg-blue-500 text-white border-2 border-black rounded-2xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition flex items-center justify-center gap-2 disabled:opacity-60">
                    {isDetecting ? <><RefreshCw className="h-5 w-5 animate-spin" /> Analyse…</> : <><Search className="h-5 w-5" /> Détecter les questions</>}
                  </button>
                </div>
              )}

              {questions.length > 0 && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-2">
                  <h3 className="font-black flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-600" /> {questions.length} questions</h3>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
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

              {questions.length > 0 && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2"><Sparkles className="h-4 w-4 text-yellow-500" /> Génération des réponses</h3>
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

              <div className="flex justify-center">
                <button onClick={() => setStep("grade")} className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
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
                  Aperçu — {activeProfile.name}
                  {activeProfile.fingerprint && (
                    <span className="ml-2 text-sm font-bold text-blue-600">✦ {activeProfile.fingerprint.confidenceScore}%</span>
                  )}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setEditMode(m => !m)}
                    className={`flex items-center gap-1 px-3 py-2 border-2 border-black rounded-xl font-black text-xs transition ${editMode ? "bg-blue-400 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "bg-white hover:bg-blue-50"}`}>
                    <Move className="h-3.5 w-3.5" /> {editMode ? "Dépl. ON" : "Déplacer"}
                  </button>
                  <button onClick={() => setOffsets({})}
                    className="flex items-center gap-1 px-3 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 bg-white transition">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </button>
                  <button onClick={() => { setAnswers({}); setStep("solve"); }}
                    className="flex items-center gap-1 px-3 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 bg-white transition">
                    <RefreshCw className="h-3.5 w-3.5" /> Régénérer
                  </button>
                  <button onClick={() => setStep("print")}
                    className="flex items-center gap-1.5 px-4 py-2 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition">
                    <Printer className="h-3.5 w-3.5" /> Imprimer tout
                  </button>
                </div>
              </div>

              {/* Page nav thumbnails */}
              {displayPages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {displayPages.map((pg, i) => (
                    <button key={i} onClick={() => setPreviewPage(i)}
                      className={`shrink-0 relative border-2 rounded-lg overflow-hidden transition ${previewPage === i ? "border-black shadow-[2px_2px_0_rgba(0,0,0,1)] scale-105" : "border-black/20 hover:border-black"}`}
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

              {/* Main layout: page + sidebar */}
              <div className="flex gap-4 items-start">

                {/* Page with all overlays */}
                <div className="flex-1 shadow-2xl rounded-lg overflow-hidden">
                  <PageLayer
                    page={displayPages[previewPage] ?? { base64: "", pageNum: 1 }}
                    pi={previewPage}
                    questions={questions} answers={answers}
                    profile={activeProfile} variantSeed={variantSeed}
                    editMode={editMode} offsets={offsets} onOffsetChange={handleOffsetChange}
                    effects={effects} shapes={shapes} comments={comments}
                    onCommentDrag={handleCommentDrag}
                  />
                </div>

                {/* Sidebar */}
                <div className="w-72 shrink-0 space-y-3 sticky top-24 max-h-[85vh] overflow-y-auto">

                  {/* Panel tabs */}
                  <div className="bg-white rounded-2xl border-4 border-black shadow-[4px_4px_0_rgba(0,0,0,1)]">
                    <div className="flex border-b-2 border-black">
                      {[
                        { k: "effects" as const,  icon: <Eye className="h-3.5 w-3.5" />,            label: "Effets"     },
                        { k: "comments" as const,  icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Prof"       },
                        { k: "geometry" as const,  icon: <Triangle className="h-3.5 w-3.5" />,      label: "Géomét."    },
                      ].map(t => (
                        <button key={t.k} onClick={() => setSidePanel(t.k)}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-black transition border-r last:border-r-0 border-black ${sidePanel === t.k ? "bg-yellow-400" : "hover:bg-yellow-50"}`}>
                          {t.icon}{t.label}
                        </button>
                      ))}
                    </div>

                    <div className="p-3">
                      {/* Effects panel */}
                      {sidePanel === "effects" && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-black text-black/40">AFFICHAGE EN TEMPS RÉEL</p>
                          <EffectToggles effects={effects}
                            onChange={(k, v) => setEffects(prev => ({ ...prev, [k]: v }))} />
                          <div className="pt-2 border-t border-black/10">
                            <button onClick={() => setEffects(defaultEffects())}
                              className="w-full py-1.5 border-2 border-black/20 rounded-lg text-[10px] font-black hover:bg-yellow-50 transition">
                              Tout activer
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Comments panel */}
                      {sidePanel === "comments" && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-black text-black/40 flex items-center gap-1">
                            <span style={{ color: "#cc0000" }}>●</span> CORRECTIONS ENSEIGNANT (ROUGE)
                          </p>
                          <CommentManager
                            comments={comments} questions={questions} answers={answers}
                            onUpdate={setComments} onGenerate={generateComments}
                            isGenerating={isGenComments}
                          />
                        </div>
                      )}

                      {/* Geometry panel */}
                      {sidePanel === "geometry" && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-black text-black/40 flex items-center gap-1">
                            <PenTool className="h-3 w-3" /> FORMES GÉOMÉTRIQUES (CRAYON)
                          </p>
                          <GeometryBuilder pageIndex={previewPage} onAdd={s => setShapes(prev => [...prev, s])} />
                          {shapes.filter(s => s.pageIndex === previewPage).length > 0 && (
                            <div className="pt-2 border-t border-black/10 space-y-1">
                              <p className="text-[9px] font-black text-black/40">SUR CETTE PAGE :</p>
                              {shapes.filter(s => s.pageIndex === previewPage).map(s => (
                                <div key={s.id} className="flex items-center gap-1.5 p-1.5 bg-slate-50 rounded-lg">
                                  <span className="text-[9px] font-black flex-1 capitalize">{s.type} {s.label ? `— ${s.label}` : ""}</span>
                                  <button onClick={() => setShapes(prev => prev.filter(sh => sh.id !== s.id))}
                                    className="p-0.5 rounded hover:bg-red-100">
                                    <Trash2 className="h-3 w-3 text-red-400" />
                                  </button>
                                </div>
                              ))}
                              <button onClick={() => setShapes(prev => prev.filter(s => s.pageIndex !== previewPage))}
                                className="w-full py-1 border border-red-200 rounded-lg text-[9px] font-black text-red-500 hover:bg-red-50 transition">
                                Supprimer tout (page {previewPage + 1})
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Answer editor */}
                  <div className="bg-white rounded-2xl border-4 border-black p-3 shadow-[4px_4px_0_rgba(0,0,0,1)] space-y-2">
                    <h3 className="font-black text-xs flex items-center gap-1.5"><Edit3 className="h-3.5 w-3.5" /> Réponses p.{previewPage + 1}</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {questions.filter(q => q.pageIndex === previewPage).map(q => (
                        <div key={q.id}>
                          <label className="text-[8px] font-black text-black/40 block truncate">{q.text.substring(0, 40)}…</label>
                          <textarea value={answers[q.id] ?? ""} onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            rows={2} className="w-full border-2 border-black/15 rounded-lg p-1.5 text-[10px] focus:outline-none focus:border-black resize-none mt-0.5" />
                        </div>
                      ))}
                      {questions.filter(q => q.pageIndex === previewPage).length === 0 && (
                        <p className="text-xs text-black/30 text-center py-2">Aucune réponse ici</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button onClick={() => setStep("grade")} className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition">
                  <ChevronLeft className="h-4 w-4" /> Modifier
                </button>
                <button onClick={() => setStep("print")}
                  className="flex items-center gap-2 px-7 py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition">
                  <Printer className="h-4 w-4" /> Imprimer ({displayPages.length} pages)
                </button>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 6 — PRINT ══ */}
          {step === "print" && (
            <motion.div key="print" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-xl mx-auto pt-6">
              <div className="text-center">
                <h2 className="text-2xl font-black">Impression</h2>
                <p className="text-sm text-black/50 font-bold mt-1">Toutes les pages — qualité parfaite</p>
              </div>

              <div className="bg-white rounded-2xl border-4 border-black p-6 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Élève",      activeProfile.name],
                    ["Niveau",     `${criteriaLevel}/8`],
                    ["Police",     getFontFamily(activeProfile.fontKey)],
                    ["Pages",      `${displayPages.length}`],
                    ["Empreinte",  activeProfile.fingerprint ? `${activeProfile.fingerprint.confidenceScore}%` : "Manuelle"],
                    ["Géométrie",  `${shapes.length} forme(s)`],
                    ["Corrections",`${comments.length} commentaire(s)`],
                    ["Ratures",    effects.showRatures && activeProfile.enableRatures ? "✓" : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="p-2.5 bg-slate-50 rounded-xl">
                      <p className="text-[9px] font-black text-black/40">{k}</p>
                      <p className="font-black text-sm">{v}</p>
                    </div>
                  ))}
                </div>

                {/* Final effect toggles for print */}
                <div className="p-3 bg-zinc-50 border-2 border-black/10 rounded-xl">
                  <p className="text-[9px] font-black text-black/40 mb-2">INCLURE DANS L'IMPRESSION :</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { k: "showRatures" as const,  label: "Ratures" },
                      { k: "showBlanco" as const,   label: "Blanco"  },
                      { k: "showSmudges" as const,  label: "Bavures" },
                      { k: "showComments" as const, label: "Corrections prof" },
                      { k: "showGeometry" as const, label: "Géométrie" },
                      { k: "showPressure" as const, label: "Pression" },
                    ].map(t => (
                      <button key={t.k} onClick={() => setEffects(prev => ({ ...prev, [t.k]: !prev[t.k] }))}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-black transition ${effects[t.k] ? "bg-black text-yellow-400 border-black" : "bg-white text-black/40 border-black/15"}`}>
                        {effects[t.k] ? <CheckCircle className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl space-y-1">
                  <p className="font-black text-sm text-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Prêt pour impression</p>
                  <p className="text-xs text-green-600">✓ Réponses directement sur les pages</p>
                  <p className="text-xs text-green-600">✓ Écriture unique de {activeProfile.name}</p>
                  {shapes.length > 0 && <p className="text-xs text-green-600">✓ {shapes.length} forme(s) géométrique(s) au crayon</p>}
                  {comments.length > 0 && <p className="text-xs text-green-600">✓ {comments.length} correction(s) de l'enseignant en rouge</p>}
                </div>

                <button onClick={() => window.print()}
                  className="w-full py-5 bg-black text-yellow-400 border-4 border-black rounded-2xl font-black text-xl shadow-[6px_6px_0_rgba(250,204,21,1)] hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgba(250,204,21,1)] transition flex items-center justify-center gap-3">
                  <Printer className="h-6 w-6" /> IMPRIMER TOUTES LES PAGES
                </button>

                <div className="flex gap-2">
                  <button onClick={() => setStep("preview")} className="flex-1 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition flex items-center justify-center gap-1">
                    <ChevronLeft className="h-3.5 w-3.5" /> Aperçu
                  </button>
                  <button onClick={() => { setStep("students"); setVariantSeed(s => (s % 10) + 1); }}
                    className="flex-1 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition flex items-center justify-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Autre élève
                  </button>
                  <button onClick={() => { setStep("import"); setEvalPages([]); setQuestions([]); setAnswers({}); setComments([]); setShapes([]); }}
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
