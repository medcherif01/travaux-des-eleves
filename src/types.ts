/**
 * nanobanana PRO — Types globaux
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

export type Section  = "garcons" | "filles";
export type Classe   = "PEI1" | "PEI2" | "PEI3" | "PEI4" | "PEI5";
export type WritingSize  = "small" | "medium" | "large";
export type WritingStyle = "clean" | "medium" | "childlike" | "fast" | "realistic";
export type AppPage  = "upload" | "class" | "student" | "preview" | "print";
export type WorkMode = "class" | "student";

export enum CriteriaLevel {
  LEVEL_1_2 = "1-2",
  LEVEL_3_4 = "3-4",
  LEVEL_5_6 = "5-6",
  LEVEL_7_8 = "7-8",
}

export type IBSymbol = "✓" | "✗" | "~" | "?" | "★" | "○" | "△";
export type GradeNote = 0|1|2|3|4|5|6|7|8;

// ── Student ───────────────────────────────────────────────────────────────────

export interface Student {
  _id?: string;
  name: string;
  section: Section;
  classe: Classe;
  // Handwriting
  fontKey: string;
  inkColor: string;
  fontSize: number;
  writingSize: WritingSize;
  writingStyle: WritingStyle;
  rotationAngle: number;
  skewAngle: number;
  wordDrift: number;
  letterSpacing: number;
  messinessIntensity: number;
  enableUnreadableLetters: boolean;
  inkDrySkipping: boolean;
  penThickness: number;
  penType: string;
  hwImageBase64?: string;
  hwImageName?: string;
  analysisDescription?: string;
  confidenceScore?: number;
}

export function makeStudent(name: string, section: Section, classe: Classe): Student {
  return {
    name, section, classe,
    fontKey: "kalam",
    inkColor: "#1a3aab",
    fontSize: 18,
    writingSize: "medium",
    writingStyle: "medium",
    rotationAngle: -0.5,
    skewAngle: -3,
    wordDrift: 1.5,
    letterSpacing: -0.5,
    messinessIntensity: 2.5,
    enableUnreadableLetters: true,
    inkDrySkipping: true,
    penThickness: 1.5,
    penType: "ballpoint",
  };
}

// ── Eval / Questions ──────────────────────────────────────────────────────────

export interface EvalPage {
  pageIndex: number;
  base64: string;          // data:image/... or raw base64
  width: number;
  height: number;
}

export type QuestionType = "open" | "mcq" | "table" | "math" | "science" | "image" | "schema" | "text";

export interface DetectedQuestion {
  id: string;
  text: string;
  type: QuestionType;
  pageIndex: number;
  x: number;
  y: number;
  maxWidth?: number;
  lineHeight?: number;
  maxLines?: number;
  points?: number;         // score points for this question
}

// ── Per-student generated data ────────────────────────────────────────────────

export interface TeacherComment {
  questionId: string;
  comment: string;
  symbol: IBSymbol;
  quality: "excellent" | "incomplete" | "incorrect";
  edited?: boolean;
}

export interface GradeInfo {
  note: GradeNote;         // /8
  ibLevel: CriteriaLevel;
  ibSymbol: IBSymbol;
  appreciation: string;    // "Excellent" | "Bien" | "Assez bien" etc.
}

export interface StudentCopy {
  student: Student;
  answers: Record<string, string>;         // questionId → answer text
  manualAnswers: Record<string, boolean>;  // questionId → is manual override
  comments: TeacherComment[];
  grade: GradeInfo | null;
  level: CriteriaLevel;
  seed: number;
  generatedAt?: Date;
  // Canvas positioning overrides
  offsets: Record<string, { x: number; y: number }>;
  namePos: { x: number; y: number };
}

export function makeStudentCopy(student: Student, level: CriteriaLevel): StudentCopy {
  return {
    student,
    answers: {},
    manualAnswers: {},
    comments: [],
    grade: null,
    level,
    seed: Math.floor(Math.random() * 1000),
    offsets: {},
    namePos: { x: 0, y: 0 },
  };
}

// ── Session state ─────────────────────────────────────────────────────────────

export interface EvalSession {
  evalFileName: string;
  evalPages: EvalPage[];
  questions: DetectedQuestion[];
  docLang: string;           // "fr" | "en"
  // Generated copies
  copies: StudentCopy[];
  // UI state
  selectedStudentIds: string[];
  globalLevel: CriteriaLevel;
}

// ── Generation progress ───────────────────────────────────────────────────────

export type GenStatus = "pending" | "generating" | "done" | "error";

export interface StudentGenProgress {
  studentName: string;
  status: GenStatus;
  progress: number;          // 0–100
  error?: string;
}

// ── Handwriting profile ───────────────────────────────────────────────────────

export interface HandwritingProfile {
  fontKey: string;
  inkColor: string;
  fontSize: number;
  rotationAngle: number;
  skewAngle: number;
  wordDrift: number;
  letterSpacing: number;
  messinessIntensity: number;
  enableUnreadableLetters: boolean;
  inkDrySkipping: boolean;
  penThickness: number;
  penType: string;
}

// ── Art / overlay (kept for print) ────────────────────────────────────────────

export interface OverlayPatch {
  id: string;
  type: "blanco" | "rature";
  pageIndex: number;
  x: number; y: number;
  w: number; h: number;
  rotation: number;
}

export interface GeometryShape {
  id: string;
  kind: "underline" | "circle" | "arrow" | "bracket";
  pageIndex: number;
  x: number; y: number;
  w: number; h: number;
  color: string;
  strokeWidth: number;
}

export interface TeacherNote {
  text: string;
  color: string;
  x: number;
  y: number;
  pageIndex: number;
  rotation: number;
  fontSize: number;
}

// ── IB Criteria ───────────────────────────────────────────────────────────────

export enum CriteriaLevelEnum {
  LEVEL_1_2 = "1-2",
  LEVEL_3_4 = "3-4",
  LEVEL_5_6 = "5-6",
  LEVEL_7_8 = "7-8",
}

export interface WorksheetQuestion {
  id: string;
  number: number;
  questionText: string;
  defaultX: number;
  defaultY: number;
  maxWidth?: number;
  lineHeight?: number;
}

export interface EvaluationTemplate {
  id: string;
  title: string;
  pageNumber: number;
  imageUrl: string;
  questions: WorksheetQuestion[];
}

export interface HandwritingStyle {
  suggestedFont: string;
  suggestedColor: "blue" | "black" | "red" | "green";
  suggestedSize: number;
  suggestedRotation: number;
  confidenceScore: number;
  analysisDescription: string;
}
