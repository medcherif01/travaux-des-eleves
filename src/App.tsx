/**
 * @license SPDX-License-Identifier: Apache-2.0
 * nanobanana PRO — Workflow évaluation manuscrite ultra-réaliste
 * Deep Handwriting Fidelity Engine v2 — letter-level fingerprint reproduction
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Sparkles, RotateCcw, CheckCircle, AlertCircle,
  Edit3, RefreshCw, User, Users, Plus, Trash2, ChevronLeft, ChevronRight,
  Search, Save, Printer, Move, BookOpen, Zap, Sliders, Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRELOADED_TEMPLATES, RUBRIC_ANSWERS, EXAM_CRITERIA_LEVELS } from "./templates";
import { CriteriaLevel } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deep handwriting fingerprint — populated from Gemini Vision analysis
 * of the student's actual handwriting sample.
 */
interface HandwritingFingerprint {
  // Font / color
  suggestedFont: string;
  suggestedColor: string;          // hex or named colour

  // Sizing
  suggestedSize: number;           // base font-size in px
  letterSpacingEm: number;        // em — spacing between letters
  wordSpacingPx: number;          // px — spacing between words
  lineHeightMultiplier: number;   // relative to fontSize

  // Geometry
  suggestedRotation: number;      // global slant (°) — negative = right lean
  baselineWobbleAmp: number;      // px — vertical offset per line
  baselineWobbleFreq: number;     // sin frequency factor
  letterRotVariance: number;      // ° — per-letter random rotation
  letterYVariance: number;        // px — per-letter vertical jitter
  letterXVariance: number;        // px — per-letter horizontal jitter

  // Ink & pressure
  penThickness: number;           // stroke weight multiplier
  inkOpacityMin: number;          // lightest pressure opacity
  inkOpacityMax: number;          // heaviest pressure opacity
  inkDrySkipRate: number;         // fraction of letters that appear faded
  inkBleedRadius: number;         // SVG blur radius for ink spread

  // Deformation
  messinessIntensity: number;     // 0–6 sloppiness
  letterSizeVariance: number;     // px — size variance per letter
  letterCaseChaos: boolean;       // wrong-case occasional letters
  enableUnreadableLetters: boolean;

  // Inferred realism presets
  inferredRaturesRate: number;
  inferredBlancoRate: number;
  inferredSmudgeFreq: number;

  // Unique 16-value shape fingerprint — used as seed offsets per letter
  letterShapeFingerprint: number[];

  // Meta
  analysisDescription: string;
  confidenceScore: number;
}

interface StudentProfile {
  _id?: string;
  name: string;
  hwImage: string | null;         // base64 displayed in UI
  hwImageBase64?: string;         // stored in MongoDB
  hwImageName: string;

  // ── Rendering params (from fingerprint OR manual overrides)
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
  pencilHardness: "HB" | "2B" | "4B" | "2H";

  // ── Realism effects
  enableRatures: boolean;
  raturesRate: number;
  enableBlanco: boolean;
  blancoRate: number;
  enableSmudges: boolean;
  enablePressureVar: boolean;
  enableLineWobble: boolean;
  lineWobbleAmp: number;

  // ── Deep fingerprint (set after Gemini Vision analysis)
  fingerprint?: HandwritingFingerprint;

