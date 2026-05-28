/**
 * Handwriting rendering utilities
 */

import type { Student, WritingSize, WritingStyle } from "../types";

// Font families per writing style
const STYLE_FONTS: Record<WritingStyle, string[]> = {
  clean:     ["Patrick Hand", "Kalam", "Caveat"],
  medium:    ["Kalam", "Bad Script", "Indie Flower"],
  childlike: ["Indie Flower", "Shadows Into Light", "Nothing You Could Do"],
  fast:      ["Caveat", "Dancing Script", "Marck Script"],
  realistic: ["Homemade Apple", "La Belle Aurore", "Satisfy"],
};

// Font size multipliers per writing size
const SIZE_MULT: Record<WritingSize, number> = {
  small:  0.8,
  medium: 1.0,
  large:  1.25,
};

// Messiness per style
const STYLE_MESS: Record<WritingStyle, number> = {
  clean:     1.0,
  medium:    2.0,
  childlike: 3.0,
  fast:      2.5,
  realistic: 2.0,
};

export function pickFont(student: Student, seed: number): string {
  const fonts = STYLE_FONTS[student.writingStyle] || STYLE_FONTS.medium;
  return fonts[seed % fonts.length];
}

export function computeFontSize(student: Student): number {
  return Math.round(student.fontSize * SIZE_MULT[student.writingSize]);
}

export function computeMessiness(student: Student): number {
  return STYLE_MESS[student.writingStyle] * (student.messinessIntensity / 2.5);
}

// Random variation per student seed
export function studentVariation(seed: number, min: number, max: number): number {
  const rng = Math.sin(seed * 9301 + 49297) * 233280;
  const r   = rng - Math.floor(rng);
  return min + r * (max - min);
}

// Build CSS style string for handwriting rendering
export function buildHandwritingStyle(student: Student, seed: number): React.CSSProperties {
  const font   = student.fontKey || pickFont(student, seed);
  const size   = computeFontSize(student);
  const rot    = student.rotationAngle + studentVariation(seed, -0.5, 0.5);
  const space  = student.letterSpacing + studentVariation(seed, -0.2, 0.2);
  const color  = student.inkColor || "#1a3aab";

  return {
    fontFamily: `"${fontKeyToFamily(font)}", cursive`,
    fontSize: `${size}px`,
    color,
    transform: `rotate(${rot}deg)`,
    letterSpacing: `${space}px`,
    lineHeight: "1.8",
  };
}

export function fontKeyToFamily(key: string): string {
  const map: Record<string, string> = {
    "homemade-apple": "Homemade Apple",
    "marck-script":   "Marck Script",
    "parisienne":     "Parisienne",
    "allura":         "Allura",
    "la-belle-aurore":"La Belle Aurore",
    "bad-script":     "Bad Script",
    "caveat":         "Caveat",
    "dancing-script": "Dancing Script",
    "sacramento":     "Sacramento",
    "satisfy":        "Satisfy",
    "great-vibes":    "Great Vibes",
    "kalam":          "Kalam",
    "indie-flower":   "Indie Flower",
    "shadows":        "Shadows Into Light",
    "patrick-hand":   "Patrick Hand",
    "nothing":        "Nothing You Could Do",
  };
  return map[key] || key;
}

export const FONT_OPTIONS = [
  { key: "kalam",          label: "Kalam",              preview: "Bonjour tout le monde" },
  { key: "caveat",         label: "Caveat",             preview: "Bonjour tout le monde" },
  { key: "patrick-hand",   label: "Patrick Hand",       preview: "Bonjour tout le monde" },
  { key: "indie-flower",   label: "Indie Flower",       preview: "Bonjour tout le monde" },
  { key: "bad-script",     label: "Bad Script",         preview: "Bonjour tout le monde" },
  { key: "dancing-script", label: "Dancing Script",     preview: "Bonjour tout le monde" },
  { key: "shadows",        label: "Shadows Into Light", preview: "Bonjour tout le monde" },
  { key: "homemade-apple", label: "Homemade Apple",     preview: "Bonjour tout le monde" },
  { key: "marck-script",   label: "Marck Script",       preview: "Bonjour tout le monde" },
  { key: "satisfy",        label: "Satisfy",            preview: "Bonjour tout le monde" },
  { key: "la-belle-aurore","label": "La Belle Aurore",  preview: "Bonjour tout le monde" },
];

export const WRITING_SIZE_LABELS: Record<WritingSize, string> = {
  small:  "Petite",
  medium: "Moyenne",
  large:  "Grande",
};

export const WRITING_STYLE_LABELS: Record<WritingStyle, string> = {
  clean:     "Propre",
  medium:    "Moyen",
  childlike: "Enfantin",
  fast:      "Rapide",
  realistic: "Réaliste",
};

export const GRADE_APPRECIATIONS: Record<number, string> = {
  8: "Excellent",
  7: "Très bien",
  6: "Bien",
  5: "Assez bien",
  4: "Satisfaisant",
  3: "Passable",
  2: "Insuffisant",
  1: "Très insuffisant",
  0: "Non rendu",
};

export const LEVEL_NOTES: Record<string, number> = {
  "7-8": 7,
  "5-6": 5,
  "3-4": 3,
  "1-2": 1,
};