  // ── Meta
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

function getFontVar(key: string) { return HANDWRITING_FONTS.find(f => f.key === key)?.cssVar ?? "--font-homemade"; }
function getFontFamily(key: string) { return HANDWRITING_FONTS.find(f => f.key === key)?.family ?? "Homemade Apple"; }

const FONT_KEY_MAP: Record<string, string> = {
  "homemade apple": "homemade-apple",
  "marck script":   "marck-script",
  parisienne:       "parisienne",
  allura:           "allura",
  "la belle aurore":"la-belle-aurore",
  "bad script":     "bad-script",
};
const COLOR_MAP: Record<string, string> = {
  blue: "#1d3278", black: "#1c1c1e", red: "#be0000", green: "#0a7a2a",
};

function defaultProfile(name = "Élève 1"): StudentProfile {
  return {
    name, hwImage: null, hwImageBase64: "", hwImageName: "",
    fontKey: "homemade-apple", inkColor: "#1d3278",
    fontSize: 17, rotationAngle: -0.5, skewAngle: -3,
    wordDrift: 1.5, letterSpacing: -0.5, messinessIntensity: 2.5,
    enableUnreadableLetters: true, letterCaseChaos: true,
    inkDrySkipping: true, penThickness: 1.5,
    penType: "ballpoint", pencilHardness: "HB",
    enableRatures: true, raturesRate: 0.04,
    enableBlanco: false, blancoRate: 0.02,
    enableSmudges: true, enablePressureVar: true,
    enableLineWobble: true, lineWobbleAmp: 1.8,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC HASH — reproducible per-student per-letter deformations
// ─────────────────────────────────────────────────────────────────────────────
function dHash(str: string, idx = 0): number {
  let h = 0;
  const s = str + idx;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h) / 2_147_483_647;
}
function sSeed(a: string, b: string | number, idx = 0): number {
  return dHash(`${a}_${b}_${idx}`, idx);
}
/** Inject the student's shape fingerprint as an additional offset layer */
function fpOffset(fp: number[] | undefined, index: number): number {
  if (!fp || fp.length < 16) return 0;
  return (fp[index % 16] - 0.5) * 2; // −1 … +1
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP INDICATOR
// ─────────────────────────────────────────────────────────────────────────────
const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: "import",   label: "Importer"  },
  { key: "students", label: "Élève"     },
  { key: "grade",    label: "Note"      },
  { key: "solve",    label: "Résoudre"  },
  { key: "preview",  label: "Aperçu"    },
  { key: "print",    label: "Imprimer"  },
];

function StepBar({ current, onGoto }: { current: WorkflowStep; onGoto: (s: WorkflowStep) => void }) {
  const ci = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap py-2 px-4">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        const done = i < ci;
        return (
          <React.Fragment key={s.key}>
            <button
              onClick={() => done && onGoto(s.key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border-2 text-[11px] font-black transition-all
                ${active ? "bg-yellow-400 border-black text-black shadow-[2px_2px_0_rgba(0,0,0,1)]" :
                  done   ? "bg-black border-black text-yellow-400 cursor-pointer" :
                           "bg-white border-black/20 text-black/30 cursor-not-allowed"}`}
            >
              {done ? <CheckCircle className="h-3 w-3" /> : null}
              {s.label}
            </button>
            {i < STEPS.length - 1 && <div className={`w-4 h-0.5 ${i < ci ? "bg-black" : "bg-black/15"}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDWRITTEN TEXT — pixel-accurate reproduction of the student's handwriting
// Uses the deep fingerprint when available, falls back to profile params.
// ─────────────────────────────────────────────────────────────────────────────
function HandwrittenText({
  text, qId, profile, variantSeed,
}: {
  text: string;
  qId: string;
  profile: StudentProfile;
  variantSeed: number;
}) {
  if (!text) return null;

  const fp = profile.fingerprint;

  // ── Resolve rendering parameters (fingerprint wins over manual if available + high confidence)
  const useFingerprint = !!fp && (fp.confidenceScore ?? 0) >= 55;

  const baseSeed   = sSeed(profile.name + variantSeed, qId);
  const fontSize   = useFingerprint
    ? Math.max(11, fp.suggestedSize + (baseSeed * 1.5 - 0.75))
    : Math.max(11, profile.fontSize + (baseSeed * 2 - 1));
  const globalSlant = useFingerprint ? fp.suggestedRotation : profile.skewAngle;
  const inkCol     = profile.inkColor; // always from profile (user can override)
  const fontKey    = profile.fontKey;

  const wobbleAmp  = useFingerprint ? fp.baselineWobbleAmp  : profile.lineWobbleAmp;
  const wobbleFreq = useFingerprint ? fp.baselineWobbleFreq : 2.1;
  const opacMin    = useFingerprint ? fp.inkOpacityMin  : 0.72;
  const opacMax    = useFingerprint ? fp.inkOpacityMax  : 1.0;
  const dryRate    = useFingerprint ? fp.inkDrySkipRate : 0.06;
  const lRotVar    = useFingerprint ? fp.letterRotVariance  : profile.messinessIntensity * 1.8;
  const lYVar      = useFingerprint ? fp.letterYVariance    : profile.messinessIntensity * 0.6;
  const lXVar      = useFingerprint ? fp.letterXVariance    : profile.messinessIntensity * 0.2;
  const lSzVar     = useFingerprint ? fp.letterSizeVariance : profile.messinessIntensity * 0.35;
  const lSpEm      = useFingerprint ? fp.letterSpacingEm    : profile.letterSpacing / 17;
  const wSpPx      = useFingerprint ? fp.wordSpacingPx      : (5 + profile.messinessIntensity);
  const lHeight    = useFingerprint ? fp.lineHeightMultiplier : 1.6;
  const caseChaos  = useFingerprint ? fp.letterCaseChaos   : profile.letterCaseChaos;
  const unreadable = useFingerprint ? fp.enableUnreadableLetters : profile.enableUnreadableLetters;
  const messiness  = useFingerprint ? fp.messinessIntensity : profile.messinessIntensity;

  const lines = text.split("\n");

  return (
    <div className="select-none" style={{ lineHeight: `${fontSize * lHeight}px` }}>
      {lines.map((line, li) => {
        const words = line.split(/\s+/).filter(Boolean);

        // ── Baseline wobble for this line (fingerprint-aware)
        const fpWobble = fp ? fpOffset(fp.letterShapeFingerprint, li + 8) * 0.6 : 0;
        const lineWobble = profile.enableLineWobble
          ? Math.sin(li * wobbleFreq + baseSeed * 6) * wobbleAmp + fpWobble
          : 0;

        return (
          <div key={li} className="flex flex-wrap" style={{ transform: `translateY(${lineWobble}px)` }}>
            {words.map((word, wi) => {
              // Word-level seed: name + word text + position for determinism
              const wSeed = sSeed(profile.name + word + li, wi + variantSeed * 3);
              // Use fingerprint slot to perturb word Y (makes it match real writing)
              const fpWordY = fp ? fpOffset(fp.letterShapeFingerprint, wi % 16) * 0.8 : 0;
              const wordY   = (wSeed - 0.5) * 2 * Math.min(messiness, 5) * 0.35 + fpWordY;
              const wordRot = (wSeed * 0.6 - 0.3) * Math.min(messiness, 5) * 0.12;
              const wordMarginR = Math.max(2, wSpPx + (wSeed - 0.5) * 3);

              const letters = word.split("").map((ch, ci) => {
                const cs = sSeed(profile.name + ch + wi, ci + li * 100 + variantSeed);
                // Fingerprint slot for this letter position
                const fpSlot = fp ? fp.letterShapeFingerprint[(ci + wi * 3) % 16] : 0.5;
                // Blend cs with fingerprint slot for uniqueness matching the real sample
                const csFp = cs * 0.6 + fpSlot * 0.4;

                // ── Letter character
                let finalCh = ch;
                if (caseChaos && csFp > 0.88 && ch.toLowerCase() !== ch.toUpperCase()) {
                  finalCh = csFp > 0.94 ? ch.toUpperCase() : ch;
                }
                if (unreadable && messiness > 4 && cs > 0.93) {
                  const squiggles = ["ɑ", "ε", "ɳ", "ɯ", "ʋ", "ɹ"];
                  finalCh = squiggles[Math.floor(cs * squiggles.length)] ?? ch;
                }

                // ── Per-letter geometry (fingerprint-modulated)
                const ly   = (csFp - 0.5) * lYVar * 2;
                const lx   = (csFp * 0.5 - 0.25) * lXVar * 2;
                // Slant combines global angle + per-letter variance + fingerprint lean
                const fpLean = fp ? fpOffset(fp.letterShapeFingerprint, (ci * 2 + wi) % 16) * 1.2 : 0;
                const lSkew = globalSlant + (csFp - 0.5) * lRotVar * 0.7 + fpLean;
                const lRot  = (csFp - 0.5) * lRotVar * 0.5;
                const lSize = (csFp * 0.7 - 0.35) * lSzVar * 2;

                // ── Ink pressure / opacity
                let opacity = 1;
                if (profile.enablePressureVar) {
                  // pressure oscillates naturally: use sin of position + fingerprint
                  const pressureCycle = Math.sin(ci * 0.8 + baseSeed * 4) * 0.5 + 0.5;
                  const fpPressure = fp ? fp.letterShapeFingerprint[(ci + 4) % 16] : 0.5;
                  const blended = pressureCycle * 0.5 + fpPressure * 0.3 + csFp * 0.2;
                  opacity = opacMin + blended * (opacMax - opacMin);
                }
                // Ink dry skip — sporadic faded letters
                if (profile.inkDrySkipping && cs < dryRate) {
                  opacity = Math.max(0.28, opacity * (0.3 + cs * 4));
                }

                // ── Stroke weight (pressure → thickness)
                const strokeW = profile.enablePressureVar && profile.penThickness > 1.0
                  ? `${(profile.penThickness - 1) * 0.25 * opacity}px`
                  : "0px";

                return (
                  <span
                    key={ci}
                    style={{
                      display:        "inline-block",
                      transform:      `translate(${lx}px,${ly}px) rotate(${lRot}deg) skewX(${lSkew}deg)`,
                      fontSize:       `${Math.max(9, fontSize + lSize)}px`,
                      opacity,
                      letterSpacing:  ci === 0 ? 0 : `${lSpEm + (csFp - 0.5) * 0.04}em`,
                      fontFamily:     `var(${getFontVar(fontKey)})`,
                      color:          inkCol,
                      WebkitTextStroke: strokeW !== "0px" ? `${strokeW} ${inkCol}` : undefined,
                      textShadow:     opacity > 0.85
                        ? `0.15px 0.2px 0.3px rgba(0,0,0,0.22)`
                        : `0.05px 0.08px 0.12px rgba(0,0,0,0.12)`,
                    }}
                  >
                    {finalCh}
                  </span>
                );
              });

              return (
                <span
                  key={wi}
                  style={{
                    display:     "inline-block",
                    transform:   `translateY(${wordY}px) rotate(${wordRot}deg)`,
                    marginRight: `${wordMarginR}px`,
                    whiteSpace:  "nowrap",
                  }}
                >
                  {letters}
                </span>
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
// SVG REALISM EFFECTS — ratures, blanco, smudges
// All effects are deterministic: same student + same answer = same marks
// ─────────────────────────────────────────────────────────────────────────────
function PageRealism({
  pi, pageQ, answers, profile, variantSeed,
}: {
  pi: number;
  pageQ: DetectedQuestion[];
  answers: Record<string, string>;
  profile: StudentProfile;
  variantSeed: number;
}) {
  const fp = profile.fingerprint;
  const raturesRate = profile.enableRatures
    ? (fp ? Math.max(profile.raturesRate, fp.inferredRaturesRate * 0.5) : profile.raturesRate)
    : 0;
  const blancoRate = profile.enableBlanco
    ? (fp ? Math.max(profile.blancoRate, fp.inferredBlancoRate * 0.5) : profile.blancoRate)
    : 0;
  const smudgeFreq = profile.enableSmudges
    ? (fp ? fp.inferredSmudgeFreq * 0.7 : 0.28)
    : 0;
  const bleedR = fp ? fp.inkBleedRadius : 0.15;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
      viewBox="0 0 100 141.4"
      preserveAspectRatio="none"
    >
      <defs>
        {/* Ink bleed filter — amount driven by fingerprint */}
        <filter id={`ink-blur-${pi}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={bleedR} />
        </filter>
        {/* Smudge turbulence filter */}
        <filter id={`smudge-${pi}`} x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85 0.55" numOctaves="3" seed={pi * 7 + variantSeed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.45" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Blanco texture */}
        <filter id={`blanco-${pi}`}>
          <feTurbulence type="turbulence" baseFrequency="0.65" numOctaves="2" result="noise" />
          <feColorMatrix type="saturate" values="0" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>

      {pageQ.map(q => {
        const ans = answers[q.id] ?? "";
        if (!ans) return null;
        const words = ans.split(/\s+/).filter(Boolean);
        const inkCol = profile.inkColor;

        return (
          <React.Fragment key={q.id}>
            {/* ── Ratures (crossed-out corrections) */}
            {raturesRate > 0 && words.map((w, wi) => {
              const rs = sSeed(profile.name + q.id + "rature", wi * 37 + variantSeed);
              if (rs <= 1 - raturesRate * 3) return null;
              // Position: spread across the answer block realistically
              const col  = Math.floor(wi / 6);
              const row  = wi % 6;
              const rx   = q.x + row * 5 + (rs * 12) % 8;
              const ry   = q.y + col * 2.4 + 1.1;
              const rw   = 3.5 + rs * 7;
              const jitter1 = (sSeed(profile.name, wi + "j1") - 0.5) * 0.35;
              const jitter2 = (sSeed(profile.name, wi + "j2") - 0.5) * 0.25;
              const isBold  = rs > 0.75;
              const isDouble = rs > 0.87;
              return (
                <React.Fragment key={`rat-${wi}`}>
                  {/* Primary strikethrough */}
                  <line
                    x1={rx} y1={ry + jitter1}
                    x2={rx + rw} y2={ry + 0.18 + jitter1}
                    stroke={inkCol}
                    strokeWidth={isBold ? "0.32" : "0.24"}
                    strokeLinecap="round"
                    opacity={0.88}
                    style={{ filter: `url(#ink-blur-${pi})` }}
                  />
                  {/* Occasional second strike — slightly offset */}
                  {isDouble && (
                    <line
                      x1={rx - 0.4} y1={ry + 0.38 + jitter2}
                      x2={rx + rw + 0.4} y2={ry + 0.55 + jitter2}
                      stroke={inkCol}
                      strokeWidth="0.19"
                      strokeLinecap="round"
                      opacity={0.65}
                    />
                  )}
                  {/* Occasional X-shaped blot at start of rature */}
                  {rs > 0.92 && (
                    <circle cx={rx - 0.3} cy={ry + 0.1} r="0.28"
                      fill={inkCol} opacity={0.55} style={{ filter: `url(#ink-blur-${pi})` }} />
                  )}
                </React.Fragment>
              );
            })}

            {/* ── Blanco / correction fluid */}
            {blancoRate > 0 && words.map((_, wi) => {
              const bs = sSeed(profile.name + q.id + "blanco", wi * 53 + variantSeed + 7);
              if (bs <= 1 - blancoRate * 2.5) return null;
              const col = Math.floor(wi / 6);
              const row = wi % 6;
              const bx  = q.x + row * 5 + (bs * 10) % 6;
              const by  = q.y + col * 2.4 - 0.15;
              const bw  = 4.5 + bs * 8;
              const bh  = 1.65 + bs * 0.45;
              const tilt = (sSeed(profile.name, wi + "tilt") - 0.5) * 2.5;
              const cx   = bx + bw / 2;
              const cy   = by + bh / 2;
              return (
                <React.Fragment key={`blanco-${wi}`}>
                  {/* Blanco base — slightly warm white, never perfectly pure */}
                  <rect x={bx} y={by} width={bw} height={bh}
                    fill="#f3eedd" opacity={0.96} rx="0.25"
                    transform={`rotate(${tilt},${cx},${cy})`}
                  />
                  {/* Blanco highlight — brush application stroke */}
                  <rect x={bx + 0.15} y={by + 0.1} width={bw - 0.3} height={bh * 0.45}
                    fill="#f8f5ec" opacity={0.55} rx="0.15"
                    transform={`rotate(${tilt},${cx},${cy})`}
                  />
                  {/* Blanco shadow edge — realistic raised edge */}
                  <rect x={bx} y={by + bh - 0.28} width={bw} height="0.28"
                    fill="#d4c9b0" opacity={0.4} rx="0.1"
                    transform={`rotate(${tilt},${cx},${cy})`}
                  />
                </React.Fragment>
              );
            })}

            {/* ── Ink smudge / bavure d'encre */}
            {smudgeFreq > 0 && (() => {
              const smS  = sSeed(profile.name + q.id + "smudge", variantSeed + 99);
              if (smS > (1 - smudgeFreq)) return null;
              const smS2 = sSeed(profile.name + q.id + "smudge2", variantSeed + 77);
              const sx = q.x + smS * 38;
              const sy = q.y + 0.8 + smS2 * 2;
              const r  = 0.25 + smS * 0.55;
              const ang = smS * 40 - 20;
              return (
                <>
                  {/* Main smudge blob */}
                  <ellipse cx={sx} cy={sy} rx={r * 2.5} ry={r * 0.55}
                    fill={inkCol} opacity={0.07 + smS * 0.05}
                    transform={`rotate(${ang},${sx},${sy})`}
                    style={{ filter: `url(#smudge-${pi})` }}
                  />
                  {/* Satellite micro-blob */}
                  {smS > 0.5 && (
                    <ellipse cx={sx + r * 1.8} cy={sy + 0.3} rx={r * 0.9} ry={r * 0.3}
                      fill={inkCol} opacity={0.05}
                      transform={`rotate(${ang + 15},${sx + r * 1.8},${sy + 0.3})`}
                      style={{ filter: `url(#smudge-${pi})` }}
                    />
                  )}
                </>
              );
            })()}
          </React.Fragment>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE ANSWER BLOCK
// ─────────────────────────────────────────────────────────────────────────────
interface DraggableAnswerProps {
  question: DetectedQuestion;
  answer: string;
  profile: StudentProfile;
  variantSeed: number;
  editMode: boolean;
  offset: { x: number; y: number };
  onDelta: (id: string, dx: number, dy: number) => void;
}

function DraggableAnswer({ question, answer, profile, variantSeed, editMode, offset, onDelta }: DraggableAnswerProps) {
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    if (!editMode) return;
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };

  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!dragging.current) return;
      onDelta(question.id, e.clientX - last.current.x, e.clientY - last.current.y);
      last.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [question.id, onDelta]);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        left: `${question.x}%`,
        top:  `${question.y}%`,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        cursor: editMode ? "move" : "default",
        maxWidth: `${question.maxWidth ?? 78}%`,
        zIndex: 5,
        userSelect: "none",
      }}
    >
      {editMode && (
        <div style={{
          position: "absolute", top: -14, left: 0,
          fontSize: 8, background: "#3b82f6", color: "#fff",
          padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          ✥ {question.id}
        </div>
      )}
      <HandwrittenText text={answer} qId={question.id} profile={profile} variantSeed={variantSeed} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDWRITING LAYER — renders page image + SVG effects + text overlays
// ─────────────────────────────────────────────────────────────────────────────
interface HandwritingLayerProps {
  pages: EvalPage[];
  questions: DetectedQuestion[];
  answers: Record<string, string>;
  profile: StudentProfile;
  variantSeed: number;
  editMode: boolean;
  offsets: Record<string, { x: number; y: number }>;
  onOffsetChange: (id: string, dx: number, dy: number) => void;
  pageIndex?: number; // undefined = render all (for print)
}

function HandwritingLayer({
  pages, questions, answers, profile, variantSeed,
  editMode, offsets, onOffsetChange, pageIndex,
}: HandwritingLayerProps) {
  const pagesToRender = pageIndex !== undefined ? [pages[pageIndex]].filter(Boolean) : pages;

  return (
    <>
      {pagesToRender.map((page, renderIdx) => {
        const pi = pageIndex !== undefined ? pageIndex : renderIdx;
        const pageQ = questions.filter(q => q.pageIndex === pi);

        return (
          <div
            key={pi}
            className="relative bg-white"
            style={{
              width: "100%",
              aspectRatio: "210/297",
              overflow: "hidden",
              pageBreakAfter: renderIdx < pagesToRender.length - 1 ? "always" : "auto",
            }}
          >
            {/* Real evaluation page image */}
            {page.base64 && (
              <img
                src={page.base64}
                alt={`Page ${pi + 1}`}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }}
                draggable={false}
              />
            )}

            {/* SVG realism layer: ratures, blanco, smudges */}
            <PageRealism pi={pi} pageQ={pageQ} answers={answers} profile={profile} variantSeed={variantSeed} />

            {/* Text overlays */}
            {pageQ.map(q => {
              const ans = answers[q.id] ?? "";
              if (!ans) return null;
              const off = offsets[q.id] ?? { x: 0, y: 0 };
              return (
                <DraggableAnswer
                  key={q.id}
                  question={q}
                  answer={ans}
                  profile={profile}
                  variantSeed={variantSeed}
                  editMode={editMode}
                  offset={off}
                  onDelta={onOffsetChange}
                />
              );
            })}

            {editMode && (
              <div style={{
                position: "absolute", inset: 0, border: "2px dashed #3b82f6",
                pointerEvents: "none", borderRadius: 2,
              }} />
            )}
          </div>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FINGERPRINT BADGE — shows analysis quality
// ─────────────────────────────────────────────────────────────────────────────
function FingerprintBadge({ fp }: { fp?: HandwritingFingerprint }) {
  if (!fp) return null;
  const score = fp.confidenceScore ?? 0;
  const color = score >= 75 ? "bg-green-400" : score >= 55 ? "bg-yellow-400" : "bg-orange-300";
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 ${color} border-2 border-black rounded-lg`}>
      <Eye className="h-3 w-3" />
      <span className="text-[9px] font-black">
        Empreinte {score}% — {score >= 75 ? "Haute fidélité" : score >= 55 ? "Bonne fidélité" : "Fidélité partielle"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {

  const [step, setStep] = useState<WorkflowStep>("import");

  // Evaluation
  const [evalPages, setEvalPages]     = useState<EvalPage[]>([]);
  const [isRealUpload, setIsRealUpload] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [usePreloaded, setUsePreloaded] = useState(false);

  // Questions
  const [questions, setQuestions]   = useState<DetectedQuestion[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectErr, setDetectErr]   = useState("");

  // Students
  const [savedProfiles, setSavedProfiles] = useState<StudentProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<StudentProfile>(defaultProfile());
  const [isSaving, setIsSaving]     = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mongoOk, setMongoOk]       = useState(false);

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

  // ── PDF.js
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

  // ── Load student profiles
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
    } catch { /* fallback to localStorage */ }
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
    try { await fetch(`/api/students?name=${encodeURIComponent(name)}`, { method: "DELETE" }); } catch { /* ignore */ }
    setSavedProfiles(prev => {
      const n = prev.filter(p => p.name !== name);
      localStorage.setItem("student_profiles_v3", JSON.stringify(n));
      return n;
    });
  };

  // ── Deep handwriting analysis — uses the enhanced Gemini Vision API
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

        // Map suggested font/color to our keys
        const fontKey  = FONT_KEY_MAP[s.suggestedFont?.toLowerCase()] ?? "homemade-apple";
        const inkColor = s.suggestedColor?.startsWith("#")
          ? s.suggestedColor
          : (COLOR_MAP[s.suggestedColor?.toLowerCase()] ?? activeProfile.inkColor);

        setActiveProfile(prev => ({
          ...prev,
          hwImage: b64,
          hwImageName: fileName,
          // ── Apply fingerprint-derived params to profile fields
          fontKey,
          inkColor,
          fontSize:            s.suggestedSize      ?? prev.fontSize,
          rotationAngle:       s.suggestedRotation  ?? prev.rotationAngle,
          skewAngle:           s.suggestedRotation  ?? prev.skewAngle,
          messinessIntensity:  s.messinessIntensity ?? prev.messinessIntensity,
          enableUnreadableLetters: s.enableUnreadableLetters ?? prev.enableUnreadableLetters,
          letterCaseChaos:     s.letterCaseChaos    ?? prev.letterCaseChaos,
          penThickness:        s.penThickness        ?? prev.penThickness,
          lineWobbleAmp:       s.baselineWobbleAmp  ?? prev.lineWobbleAmp,
          // Apply inferred realism settings
          raturesRate:  s.inferredRaturesRate ?? prev.raturesRate,
          blancoRate:   s.inferredBlancoRate  ?? prev.blancoRate,
          enableRatures: (s.inferredRaturesRate ?? 0) > 0.01 ? true : prev.enableRatures,
          enableBlanco:  (s.inferredBlancoRate  ?? 0) > 0.005 ? true : prev.enableBlanco,
          enableSmudges: (s.inferredSmudgeFreq  ?? 0) > 0.15 ? true : prev.enableSmudges,
          // ── Store full fingerprint for the renderer
          fingerprint: s,
          analysisDescription: s.analysisDescription,
          confidenceScore:     s.confidenceScore,
        }));
      }
    } catch (err) { console.error("analyze:", err); }
    setIsAnalyzing(false);
  };

  // ── Upload evaluation PDF/image
  const handleEvalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQuestions([]); setAnswers({}); setIsRealUpload(true); setUsePreloaded(false);
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
            const vp   = page.getViewport({ scale: 2.0 });
            const cv   = document.createElement("canvas");
            const ctx  = cv.getContext("2d")!;
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
    setAnswers({}); setQuestions([]);
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
          questions, criteriaLevel,
          studentName: activeProfile.name,
          variantSeed,
          pdfPagesBase64: evalPages.map(p => p.base64),
          saveSession: true,
        }),
      });
      const d = await r.json();
      if (d.success && d.answers) {
        setAnswers(d.answers);
        setOffsets({});
        setPreviewPage(0);
        setStep("preview");
      } else setGenErr("Erreur lors de la génération.");
    } catch { setGenErr("Erreur de connexion."); }
    setIsGenerating(false);
  };

  const handleOffsetChange = useCallback((id: string, dx: number, dy: number) => {
    setOffsets(prev => ({ ...prev, [id]: { x: (prev[id]?.x || 0) + dx, y: (prev[id]?.y || 0) + dy } }));
  }, []);

  const displayPages: EvalPage[] = usePreloaded
    ? [{ base64: "", pageNum: 1 }]
    : evalPages;

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
            width: 210mm; min-height: 297mm;
            page-break-after: always; position: relative;
            overflow: hidden; background: white;
          }
          #print-root .page-wrap:last-child { page-break-after: auto; }
          @page { margin: 0; size: A4 portrait; }
        }
        #print-root { display: none; }
      `}</style>

      {/* ── Print root (hidden normally, shown on @media print) ── */}
      <div id="print-root">
        {displayPages.map((page, i) => {
          const pageQ = questions.filter(q => q.pageIndex === i);
          return (
            <div key={i} className="page-wrap">
              {page.base64 && (
                <img src={page.base64} alt=""
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }}
                />
              )}
              {/* SVG realism for print */}
              <PageRealism pi={i} pageQ={pageQ} answers={answers} profile={activeProfile} variantSeed={variantSeed} />
              {/* Text answers for print */}
              {pageQ.map(q => {
                const ans = answers[q.id] ?? "";
                if (!ans) return null;
                const off = offsets[q.id] ?? { x: 0, y: 0 };
                return (
                  <div key={q.id} style={{
                    position: "absolute", left: `${q.x}%`, top: `${q.y}%`,
                    transform: `translate(${off.x}px,${off.y}px)`,
                    maxWidth: `${q.maxWidth ?? 78}%`, userSelect: "none",
                  }}>
                    <HandwrittenText text={ans} qId={q.id} profile={activeProfile} variantSeed={variantSeed} />
                  </div>
                );
              })}
            </div>
          );
        })}
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
            <p className="text-[9px] font-bold text-black/50">Évaluations 100% réalistes — Gemini AI + Deep Handwriting Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1 sm:mt-0">
          {activeProfile.fingerprint && <FingerprintBadge fp={activeProfile.fingerprint} />}
          <span className={`text-[10px] font-black border-2 border-black py-1 px-2 rounded-lg ${mongoOk ? "bg-lime-400" : "bg-orange-200"}`}>
            {mongoOk ? "● MONGODB" : "● LOCAL"}
          </span>
          <span className="text-[10px] font-black border-2 border-black py-1 px-2 rounded-lg bg-blue-300">
            ● GEMINI 2.5 FLASH
          </span>
        </div>
      </header>

      {/* ── Step bar ── */}
      <div className="bg-white border-b border-black/10">
        <StepBar current={step} onGoto={setStep} />
      </div>

      {/* ── Main ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">

          {/* ════════════════════════════════════════════
              STEP 1 — IMPORT
          ════════════════════════════════════════════ */}
          {step === "import" && (
            <motion.div key="import" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-6 max-w-3xl mx-auto pt-6"
            >
              <div className="text-center">
                <h2 className="text-3xl font-black">Importer l'évaluation</h2>
                <p className="text-black/50 font-bold text-sm mt-1">PDF multipages ou image — ou choisissez une fiche préchargée</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                  <span className="inline-block bg-blue-400 border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">PDF / IMAGE</span>
                  <label className="block border-4 border-dashed border-black/25 rounded-xl p-8 text-center bg-slate-50 cursor-pointer hover:bg-blue-50 hover:border-black/50 transition relative">
                    <input type="file" accept="application/pdf,image/*" onChange={handleEvalUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    {isPdfLoading
                      ? <RefreshCw className="h-10 w-10 text-blue-400 mx-auto mb-2 animate-spin" />
                      : <Upload className="h-10 w-10 text-black/30 mx-auto mb-2" />}
                    <p className="font-black text-sm">{isPdfLoading ? "Traitement PDF..." : "Cliquez ou glissez ici"}</p>
                    <p className="text-xs text-black/40 mt-1">PDF multipages • PNG • JPG</p>
                  </label>
                </div>
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                  <span className="inline-block bg-yellow-400 border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">PRÉCHARGÉ</span>
                  <div className="space-y-2">
                    {PRELOADED_TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => loadPreloaded(t.id)}
                        className="w-full flex items-center gap-3 p-3 border-2 border-black/20 rounded-xl hover:border-black hover:bg-yellow-50 transition text-left"
                      >
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

          {/* ════════════════════════════════════════════
              STEP 2 — STUDENT SELECTION + PROFILE
          ════════════════════════════════════════════ */}
          {step === "students" && (
            <motion.div key="students" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-5xl mx-auto pt-4"
            >
              <h2 className="text-2xl font-black text-center">Sélectionner l'élève</h2>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Left: saved list */}
                <div className="lg:col-span-2 bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-sm flex items-center gap-1.5"><Users className="h-4 w-4" /> Élèves</h3>
                    <button onClick={loadProfiles} className="p-1 rounded-lg border border-black/20 hover:bg-yellow-50 transition"><RefreshCw className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {savedProfiles.length === 0
                      ? <div className="py-6 text-center text-xs text-black/30 font-bold">Aucun élève</div>
                      : savedProfiles.map(p => (
                        <div key={p.name}
                          onClick={() => setActiveProfile({ ...p, hwImage: p.hwImageBase64 || p.hwImage || null })}
                          className={`flex items-center gap-2 p-2.5 border-2 rounded-xl cursor-pointer transition ${activeProfile.name === p.name ? "border-black bg-yellow-50 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "border-black/15 hover:border-black hover:bg-slate-50"}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-black text-yellow-400 flex items-center justify-center font-black text-sm shrink-0">{p.name[0]?.toUpperCase()}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-xs truncate">{p.name}</p>
                            <p className="text-[9px] text-black/40">{getFontFamily(p.fontKey)}</p>
                            {p.fingerprint && (
                              <p className="text-[8px] text-green-600 font-black">
                                ✦ Empreinte {p.fingerprint.confidenceScore}%
                              </p>
                            )}
                          </div>
                          {activeProfile.name === p.name && <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
                          <button onClick={e => { e.stopPropagation(); deleteProfile(p.name); }}
                            className="p-1 rounded hover:bg-red-100 transition shrink-0">
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                  <button onClick={() => setActiveProfile(defaultProfile())}
                    className="w-full py-2 border-2 border-dashed border-black/20 rounded-xl text-xs font-black text-black/40 hover:border-black hover:text-black hover:bg-yellow-50 transition flex items-center justify-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Nouvel élève
                  </button>
                </div>

                {/* Right: profile editor */}
                <div className="lg:col-span-3 bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4 overflow-y-auto max-h-[80vh]">
                  <h3 className="font-black text-sm flex items-center gap-1.5"><User className="h-4 w-4" /> Profil actif</h3>

                  {/* Name */}
                  <div>
                    <label className="text-[9px] font-black text-black/50">NOM</label>
                    <input type="text" value={activeProfile.name}
                      onChange={e => upd("name", e.target.value)}
                      className="w-full mt-0.5 border-2 border-black rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="Ex: Ahmed Benali..." />
                  </div>

                  {/* ── Handwriting sample upload — triggers Gemini Vision deep analysis */}
                  <div>
                    <label className="text-[9px] font-black text-black/50">
                      ÉCHANTILLON D'ÉCRITURE — Gemini analyse & reproduit fidèlement
                    </label>
                    <label className="mt-0.5 block border-2 border-dashed border-black/20 rounded-xl p-3 text-center cursor-pointer hover:bg-yellow-50 transition relative">
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const r = new FileReader();
                          r.onload = ev => analyzeHandwriting(ev.target?.result as string, f.name);
                          r.readAsDataURL(f);
                        }} />
                      {isAnalyzing
                        ? (
                          <div className="flex flex-col items-center gap-1">
                            <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                            <p className="text-xs font-black text-blue-600">Gemini analyse l'écriture…</p>
                            <p className="text-[9px] text-black/40">Extraction de l'empreinte manuscrite</p>
                          </div>
                        )
                        : activeProfile.fingerprint
                          ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 justify-center">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <span className="text-xs font-black text-green-700">Empreinte extraite — {activeProfile.fingerprint.confidenceScore}% confiance</span>
                              </div>
                              <p className="text-[9px] text-black/50">{activeProfile.hwImageName || "Image analysée"}</p>
                              <p className="text-[9px] text-green-600">Taille:{activeProfile.fingerprint.suggestedSize}px · Inclin:{activeProfile.fingerprint.suggestedRotation}° · Messiness:{activeProfile.fingerprint.messinessIntensity.toFixed(1)}</p>
                            </div>
                          )
                          : (
                            <div className="flex flex-col items-center gap-1">
                              <BookOpen className="h-5 w-5 text-black/30" />
                              <p className="text-xs font-black text-black/50">📸 Photo d'écriture → Gemini extrait l'empreinte complète</p>
                              <p className="text-[9px] text-black/30">Inclinaison · Espacement · Pression · Tremblement · Bavures…</p>
                            </div>
                          )
                      }
                    </label>
                    {activeProfile.analysisDescription && (
                      <p className="text-[9px] text-green-700 font-bold bg-green-50 rounded-lg px-2 py-1 mt-1">
                        ✓ {activeProfile.analysisDescription}
                      </p>
                    )}
                    {/* Show fingerprint details when available */}
                    {activeProfile.fingerprint && (activeProfile.fingerprint.confidenceScore ?? 0) >= 55 && (
                      <div className="mt-1.5 p-2 bg-blue-50 border border-blue-200 rounded-lg grid grid-cols-3 gap-1">
                        {[
                          ["Taille", `${activeProfile.fingerprint.suggestedSize}px`],
                          ["Inclinaison", `${activeProfile.fingerprint.suggestedRotation}°`],
                          ["Messiness", `${activeProfile.fingerprint.messinessIntensity.toFixed(1)}/6`],
                          ["Tremblement", `${activeProfile.fingerprint.baselineWobbleAmp.toFixed(1)}px`],
                          ["Opacité min", `${Math.round(activeProfile.fingerprint.inkOpacityMin * 100)}%`],
                          ["Bavures", `${Math.round(activeProfile.fingerprint.inkBleedRadius * 100)}%`],
                        ].map(([k, v]) => (
                          <div key={k} className="text-center">
                            <p className="text-[7px] font-black text-blue-400 uppercase">{k}</p>
                            <p className="text-[9px] font-black text-blue-800">{v}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Font selection */}
                  <div>
                    <label className="text-[9px] font-black text-black/50">
                      STYLE D'ÉCRITURE {activeProfile.fingerprint ? "(auto-sélectionné par Gemini)" : ""}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 mt-0.5">
                      {HANDWRITING_FONTS.map(f => (
                        <button key={f.key} onClick={() => upd("fontKey", f.key)}
                          className={`px-2 py-1.5 text-[10px] border-2 rounded-lg transition font-bold ${activeProfile.fontKey === f.key ? "border-black bg-yellow-400 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "border-black/15 hover:border-black"}`}
                          style={{ fontFamily: f.family }}
                        >{f.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Ink color */}
                  <div>
                    <label className="text-[9px] font-black text-black/50">COULEUR D'ENCRE</label>
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {INK_COLORS.map(c => (
                        <button key={c.value} title={c.label}
                          onClick={() => upd("inkColor", c.value)}
                          className={`w-6 h-6 rounded-full border-2 transition ${activeProfile.inkColor === c.value ? "border-black scale-110" : "border-transparent hover:border-black"}`}
                          style={{ background: c.value }} />
                      ))}
                      <label className="w-6 h-6 rounded-full border-2 border-black cursor-pointer relative overflow-hidden">
                        <input type="color" value={activeProfile.inkColor} onChange={e => upd("inkColor", e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                        <div className="w-full h-full rounded-full" style={{ background: activeProfile.inkColor }} />
                      </label>
                    </div>
                  </div>

                  {/* Writing quality sliders — shown even if fingerprint active (allow fine-tuning) */}
                  <div>
                    <label className="text-[9px] font-black text-black/50 flex items-center gap-1">
                      <Sliders className="h-3 w-3" /> AJUSTEMENTS MANUELS
                      {activeProfile.fingerprint && <span className="text-blue-500">(priorité à l'empreinte si ≥55%)</span>}
                    </label>
                    <div className="space-y-1.5 mt-1">
                      {[
                        { k: "messinessIntensity" as const, label: "Désordre",    min: 0,  max: 6,   step: 0.1 },
                        { k: "fontSize"           as const, label: "Taille",      min: 11, max: 26,  step: 0.5 },
                        { k: "wordDrift"          as const, label: "Oscillation", min: 0,  max: 5,   step: 0.1 },
                        { k: "lineWobbleAmp"      as const, label: "Tremblement", min: 0,  max: 5,   step: 0.1 },
                        { k: "penThickness"       as const, label: "Épaisseur",   min: 0.5,max: 3.5, step: 0.1 },
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
                    <label className="text-[9px] font-black text-black/50 flex items-center gap-1">
                      <Zap className="h-3 w-3" /> EFFETS RÉALISME
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">

                      {/* Ratures */}
                      <div className={`p-2.5 border-2 rounded-xl transition cursor-pointer ${activeProfile.enableRatures ? "border-black bg-red-50" : "border-black/15"}`}
                        onClick={() => upd("enableRatures", !activeProfile.enableRatures)}>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-4 h-4 rounded border-2 border-black flex items-center justify-center ${activeProfile.enableRatures ? "bg-black" : "bg-white"}`}>
                            {activeProfile.enableRatures && <span className="text-yellow-400 text-[8px] font-black">✓</span>}
                          </div>
                          <p className="text-[10px] font-black">Ratures</p>
                        </div>
                        {activeProfile.enableRatures && (
                          <input type="range" min={0.01} max={0.15} step={0.01}
                            value={activeProfile.raturesRate}
                            onChange={e => { e.stopPropagation(); upd("raturesRate", parseFloat(e.target.value)); }}
                            onClick={e => e.stopPropagation()}
                            className="w-full mt-1.5 accent-red-500 h-1 rounded" />
                        )}
                      </div>

                      {/* Blanco */}
                      <div className={`p-2.5 border-2 rounded-xl transition cursor-pointer ${activeProfile.enableBlanco ? "border-black bg-orange-50" : "border-black/15"}`}
                        onClick={() => upd("enableBlanco", !activeProfile.enableBlanco)}>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-4 h-4 rounded border-2 border-black flex items-center justify-center ${activeProfile.enableBlanco ? "bg-black" : "bg-white"}`}>
                            {activeProfile.enableBlanco && <span className="text-yellow-400 text-[8px] font-black">✓</span>}
                          </div>
                          <p className="text-[10px] font-black">Blanco / Correcteur</p>
                        </div>
                        {activeProfile.enableBlanco && (
                          <input type="range" min={0.01} max={0.1} step={0.01}
                            value={activeProfile.blancoRate}
                            onChange={e => { e.stopPropagation(); upd("blancoRate", parseFloat(e.target.value)); }}
                            onClick={e => e.stopPropagation()}
                            className="w-full mt-1.5 accent-orange-500 h-1 rounded" />
                        )}
                      </div>

                      {/* Smudges */}
                      <div className={`p-2.5 border-2 rounded-xl transition cursor-pointer ${activeProfile.enableSmudges ? "border-black bg-blue-50" : "border-black/15"}`}
                        onClick={() => upd("enableSmudges", !activeProfile.enableSmudges)}>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-4 h-4 rounded border-2 border-black flex items-center justify-center ${activeProfile.enableSmudges ? "bg-black" : "bg-white"}`}>
                            {activeProfile.enableSmudges && <span className="text-yellow-400 text-[8px] font-black">✓</span>}
                          </div>
                          <p className="text-[10px] font-black">Bavures d'encre</p>
                        </div>
                        <p className="text-[9px] text-black/40 mt-0.5">Taches encre naturelles</p>
                      </div>

                      {/* Pressure */}
                      <div className={`p-2.5 border-2 rounded-xl transition cursor-pointer ${activeProfile.enablePressureVar ? "border-black bg-purple-50" : "border-black/15"}`}
                        onClick={() => upd("enablePressureVar", !activeProfile.enablePressureVar)}>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-4 h-4 rounded border-2 border-black flex items-center justify-center ${activeProfile.enablePressureVar ? "bg-black" : "bg-white"}`}>
                            {activeProfile.enablePressureVar && <span className="text-yellow-400 text-[8px] font-black">✓</span>}
                          </div>
                          <p className="text-[10px] font-black">Pression stylo</p>
                        </div>
                        <p className="text-[9px] text-black/40 mt-0.5">Variation d'opacité</p>
                      </div>

                      {/* Wobble */}
                      <div className={`p-2.5 border-2 rounded-xl transition cursor-pointer ${activeProfile.enableLineWobble ? "border-black bg-green-50" : "border-black/15"}`}
                        onClick={() => upd("enableLineWobble", !activeProfile.enableLineWobble)}>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-4 h-4 rounded border-2 border-black flex items-center justify-center ${activeProfile.enableLineWobble ? "bg-black" : "bg-white"}`}>
                            {activeProfile.enableLineWobble && <span className="text-yellow-400 text-[8px] font-black">✓</span>}
                          </div>
                          <p className="text-[10px] font-black">Lignes obliques</p>
                        </div>
                        {activeProfile.enableLineWobble && (
                          <input type="range" min={0} max={5} step={0.1}
                            value={activeProfile.lineWobbleAmp}
                            onChange={e => { e.stopPropagation(); upd("lineWobbleAmp", parseFloat(e.target.value)); }}
                            onClick={e => e.stopPropagation()}
                            className="w-full mt-1.5 accent-green-600 h-1 rounded" />
                        )}
                      </div>

                      {/* Ink dry skip */}
                      <div className={`p-2.5 border-2 rounded-xl transition cursor-pointer ${activeProfile.inkDrySkipping ? "border-black bg-yellow-50" : "border-black/15"}`}
                        onClick={() => upd("inkDrySkipping", !activeProfile.inkDrySkipping)}>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-4 h-4 rounded border-2 border-black flex items-center justify-center ${activeProfile.inkDrySkipping ? "bg-black" : "bg-white"}`}>
                            {activeProfile.inkDrySkipping && <span className="text-yellow-400 text-[8px] font-black">✓</span>}
                          </div>
                          <p className="text-[10px] font-black">Encre qui saute</p>
                        </div>
                        <p className="text-[9px] text-black/40 mt-0.5">Lettres s'effaçant</p>
                      </div>
                    </div>
                  </div>

                  {/* Live preview */}
                  <div className="border-2 border-black/10 rounded-xl p-3 bg-zinc-50 min-h-14">
                    <p className="text-[8px] font-black text-black/25 mb-1">APERÇU ÉCRITURE LIVE :</p>
                    <HandwrittenText
                      text="Voici mon écriture personnelle avec les effets activés pour ce test."
                      qId="preview-live" profile={activeProfile} variantSeed={variantSeed} />
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
                <button
                  onClick={() => {
                    if (isRealUpload && questions.length === 0) setStep("solve");
                    else setStep("grade");
                  }}
                  disabled={!activeProfile.name.trim()}
                  className="flex items-center gap-1.5 px-7 py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition disabled:opacity-50"
                >
                  Continuer <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════
              STEP 3 — GRADE
          ════════════════════════════════════════════ */}
          {step === "grade" && (
            <motion.div key="grade" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-2xl mx-auto pt-6"
            >
              <div className="text-center">
                <h2 className="text-2xl font-black">Note cible</h2>
                <p className="text-sm font-bold text-black/50 mt-1">
                  Niveau pour <span className="text-black">{activeProfile.name}</span>
                  {activeProfile.fingerprint && (
                    <span className="ml-2 text-blue-600">(empreinte {activeProfile.fingerprint.confidenceScore}%)</span>
                  )}
                </p>
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
                  <p className="text-[10px] text-black/40">Chaque variante = réponses différentes pour le même niveau</p>
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

          {/* ════════════════════════════════════════════
              STEP 4 — SOLVE
          ════════════════════════════════════════════ */}
          {step === "solve" && (
            <motion.div key="solve" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-2xl mx-auto pt-6"
            >
              <div className="text-center">
                <h2 className="text-2xl font-black">Résolution AI</h2>
                <p className="text-sm text-black/50 font-bold mt-1">
                  Gemini lit et répond pour <span className="text-black font-black">{activeProfile.name}</span> — niveau {criteriaLevel}
                </p>
              </div>

              {/* Detect questions (real upload only) */}
              {isRealUpload && questions.length === 0 && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2"><Search className="h-4 w-4" /> Étape 1 : Lecture des questions</h3>
                  <p className="text-sm text-black/50">Gemini analyse {evalPages.length} page(s) et détecte toutes les questions.</p>
                  {detectErr && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border-2 border-red-200 rounded-xl">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <p className="text-xs font-bold text-red-600">{detectErr}</p>
                    </div>
                  )}
                  <button onClick={detectQuestions} disabled={isDetecting}
                    className="w-full py-4 bg-blue-500 text-white border-2 border-black rounded-2xl font-black text-sm shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition flex items-center justify-center gap-2 disabled:opacity-60">
                    {isDetecting ? <><RefreshCw className="h-5 w-5 animate-spin" /> Analyse en cours…</> : <><Search className="h-5 w-5" /> Détecter les questions</>}
                  </button>
                </div>
              )}

              {/* Questions list */}
              {questions.length > 0 && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-2">
                  <h3 className="font-black flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-600" /> {questions.length} questions détectées</h3>
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

              {/* Generate button */}
              {questions.length > 0 && (
                <div className="bg-white rounded-2xl border-4 border-black p-5 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2"><Sparkles className="h-4 w-4 text-yellow-500" /> Génération des réponses</h3>
                  <div className="flex items-center gap-3 p-3 bg-yellow-50 border-2 border-black/10 rounded-xl">
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-yellow-400 font-black text-sm">{activeProfile.name[0]?.toUpperCase()}</div>
                    <div>
                      <p className="font-black text-sm">{activeProfile.name}</p>
                      <p className="text-[9px] text-black/40">
                        Niveau {criteriaLevel} • Var.{variantSeed} • {getFontFamily(activeProfile.fontKey)}
                        {activeProfile.fingerprint && ` • Empreinte ${activeProfile.fingerprint.confidenceScore}%`}
                      </p>
                    </div>
                  </div>
                  {genErr && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border-2 border-red-200 rounded-xl">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <p className="text-xs font-bold text-red-600">{genErr}</p>
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

          {/* ════════════════════════════════════════════
              STEP 5 — PREVIEW
          ════════════════════════════════════════════ */}
          {step === "preview" && (
            <motion.div key="preview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-4"
            >
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black">
                  Aperçu — {activeProfile.name}
                  {activeProfile.fingerprint && (
                    <span className="ml-2 text-sm font-bold text-blue-600">
                      (empreinte {activeProfile.fingerprint.confidenceScore}%)
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setEditMode(m => !m)}
                    className={`flex items-center gap-1.5 px-3 py-2 border-2 border-black rounded-xl font-black text-xs transition ${editMode ? "bg-blue-400 shadow-[2px_2px_0_rgba(0,0,0,1)]" : "bg-white hover:bg-blue-50"}`}>
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
                    className="flex items-center gap-2 px-4 py-2 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-none transition">
                    <Printer className="h-3.5 w-3.5" /> Imprimer
                  </button>
                </div>
              </div>

              {/* Page thumbnails */}
              {displayPages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {displayPages.map((pg, i) => (
                    <button key={i} onClick={() => setPreviewPage(i)}
                      className={`shrink-0 relative border-2 rounded-lg overflow-hidden transition ${previewPage === i ? "border-black shadow-[2px_2px_0_rgba(0,0,0,1)] scale-105" : "border-black/20 hover:border-black"}`}
                      style={{ width: 64 }}
                    >
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

              {/* Main preview + sidebar */}
              <div className="flex gap-4 items-start">
                <div className="flex-1 max-w-2xl mx-auto shadow-2xl rounded-lg overflow-hidden">
                  <HandwritingLayer
                    pages={displayPages}
                    questions={questions}
                    answers={answers}
                    profile={activeProfile}
                    variantSeed={variantSeed}
                    editMode={editMode}
                    offsets={offsets}
                    onOffsetChange={handleOffsetChange}
                    pageIndex={previewPage}
                  />
                </div>

                {/* Answer editor sidebar */}
                <div className="w-64 shrink-0 hidden xl:block">
                  <div className="bg-white rounded-2xl border-4 border-black p-4 shadow-[4px_4px_0_rgba(0,0,0,1)] space-y-3 sticky top-24">
                    <h3 className="font-black text-xs flex items-center gap-1.5"><Edit3 className="h-3.5 w-3.5" /> Réponses — p.{previewPage + 1}</h3>
                    <div className="space-y-2 max-h-[65vh] overflow-y-auto">
                      {questions.filter(q => q.pageIndex === previewPage).map(q => (
                        <div key={q.id}>
                          <label className="text-[8px] font-black text-black/40 block truncate">{q.text.substring(0, 45)}…</label>
                          <textarea
                            value={answers[q.id] ?? ""}
                            onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            rows={3}
                            className="w-full border-2 border-black/15 rounded-lg p-2 text-xs focus:outline-none focus:border-black resize-none mt-0.5"
                          />
                        </div>
                      ))}
                      {questions.filter(q => q.pageIndex === previewPage).length === 0 && (
                        <p className="text-xs text-black/30 text-center py-4">Aucune réponse pour cette page</p>
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

          {/* ════════════════════════════════════════════
              STEP 6 — PRINT
          ════════════════════════════════════════════ */}
          {step === "print" && (
            <motion.div key="print" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-5 max-w-xl mx-auto pt-6"
            >
              <div className="text-center">
                <h2 className="text-2xl font-black">Impression</h2>
                <p className="text-sm text-black/50 font-bold mt-1">Toutes les pages — 100% réaliste</p>
              </div>

              <div className="bg-white rounded-2xl border-4 border-black p-6 shadow-[5px_5px_0_rgba(0,0,0,1)] space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Élève",           activeProfile.name],
                    ["Niveau",          `${criteriaLevel}/8`],
                    ["Style police",    getFontFamily(activeProfile.fontKey)],
                    ["Pages",           `${displayPages.length} page(s)`],
                    ["Empreinte",       activeProfile.fingerprint ? `${activeProfile.fingerprint.confidenceScore}% confiance` : "Manuelle"],
                    ["Ratures",        activeProfile.enableRatures ? "✓ Activé" : "—"],
                    ["Blanco",         activeProfile.enableBlanco  ? "✓ Activé" : "—"],
                    ["Bavures",        activeProfile.enableSmudges ? "✓ Activé" : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="p-2.5 bg-slate-50 rounded-xl">
                      <p className="text-[9px] font-black text-black/40">{k}</p>
                      <p className="font-black text-sm">{v}</p>
                    </div>
                  ))}
                </div>

                {activeProfile.fingerprint && (
                  <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-xl space-y-1">
                    <p className="font-black text-xs text-blue-800 flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Deep Handwriting Engine actif
                    </p>
                    <p className="text-[9px] text-blue-600">
                      Inclinaison: {activeProfile.fingerprint.suggestedRotation}° •
                      Tremblement: {activeProfile.fingerprint.baselineWobbleAmp.toFixed(1)}px •
                      Pression: {Math.round(activeProfile.fingerprint.inkOpacityMin * 100)}–{Math.round(activeProfile.fingerprint.inkOpacityMax * 100)}%
                    </p>
                    <p className="text-[9px] text-blue-600">
                      16 paramètres extraits de l'écriture réelle de {activeProfile.name}
                    </p>
                  </div>
                )}

                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl space-y-1">
                  <p className="font-black text-sm text-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Prêt pour impression</p>
                  <p className="text-xs text-green-600">✓ Réponses Gemini sur toutes les pages</p>
                  <p className="text-xs text-green-600">✓ Écriture unique à {activeProfile.name}</p>
                  <p className="text-xs text-green-600">✓ Effets réalisme : ratures, pression, wobble, bavures</p>
                  {activeProfile.fingerprint && (
                    <p className="text-xs text-green-600">✓ Empreinte graphologique {activeProfile.fingerprint.confidenceScore}% — haute fidélité</p>
                  )}
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
                  <button onClick={() => { setStep("import"); setEvalPages([]); setQuestions([]); setAnswers({}); }}
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
