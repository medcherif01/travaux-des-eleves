/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * nanobanana PRO — Application principale
 * Workflow: Import éval → Gemini lit questions → Génère réponses → Overlay sur pages → Impression
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Sparkles,
  Download,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Edit3,
  RefreshCw,
  User,
  Users,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  Save,
  Printer,
  Eye,
  Settings,
  Move,
  BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRELOADED_TEMPLATES, RUBRIC_ANSWERS, EXAM_CRITERIA_LEVELS } from "./templates";
import { CriteriaLevel, WorksheetQuestion } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface StudentProfile {
  _id?: string;
  name: string;
  hwImage: string | null;       // base64 for display
  hwImageBase64?: string;       // alias for MongoDB field
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
  pencilHardness: "HB" | "2B" | "4B" | "2H";
  analysisDescription?: string;
  confidenceScore?: number;
}

interface DetectedQuestion {
  id: string;
  text: string;
  pageIndex: number;
  x: number;   // % from left
  y: number;   // % from top
}

interface EvalPage {
  base64: string;
  pageNum: number;
}

// Workflow step
type WorkflowStep = "import" | "students" | "grade" | "solve" | "preview" | "print";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const HANDWRITING_FONTS = [
  { key: "homemade-apple",  label: "Écolier Naturel",    family: "Homemade Apple",   cssVar: "--font-homemade"   },
  { key: "marck-script",    label: "Cursive Feutre",      family: "Marck Script",     cssVar: "--font-marck"     },
  { key: "parisienne",      label: "Cursive Fine",        family: "Parisienne",       cssVar: "--font-parisienne" },
  { key: "allura",          label: "Cursive Fluide",      family: "Allura",           cssVar: "--font-allura"    },
  { key: "la-belle-aurore", label: "Cursive Stylée",      family: "La Belle Aurore",  cssVar: "--font-la-belle"  },
  { key: "bad-script",      label: "Écriture Plume",      family: "Bad Script",       cssVar: "--font-badscript" },
];

const INK_COLORS = [
  { label: "Bleu stylo",   value: "#1d3278" },
  { label: "Bleu royal",   value: "#1e40af" },
  { label: "Bleu marine",  value: "#172554" },
  { label: "Noir encre",   value: "#1c1c1e" },
  { label: "Noir profond", value: "#0a0a0a" },
  { label: "Rouge bordeaux", value: "#be0000" },
  { label: "Vert forêt",  value: "#0a7a2a" },
  { label: "Violet",       value: "#6b21a8" },
  { label: "Bleu-vert",    value: "#0e7490" },
  { label: "Brun sépia",   value: "#78350f" },
  { label: "Gris foncé",   value: "#374151" },
  { label: "Indigo",       value: "#3730a3" },
];

function getFontFamily(key: string): string {
  return HANDWRITING_FONTS.find(f => f.key === key)?.family || "Homemade Apple";
}
function getFontVar(key: string): string {
  return HANDWRITING_FONTS.find(f => f.key === key)?.cssVar || "--font-homemade";
}

function defaultProfile(name = "Élève 1"): StudentProfile {
  return {
    name,
    hwImage: null,
    hwImageBase64: "",
    hwImageName: "",
    fontKey: "homemade-apple",
    inkColor: "#1d3278",
    fontSize: 18,
    rotationAngle: -0.5,
    skewAngle: -3,
    wordDrift: 1.5,
    letterSpacing: -0.5,
    messinessIntensity: 2.5,
    enableUnreadableLetters: true,
    letterCaseChaos: true,
    inkDrySkipping: true,
    penThickness: 1.5,
    penType: "ballpoint",
    pencilHardness: "HB",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC HASH
// ─────────────────────────────────────────────────────────────────────────────
function deterministicHash(str: string, index = 0): number {
  let hash = 0;
  const combined = str + index;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) / 2147483647;
}

function studentSeed(studentName: string, qId: string, index = 0): number {
  return deterministicHash(studentName + "_" + qId + "_" + index, index);
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDWRITING RENDERER
// ─────────────────────────────────────────────────────────────────────────────
function renderDeformedText(
  text: string,
  qId: string,
  profile: StudentProfile,
  variantSeed: number
): React.ReactNode {
  if (!text) return null;

  const seed = studentSeed(profile.name + variantSeed, qId);
  const fontList = HANDWRITING_FONTS.map(f => f.key);
  const fontKey = fontList[Math.floor(seed * fontList.length)];
  const rotation = profile.rotationAngle + (seed * 4 - 2);
  const fontSize = Math.max(12, profile.fontSize + (seed * 2.5 - 1.2));
  const slant = profile.skewAngle + (seed * 5 - 2.5);

  const inkCol = profile.inkColor;

  const lines = text.split("\n");
  return (
    <div
      className="flex flex-col ink-soaking select-none"
      style={{ lineHeight: `${fontSize * 1.55}px` }}
    >
      {lines.map((line, lineIdx) => {
        const words = line.split(/\s+/).filter(w => w.length > 0);
        return (
          <div key={lineIdx} className="flex flex-wrap items-center">
            {words.map((word, wordIdx) => {
              const wSeed = studentSeed(profile.name + word, lineIdx * 100 + wordIdx + (qId.charCodeAt(0) || 0));
              const baseWordY = (wSeed - 0.5) * 2 * profile.wordDrift;
              const baseWordRot = (wSeed * 0.8 - 0.4) * 0.5;

              const letters = word.split("").map((char, charIdx) => {
                const cSeed = studentSeed(profile.name + char, wordIdx * 100 + charIdx + lineIdx * 1000);
                let finalChar = char;
                if (profile.letterCaseChaos && cSeed > 0.87 && char.toLowerCase() !== char.toUpperCase()) {
                  finalChar = cSeed > 0.93 ? char.toUpperCase() : char;
                }
                const letterY = (cSeed - 0.5) * profile.messinessIntensity * 2.2;
                const letterX = (cSeed * 0.6 - 0.3) * profile.messinessIntensity * 1.3;
                const letterSkew = slant + (cSeed - 0.5) * profile.messinessIntensity * 4.5;
                const letterSizeMod = (cSeed * 0.8 - 0.4) * profile.messinessIntensity * 1.4;
                const letterRot = (cSeed - 0.5) * profile.messinessIntensity * 5.5;
                let opacity = 1;
                if (profile.inkDrySkipping && cSeed < 0.12) {
                  opacity = 0.45 + cSeed * 2.0;
                }
                return (
                  <span
                    key={charIdx}
                    style={{
                      display: "inline-block",
                      transform: `translate(${letterX}px, ${letterY}px) rotate(${letterRot}deg) skewX(${letterSkew}deg)`,
                      fontSize: `${Math.max(9, fontSize + letterSizeMod)}px`,
                      opacity,
                      marginLeft: charIdx === 0 ? "0px" : `${profile.letterSpacing + (cSeed - 0.5) * 1.2}px`,
                      fontFamily: `var(${getFontVar(fontKey)})`,
                      WebkitTextStroke: profile.penThickness > 1.1 ? `${(profile.penThickness - 1.1) * 0.35}px ${inkCol}` : "0px",
                      color: inkCol,
                      textShadow: `0.1px 0.1px 0.1px rgba(0,0,0,0.15)`,
                    }}
                    className="select-none inline-block"
                  >
                    {finalChar}
                  </span>
                );
              });

              return (
                <span
                  key={wordIdx}
                  style={{
                    display: "inline-block",
                    transform: `translateY(${baseWordY}px) rotate(${baseWordRot}deg)`,
                    marginRight: `${6 + (wSeed - 0.5) * 5 + profile.messinessIntensity * 1.5}px`,
                    whiteSpace: "nowrap",
                  }}
                  className="inline-block"
                >
                  {letters}
                </span>
              );
            })}
            {words.length === 0 && <div style={{ height: `${fontSize}px` }} />}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANSWER OVERLAY — draggable answer block placed on eval page
// ─────────────────────────────────────────────────────────────────────────────
interface AnswerOverlayProps {
  question: DetectedQuestion;
  answer: string;
  profile: StudentProfile;
  variantSeed: number;
  editMode: boolean;
  onPositionChange: (qId: string, dx: number, dy: number) => void;
  customOffset: { x: number; y: number };
}

function AnswerOverlay({ question, answer, profile, variantSeed, editMode, onPositionChange, customOffset }: AnswerOverlayProps) {
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editMode) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    onPositionChange(question.id, dx, dy);
    dragStart.current = { x: e.clientX, y: e.clientY };
  }, [question.id, onPositionChange]);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const left = `${question.x}%`;
  const top = `${question.y}%`;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: `translate(${customOffset.x}px, ${customOffset.y}px)`,
        cursor: editMode ? "move" : "default",
        zIndex: 10,
        maxWidth: "80%",
        userSelect: "none",
      }}
      onMouseDown={handleMouseDown}
    >
      {editMode && (
        <div style={{
          position: "absolute",
          top: -18,
          left: 0,
          fontSize: 9,
          background: "#3b82f6",
          color: "white",
          padding: "1px 5px",
          borderRadius: 4,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          ✥ {question.id}
        </div>
      )}
      {renderDeformedText(answer, question.id, profile, variantSeed)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVAL PAGE VIEWER — shows one evaluation page with answer overlays
// ─────────────────────────────────────────────────────────────────────────────
interface EvalPageViewerProps {
  page: EvalPage;
  questions: DetectedQuestion[];
  answers: Record<string, string>;
  profile: StudentProfile;
  variantSeed: number;
  editMode: boolean;
  offsets: Record<string, { x: number; y: number }>;
  onOffsetChange: (qId: string, dx: number, dy: number) => void;
  isRealUpload: boolean;
}

function EvalPageViewer({
  page,
  questions,
  answers,
  profile,
  variantSeed,
  editMode,
  offsets,
  onOffsetChange,
  isRealUpload,
}: EvalPageViewerProps) {
  const pageQuestions = questions.filter(q => q.pageIndex === page.pageNum - 1);

  return (
    <div
      className="relative bg-white shadow-2xl"
      style={{
        width: "100%",
        aspectRatio: "210/297", // A4
        overflow: "hidden",
      }}
    >
      {/* Background: real eval page — NO decorations added */}
      {isRealUpload ? (
        <img
          src={page.base64}
          alt={`Page ${page.pageNum}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      ) : (
        <img
          src={page.base64}
          alt={`Page ${page.pageNum}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Answer overlays — placed directly on evaluation pages */}
      {pageQuestions.map(q => {
        const answer = answers[q.id];
        if (!answer) return null;
        return (
          <AnswerOverlay
            key={q.id}
            question={q}
            answer={answer}
            profile={profile}
            variantSeed={variantSeed}
            editMode={editMode}
            onPositionChange={onOffsetChange}
            customOffset={offsets[q.id] || { x: 0, y: 0 }}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP INDICATOR
// ─────────────────────────────────────────────────────────────────────────────
const STEPS: { key: WorkflowStep; label: string; icon: React.ReactNode }[] = [
  { key: "import",   label: "Importer",  icon: <Upload className="h-4 w-4" /> },
  { key: "students", label: "Élève",     icon: <User className="h-4 w-4" /> },
  { key: "grade",    label: "Note",      icon: <BookOpen className="h-4 w-4" /> },
  { key: "solve",    label: "Résoudre",  icon: <Sparkles className="h-4 w-4" /> },
  { key: "preview",  label: "Aperçu",    icon: <Eye className="h-4 w-4" /> },
  { key: "print",    label: "Imprimer",  icon: <Printer className="h-4 w-4" /> },
];

function StepIndicator({ current, onGoTo }: { current: WorkflowStep; onGoTo: (s: WorkflowStep) => void }) {
  const currentIdx = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap py-2">
      {STEPS.map((step, idx) => {
        const isActive = step.key === current;
        const isDone = idx < currentIdx;
        return (
          <React.Fragment key={step.key}>
            <button
              onClick={() => isDone && onGoTo(step.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-black transition-all
                ${isActive ? "bg-yellow-400 border-black text-black shadow-[3px_3px_0_0_rgba(0,0,0,1)]" :
                  isDone ? "bg-black border-black text-yellow-400 cursor-pointer hover:bg-zinc-800" :
                  "bg-white border-black/20 text-black/40 cursor-not-allowed"}`}
            >
              {isDone ? <CheckCircle className="h-3.5 w-3.5" /> : step.icon}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={`h-0.5 w-4 ${idx < currentIdx ? "bg-black" : "bg-black/20"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Workflow step ─────────────────────────────────────────────────────────
  const [step, setStep] = useState<WorkflowStep>("import");

  // ── Evaluation pages ──────────────────────────────────────────────────────
  const [evalPages, setEvalPages] = useState<EvalPage[]>([]);
  const [isRealUpload, setIsRealUpload] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [usePreloaded, setUsePreloaded] = useState(false);
  const [preloadedTemplateId, setPreloadedTemplateId] = useState("page3");

  // ── Detected questions ────────────────────────────────────────────────────
  const [detectedQuestions, setDetectedQuestions] = useState<DetectedQuestion[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState("");

  // ── Student profiles ──────────────────────────────────────────────────────
  const [savedProfiles, setSavedProfiles] = useState<StudentProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<StudentProfile>(defaultProfile("Élève 1"));
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // ── Grade / criteria level ─────────────────────────────────────────────────
  const [criteriaLevel, setCriteriaLevel] = useState<CriteriaLevel>(CriteriaLevel.LEVEL_5_6);
  const [variantSeed, setVariantSeed] = useState(1);

  // ── Answers ───────────────────────────────────────────────────────────────
  const [generatedAnswers, setGeneratedAnswers] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  // ── Preview controls ──────────────────────────────────────────────────────
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});

  // ── MongoDB availability ──────────────────────────────────────────────────
  const [mongoAvailable, setMongoAvailable] = useState(false);

  // ── Load PDF.js ──────────────────────────────────────────────────────────
  useEffect(() => {
    if ((window as any).pdfjsLib) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    script.async = true;
    script.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    };
    document.body.appendChild(script);
  }, []);

  // ── Load students from MongoDB (or localStorage fallback) ─────────────────
  const loadProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    try {
      const res = await fetch("/api/students");
      const data = await res.json();
      if (data.success) {
        setMongoAvailable(!data.offline);
        if (data.students && data.students.length > 0) {
          const profiles: StudentProfile[] = data.students.map((s: any) => ({
            ...s,
            hwImage: s.hwImageBase64 || null,
          }));
          setSavedProfiles(profiles);
          return;
        }
      }
    } catch (e) {
      console.warn("MongoDB indisponible, fallback localStorage");
    }
    // Fallback localStorage
    try {
      const local = localStorage.getItem("student_profiles_v3");
      if (local) setSavedProfiles(JSON.parse(local));
    } catch { /* ignore */ }
    setIsLoadingProfiles(false);
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // ── Save profile to MongoDB + localStorage ────────────────────────────────
  const saveProfile = async (profile: StudentProfile) => {
    setIsSavingProfile(true);
    try {
      const body = {
        ...profile,
        hwImageBase64: profile.hwImage || profile.hwImageBase64 || "",
      };
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        const updated = data.student ? { ...data.student, hwImage: data.student.hwImageBase64 || null } : profile;
        setSavedProfiles(prev => {
          const filtered = prev.filter(p => p.name.toLowerCase() !== profile.name.toLowerCase());
          const next = [updated, ...filtered];
          localStorage.setItem("student_profiles_v3", JSON.stringify(next));
          return next;
        });
      }
    } catch (e) {
      // localStorage fallback
      setSavedProfiles(prev => {
        const filtered = prev.filter(p => p.name.toLowerCase() !== profile.name.toLowerCase());
        const next = [profile, ...filtered];
        localStorage.setItem("student_profiles_v3", JSON.stringify(next));
        return next;
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const deleteProfile = async (name: string) => {
    try {
      await fetch(`/api/students/${encodeURIComponent(name)}`, { method: "DELETE" });
    } catch { /* ignore */ }
    setSavedProfiles(prev => {
      const next = prev.filter(p => p.name !== name);
      localStorage.setItem("student_profiles_v3", JSON.stringify(next));
      return next;
    });
  };

  // ── Analyze handwriting sample ────────────────────────────────────────────
  const analyzeHandwriting = async (base64Img: string) => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-handwriting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handwritingImage: base64Img, studentName: activeProfile.name }),
      });
      const data = await res.json();
      if (data.success && data.handwritingStyle) {
        const style = data.handwritingStyle;
        const fontKeyMap: Record<string, string> = {
          "homemade apple": "homemade-apple",
          "marck script": "marck-script",
          "parisienne": "parisienne",
          "allura": "allura",
          "la belle aurore": "la-belle-aurore",
          "bad script": "bad-script",
        };
        const colorMap: Record<string, string> = {
          blue: "#1d3278", black: "#1c1c1e", red: "#be0000", green: "#0a7a2a",
        };
        setActiveProfile(prev => ({
          ...prev,
          hwImage: base64Img,
          fontKey: fontKeyMap[style.suggestedFont?.toLowerCase()] || "homemade-apple",
          inkColor: colorMap[style.suggestedColor?.toLowerCase()] || prev.inkColor,
          fontSize: style.suggestedSize || prev.fontSize,
          rotationAngle: typeof style.suggestedRotation === "number" ? style.suggestedRotation : prev.rotationAngle,
          analysisDescription: style.analysisDescription,
          confidenceScore: style.confidenceScore,
        }));
      }
    } catch (e) {
      console.error("Analyse écriture échouée", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Upload evaluation (PDF or image) ─────────────────────────────────────
  const handleEvalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDetectedQuestions([]);
    setGeneratedAnswers({});
    setIsRealUpload(true);
    setUsePreloaded(false);

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setIsPdfLoading(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const typedarray = new Uint8Array(ev.target?.result as ArrayBuffer);
          const pdfjsLib = (window as any).pdfjsLib;
          if (!pdfjsLib) { alert("PDF.js en cours d'initialisation, réessayez."); setIsPdfLoading(false); return; }
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          const pages: EvalPage[] = [];
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (ctx) {
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: ctx, viewport }).promise;
              pages.push({ base64: canvas.toDataURL("image/png"), pageNum });
            }
          }
          if (pages.length > 0) {
            setEvalPages(pages);
            setStep("students");
          }
        } catch (err) { console.error(err); }
        finally { setIsPdfLoading(false); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setEvalPages([{ base64: ev.target?.result as string, pageNum: 1 }]);
        setStep("students");
      };
      reader.readAsDataURL(file);
    }
  };

  // ── Load preloaded template ────────────────────────────────────────────────
  const handleLoadPreloaded = (templateId: string) => {
    setPreloadedTemplateId(templateId);
    setUsePreloaded(true);
    setIsRealUpload(false);
    setDetectedQuestions([]);
    setGeneratedAnswers({});

    // For preloaded templates, we build fake "pages" from the template background
    const template = PRELOADED_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      // Questions are already defined in templates
      const qs: DetectedQuestion[] = (template.questions || []).map(q => ({
        id: q.id,
        text: q.questionText,
        pageIndex: 0,
        x: q.defaultX,
        y: q.defaultY,
      }));
      setDetectedQuestions(qs);
    }
    setStep("students");
  };

  // ── Detect questions from uploaded eval pages ─────────────────────────────
  const detectQuestions = async () => {
    if (evalPages.length === 0) return;
    setIsDetecting(true);
    setDetectError("");
    try {
      const res = await fetch("/api/detect-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfPagesBase64: evalPages.map(p => p.base64) }),
      });
      const data = await res.json();
      if (data.success && data.questions?.length > 0) {
        setDetectedQuestions(data.questions);
        setStep("grade");
      } else {
        setDetectError("Aucune question détectée. Vérifiez que le document est lisible.");
      }
    } catch (e) {
      setDetectError("Erreur de connexion. Vérifiez que le serveur est démarré.");
    } finally {
      setIsDetecting(false);
    }
  };

  // ── Generate answers via Gemini ───────────────────────────────────────────
  const generateAnswers = async () => {
    if (detectedQuestions.length === 0) return;
    setIsGenerating(true);
    setGenerateError("");
    try {
      // For preloaded templates, use RUBRIC_ANSWERS as base then personalize
      if (usePreloaded) {
        const rubric = RUBRIC_ANSWERS[criteriaLevel] || {};
        // Use rubric answers as base but call API for unique per-student version
        const res = await fetch("/api/generate-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questions: detectedQuestions,
            criteriaLevel,
            studentName: activeProfile.name,
            variantSeed,
            pdfPagesBase64: [],
            saveSession: true,
          }),
        });
        const data = await res.json();
        if (data.success && data.answers) {
          setGeneratedAnswers(data.answers);
          setStep("preview");
        } else {
          // Fallback to rubric answers
          setGeneratedAnswers(rubric);
          setStep("preview");
        }
      } else {
        const res = await fetch("/api/generate-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questions: detectedQuestions,
            criteriaLevel,
            studentName: activeProfile.name,
            variantSeed,
            pdfPagesBase64: evalPages.map(p => p.base64),
            saveSession: true,
          }),
        });
        const data = await res.json();
        if (data.success && data.answers) {
          setGeneratedAnswers(data.answers);
          setStep("preview");
        } else {
          setGenerateError("Erreur lors de la génération des réponses.");
        }
      }
    } catch (e) {
      setGenerateError("Erreur de connexion au serveur.");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Handle offset changes ─────────────────────────────────────────────────
  const handleOffsetChange = useCallback((qId: string, dx: number, dy: number) => {
    setOffsets(prev => ({
      ...prev,
      [qId]: { x: (prev[qId]?.x || 0) + dx, y: (prev[qId]?.y || 0) + dy },
    }));
  }, []);

  // ── Build page display — for preloaded use prebuilt canvas ─────────────────
  const getPagesForDisplay = (): EvalPage[] => {
    if (usePreloaded) {
      const template = PRELOADED_TEMPLATES.find(t => t.id === preloadedTemplateId);
      if (template) {
        // Return empty pages — rendered by PreloadedPageRenderer below
        return [{ base64: "", pageNum: 1 }];
      }
    }
    return evalPages;
  };

  const displayPages = getPagesForDisplay();

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col text-black antialiased">

      {/* ── SVG Filters for handwriting effects ── */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="pencil-texture">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="ink-bleed">
            <feTurbulence type="turbulence" baseFrequency="0.05 0.1" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" />
          </filter>
        </defs>
      </svg>

      {/* ── PRINT STYLES — hidden chrome, full page ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { 
            position: fixed !important; 
            inset: 0 !important; 
            z-index: 9999 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          @page { margin: 0; size: A4 portrait; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <header className="bg-white border-b-4 border-black px-6 py-3 flex flex-wrap justify-between items-center sticky top-0 z-50 shadow-[0_4px_0_0_rgba(0,0,0,1)] no-print">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-yellow-400 font-black italic text-xl shadow-[2px_2px_0_0_rgba(250,204,21,1)]">nb</div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-black flex items-center gap-2">
              nanobanana
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400 border-2 border-black font-extrabold shadow-[2px_2px_0_0_rgba(0,0,0,1)]">PRO</span>
            </h1>
            <p className="text-[10px] font-bold text-black/60">Évaluations manuscrites 100% réalistes — Gemini AI + MongoDB</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          <div className={`flex items-center gap-1.5 text-xs font-black border-2 border-black py-1 px-2.5 rounded-xl shadow-[2px_2px_0_0_rgba(0,0,0,1)] ${mongoAvailable ? "bg-lime-400 text-black" : "bg-orange-200 text-black"}`}>
            <span className="h-2 w-2 rounded-full bg-black animate-pulse" />
            <span>{mongoAvailable ? "MONGODB • CONNECTÉ" : "MODE LOCAL"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs bg-blue-400 text-black font-black border-2 border-black py-1 px-2.5 rounded-xl shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            <span className="h-2 w-2 rounded-full bg-black animate-pulse" />
            <span>GEMINI 2.5 FLASH</span>
          </div>
        </div>
      </header>

      {/* ── STEP INDICATOR ── */}
      <div className="bg-white border-b-2 border-black/10 px-4 py-2 no-print">
        <StepIndicator current={step} onGoTo={setStep} />
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — IMPORT EVALUATION
          ════════════════════════════════════════════════════════════════ */}
          {step === "import" && (
            <motion.div key="import"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2 py-4">
                <h2 className="text-3xl font-black text-black">Importer l'évaluation</h2>
                <p className="text-black/60 font-bold">Téléversez le PDF ou l'image de l'évaluation, ou choisissez une fiche préchargée</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                {/* Upload card */}
                <div className="bg-white rounded-3xl border-4 border-black p-6 shadow-[6px_6px_0_0_rgba(0,0,0,1)] space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-400 border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">PDF / IMAGE</span>
                    <span className="font-black text-sm">Votre évaluation</span>
                  </div>
                  <label className="block border-4 border-dashed border-black/30 rounded-2xl p-8 text-center bg-slate-50 cursor-pointer hover:bg-blue-50 hover:border-black/60 transition-all relative">
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={handleEvalUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    {isPdfLoading ? (
                      <RefreshCw className="h-12 w-12 text-blue-500 mx-auto mb-3 animate-spin" />
                    ) : (
                      <Upload className="h-12 w-12 text-black/40 mx-auto mb-3" />
                    )}
                    <p className="font-black text-black text-sm">
                      {isPdfLoading ? "Traitement PDF..." : "Cliquez ou glissez ici"}
                    </p>
                    <p className="text-xs text-black/50 mt-1">PDF multipages ou image PNG/JPG</p>
                  </label>
                  <p className="text-xs text-black/50 text-center font-bold">
                    ✓ Gemini lit automatiquement les questions<br/>
                    ✓ Aucune décoration n'est ajoutée aux pages réelles
                  </p>
                </div>

                {/* Preloaded card */}
                <div className="bg-white rounded-3xl border-4 border-black p-6 shadow-[6px_6px_0_0_rgba(0,0,0,1)] space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-yellow-400 border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">PRÉCHARGÉ</span>
                    <span className="font-black text-sm">Fiches Al Kawthar</span>
                  </div>
                  <div className="space-y-2">
                    {PRELOADED_TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleLoadPreloaded(t.id)}
                        className="w-full flex items-center gap-3 p-3 border-2 border-black rounded-xl hover:bg-yellow-50 hover:shadow-[3px_3px_0_0_rgba(0,0,0,1)] transition-all text-left"
                      >
                        <FileText className="h-5 w-5 shrink-0" />
                        <div>
                          <p className="font-black text-xs">Page {t.pageNumber}</p>
                          <p className="text-[10px] text-black/60 font-bold">{t.title}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 ml-auto text-black/40" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 2 — SELECT / CREATE STUDENT
          ════════════════════════════════════════════════════════════════ */}
          {step === "students" && (
            <motion.div key="students"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              <div className="text-center space-y-2 py-4">
                <h2 className="text-3xl font-black">Sélectionner l'élève</h2>
                <p className="text-black/60 font-bold">Choisissez un élève existant ou créez-en un nouveau</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Saved profiles list */}
                <div className="bg-white rounded-3xl border-4 border-black p-6 shadow-[6px_6px_0_0_rgba(0,0,0,1)] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black flex items-center gap-2">
                      <Users className="h-4 w-4" /> Élèves enregistrés
                      <span className="text-xs bg-black text-yellow-400 px-2 py-0.5 rounded-full font-black">{savedProfiles.length}</span>
                    </h3>
                    <button
                      onClick={loadProfiles}
                      className="p-1.5 rounded-lg border-2 border-black hover:bg-yellow-50 transition-all"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {isLoadingProfiles ? (
                    <div className="py-8 text-center">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto text-black/40" />
                      <p className="text-xs font-bold text-black/50 mt-2">Chargement...</p>
                    </div>
                  ) : savedProfiles.length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed border-black/20 rounded-2xl">
                      <Users className="h-10 w-10 text-black/20 mx-auto mb-2" />
                      <p className="text-xs font-bold text-black/40">Aucun élève enregistré</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {savedProfiles.map(p => (
                        <div
                          key={p.name}
                          className={`flex items-center gap-3 p-3 border-2 rounded-xl transition-all cursor-pointer ${activeProfile.name === p.name ? "border-black bg-yellow-50 shadow-[3px_3px_0_0_rgba(0,0,0,1)]" : "border-black/20 hover:border-black hover:bg-slate-50"}`}
                          onClick={() => setActiveProfile({ ...p, hwImage: p.hwImageBase64 || p.hwImage || null })}
                        >
                          <div className="w-9 h-9 rounded-full bg-black flex items-center justify-center text-yellow-400 font-black text-sm shrink-0">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm truncate">{p.name}</p>
                            <p className="text-[10px] text-black/50 font-bold">{getFontFamily(p.fontKey)} • {p.inkColor}</p>
                          </div>
                          {activeProfile.name === p.name && (
                            <CheckCircle className="h-4 w-4 text-black shrink-0" />
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteProfile(p.name); }}
                            className="p-1 rounded-lg hover:bg-red-100 transition-all shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Profile editor */}
                <div className="bg-white rounded-3xl border-4 border-black p-6 shadow-[6px_6px_0_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2">
                    <User className="h-4 w-4" /> Profil actif
                  </h3>

                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-black/60">NOM DE L'ÉLÈVE</label>
                    <input
                      type="text"
                      value={activeProfile.name}
                      onChange={e => setActiveProfile(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Ahmed Benali..."
                      className="w-full border-2 border-black rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                  </div>

                  {/* Handwriting sample upload */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-black/60">ÉCHANTILLON D'ÉCRITURE (OPTIONNEL)</label>
                    <label className="block border-2 border-dashed border-black/30 rounded-xl p-3 text-center cursor-pointer hover:bg-yellow-50 transition-all relative">
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setActiveProfile(prev => ({ ...prev, hwImageName: file.name }));
                          const reader = new FileReader();
                          reader.onload = ev => analyzeHandwriting(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }}
                      />
                      {isAnalyzing ? (
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto text-blue-500" />
                      ) : activeProfile.hwImage ? (
                        <div className="flex items-center gap-2 justify-center">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-xs font-black text-green-700 truncate">{activeProfile.hwImageName || "Écriture chargée"}</span>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 mx-auto text-black/40 mb-1" />
                          <span className="text-xs font-bold text-black/50">Photo d'écriture manuscrite → Gemini l'analyse</span>
                        </>
                      )}
                    </label>
                    {activeProfile.analysisDescription && (
                      <p className="text-[10px] text-green-700 font-bold bg-green-50 rounded-lg px-2 py-1">
                        ✓ {activeProfile.analysisDescription} (confiance: {activeProfile.confidenceScore}%)
                      </p>
                    )}
                  </div>

                  {/* Font selection */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-black/60">STYLE D'ÉCRITURE</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {HANDWRITING_FONTS.map(f => (
                        <button
                          key={f.key}
                          onClick={() => setActiveProfile(prev => ({ ...prev, fontKey: f.key }))}
                          className={`px-2 py-1.5 text-xs border-2 rounded-lg transition-all font-bold ${activeProfile.fontKey === f.key ? "border-black bg-yellow-400 shadow-[2px_2px_0_0_rgba(0,0,0,1)]" : "border-black/20 hover:border-black"}`}
                          style={{ fontFamily: f.family }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ink color */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-black/60">COULEUR D'ENCRE</label>
                    <div className="flex flex-wrap gap-1.5">
                      {INK_COLORS.map(c => (
                        <button
                          key={c.value}
                          title={c.label}
                          onClick={() => setActiveProfile(prev => ({ ...prev, inkColor: c.value }))}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${activeProfile.inkColor === c.value ? "border-black scale-110 shadow-[2px_2px_0_0_rgba(0,0,0,1)]" : "border-white hover:border-black"}`}
                          style={{ background: c.value }}
                        />
                      ))}
                      <div className="relative">
                        <input
                          type="color"
                          value={activeProfile.inkColor}
                          onChange={e => setActiveProfile(prev => ({ ...prev, inkColor: e.target.value }))}
                          className="w-7 h-7 rounded-full border-2 border-black cursor-pointer opacity-0 absolute inset-0"
                        />
                        <div className="w-7 h-7 rounded-full border-2 border-black flex items-center justify-center text-[8px] font-black" style={{ background: activeProfile.inkColor }}>
                          HEX
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Advanced style sliders */}
                  <details className="group">
                    <summary className="cursor-pointer text-[10px] font-black text-black/60 flex items-center gap-1">
                      <Settings className="h-3 w-3" /> PARAMÈTRES AVANCÉS
                    </summary>
                    <div className="mt-2 space-y-2">
                      {[
                        { label: "Taille", key: "fontSize" as const, min: 12, max: 26, step: 0.5 },
                        { label: "Inclinaison", key: "rotationAngle" as const, min: -8, max: 8, step: 0.5 },
                        { label: "Décalage mots", key: "wordDrift" as const, min: 0, max: 5, step: 0.1 },
                        { label: "Messiness", key: "messinessIntensity" as const, min: 0, max: 6, step: 0.1 },
                        { label: "Épaisseur", key: "penThickness" as const, min: 0.5, max: 3, step: 0.1 },
                      ].map(s => (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-black/50 w-20">{s.label}</span>
                          <input
                            type="range" min={s.min} max={s.max} step={s.step}
                            value={activeProfile[s.key] as number}
                            onChange={e => setActiveProfile(prev => ({ ...prev, [s.key]: parseFloat(e.target.value) }))}
                            className="flex-1 h-1.5 rounded accent-black"
                          />
                          <span className="text-[9px] font-black w-8 text-right">{(activeProfile[s.key] as number).toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </details>

                  {/* Handwriting preview */}
                  <div className="border-2 border-black/10 rounded-xl p-3 bg-slate-50 min-h-[60px]">
                    <p className="text-[8px] font-black text-black/30 mb-1">APERÇU :</p>
                    <div>
                      {renderDeformedText("Bonjour, voici mon écriture personnelle.", "preview", activeProfile, variantSeed)}
                    </div>
                  </div>

                  {/* Save button */}
                  <button
                    onClick={() => saveProfile(activeProfile)}
                    disabled={!activeProfile.name.trim() || isSavingProfile}
                    className="w-full py-2.5 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-xs shadow-[4px_4px_0_0_rgba(0,0,0,0.2)] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSavingProfile ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    SAUVEGARDER DANS MONGODB
                  </button>
                </div>
              </div>

              {/* Continue button */}
              <div className="flex justify-center gap-4 pt-2">
                <button
                  onClick={() => setStep("import")}
                  className="flex items-center gap-2 px-6 py-3 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition-all"
                >
                  <ChevronLeft className="h-4 w-4" /> Retour
                </button>
                <button
                  onClick={() => {
                    if (isRealUpload && detectedQuestions.length === 0) {
                      // Need to detect questions first
                      setStep("solve");
                    } else {
                      setStep("grade");
                    }
                  }}
                  disabled={!activeProfile.name.trim()}
                  className="flex items-center gap-2 px-8 py-3 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:translate-y-[1px] hover:shadow-none transition-all disabled:opacity-50"
                >
                  Continuer <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — SELECT GRADE
          ════════════════════════════════════════════════════════════════ */}
          {step === "grade" && (
            <motion.div key="grade"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-6 max-w-3xl mx-auto"
            >
              <div className="text-center space-y-2 py-4">
                <h2 className="text-3xl font-black">Note cible</h2>
                <p className="text-black/60 font-bold">Sélectionnez le niveau pour {activeProfile.name}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {EXAM_CRITERIA_LEVELS.map(lvl => (
                  <button
                    key={lvl.level}
                    onClick={() => setCriteriaLevel(lvl.level)}
                    className={`p-5 border-4 rounded-2xl text-left transition-all ${criteriaLevel === lvl.level ? "border-black bg-yellow-400 shadow-[6px_6px_0_0_rgba(0,0,0,1)] translate-y-[-2px]" : "border-black/20 hover:border-black bg-white hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)]"}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl font-black">{lvl.level}</span>
                      <span className="font-black text-sm">{lvl.title.split("(")[1]?.replace(")", "") || ""}</span>
                      {criteriaLevel === lvl.level && <CheckCircle className="h-5 w-5 ml-auto" />}
                    </div>
                    <p className="text-xs text-black/60 font-bold">{lvl.description}</p>
                  </button>
                ))}
              </div>

              {/* Variant seed */}
              <div className="bg-white rounded-2xl border-2 border-black p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-black text-sm">Variante #{variantSeed}</p>
                  <p className="text-[10px] text-black/50 font-bold">Chaque variante produit des réponses uniques pour le même niveau</p>
                </div>
                <button
                  onClick={() => setVariantSeed(s => (s % 10) + 1)}
                  className="px-3 py-2 bg-black text-yellow-400 rounded-xl font-black text-xs border-2 border-black hover:bg-zinc-800 transition-all flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" /> Changer
                </button>
              </div>

              <div className="flex justify-center gap-4">
                <button onClick={() => setStep("students")} className="flex items-center gap-2 px-6 py-3 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition-all">
                  <ChevronLeft className="h-4 w-4" /> Retour
                </button>
                <button onClick={() => setStep("solve")} className="flex items-center gap-2 px-8 py-3 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:translate-y-[1px] hover:shadow-none transition-all">
                  Résoudre avec Gemini <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 4 — SOLVE: Gemini reads + generates answers
          ════════════════════════════════════════════════════════════════ */}
          {step === "solve" && (
            <motion.div key="solve"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-6 max-w-3xl mx-auto"
            >
              <div className="text-center space-y-2 py-4">
                <h2 className="text-3xl font-black">Résolution AI</h2>
                <p className="text-black/60 font-bold">
                  Gemini lit les questions et génère les réponses pour{" "}
                  <span className="text-black font-black">{activeProfile.name}</span> — niveau {criteriaLevel}
                </p>
              </div>

              {/* Sub-step: detect questions first (only for real uploads) */}
              {isRealUpload && detectedQuestions.length === 0 && (
                <div className="bg-white rounded-3xl border-4 border-black p-6 shadow-[6px_6px_0_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2">
                    <Search className="h-4 w-4" /> Étape 1: Lecture des questions
                  </h3>
                  <p className="text-sm font-bold text-black/60">
                    Gemini va analyser les {evalPages.length} page(s) de l'évaluation et détecter toutes les questions automatiquement.
                  </p>
                  {detectError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border-2 border-red-300 rounded-xl">
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      <p className="text-xs font-bold text-red-600">{detectError}</p>
                    </div>
                  )}
                  <button
                    onClick={detectQuestions}
                    disabled={isDetecting}
                    className="w-full py-4 bg-blue-500 text-white border-2 border-black rounded-2xl font-black text-sm shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                  >
                    {isDetecting ? (
                      <><RefreshCw className="h-5 w-5 animate-spin" /> Gemini analyse les pages...</>
                    ) : (
                      <><Search className="h-5 w-5" /> Détecter les questions</>
                    )}
                  </button>
                </div>
              )}

              {/* Detected questions list */}
              {detectedQuestions.length > 0 && (
                <div className="bg-white rounded-3xl border-4 border-black p-6 shadow-[6px_6px_0_0_rgba(0,0,0,1)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      {detectedQuestions.length} questions détectées
                    </h3>
                    {isRealUpload && (
                      <button
                        onClick={() => { setDetectedQuestions([]); }}
                        className="text-xs font-black text-black/40 hover:text-black flex items-center gap-1 transition-all"
                      >
                        <RotateCcw className="h-3 w-3" /> Relancer
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {detectedQuestions.map((q, i) => (
                      <div key={q.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg border border-black/10">
                        <span className="text-[10px] font-black text-black/50 mt-0.5 shrink-0">Q{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-black truncate">{q.text}</p>
                          <p className="text-[9px] text-black/40">Page {q.pageIndex + 1} • pos ({q.x.toFixed(0)}%, {q.y.toFixed(0)}%)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate button */}
              {detectedQuestions.length > 0 && (
                <div className="bg-white rounded-3xl border-4 border-black p-6 shadow-[6px_6px_0_0_rgba(0,0,0,1)] space-y-4">
                  <h3 className="font-black flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-yellow-500" /> Étape 2: Génération des réponses
                  </h3>
                  <div className="flex items-center gap-3 p-3 bg-yellow-50 border-2 border-black/20 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-yellow-400 font-black text-sm">
                      {activeProfile.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-sm">{activeProfile.name}</p>
                      <p className="text-[10px] text-black/50 font-bold">
                        Niveau {criteriaLevel} • Variante #{variantSeed} • {getFontFamily(activeProfile.fontKey)}
                      </p>
                    </div>
                  </div>

                  {generateError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border-2 border-red-300 rounded-xl">
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      <p className="text-xs font-bold text-red-600">{generateError}</p>
                    </div>
                  )}

                  <button
                    onClick={generateAnswers}
                    disabled={isGenerating}
                    className="w-full py-5 bg-yellow-400 text-black border-4 border-black rounded-2xl font-black text-lg shadow-[6px_6px_0_0_rgba(0,0,0,1)] hover:translate-y-[2px] hover:shadow-[3px_3px_0_0_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                  >
                    {isGenerating ? (
                      <><RefreshCw className="h-6 w-6 animate-spin" /> Gemini génère les réponses...</>
                    ) : (
                      <><Sparkles className="h-6 w-6" /> RÉSOUDRE AVEC GEMINI</>
                    )}
                  </button>
                  <p className="text-[10px] text-center text-black/40 font-bold">
                    Réponses uniques pour {activeProfile.name} • Sauvegardées dans MongoDB
                  </p>
                </div>
              )}

              <div className="flex justify-center gap-4">
                <button onClick={() => setStep("grade")} className="flex items-center gap-2 px-6 py-3 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition-all">
                  <ChevronLeft className="h-4 w-4" /> Retour
                </button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 5 — PREVIEW: See eval pages with handwriting overlaid
          ════════════════════════════════════════════════════════════════ */}
          {step === "preview" && (
            <motion.div key="preview"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 no-print">
                <h2 className="text-xl font-black">Aperçu — {activeProfile.name}</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditMode(m => !m)}
                    className={`flex items-center gap-1.5 px-3 py-2 border-2 border-black rounded-xl font-black text-xs transition-all ${editMode ? "bg-blue-400 shadow-[3px_3px_0_0_rgba(0,0,0,1)]" : "bg-white hover:bg-blue-50"}`}
                  >
                    <Move className="h-3.5 w-3.5" />
                    {editMode ? "Mode Déplacement ON" : "Déplacer textes"}
                  </button>
                  <button
                    onClick={() => setOffsets({})}
                    className="flex items-center gap-1 px-3 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition-all bg-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset positions
                  </button>
                  <button
                    onClick={() => setStep("solve")}
                    className="flex items-center gap-1 px-3 py-2 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition-all bg-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Régénérer
                  </button>
                  <button
                    onClick={() => setStep("print")}
                    className="flex items-center gap-2 px-4 py-2 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-xs shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:translate-y-[1px] hover:shadow-none transition-all"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimer
                  </button>
                </div>
              </div>

              {/* Page navigation */}
              {displayPages.length > 1 && (
                <div className="flex items-center justify-center gap-3 no-print">
                  <button onClick={() => setCurrentPageIdx(p => Math.max(0, p - 1))} disabled={currentPageIdx === 0} className="p-2 border-2 border-black rounded-lg disabled:opacity-30 hover:bg-yellow-50 transition-all">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex gap-1.5">
                    {displayPages.map((_, i) => (
                      <button key={i} onClick={() => setCurrentPageIdx(i)}
                        className={`w-8 h-8 rounded-lg border-2 font-black text-xs transition-all ${i === currentPageIdx ? "border-black bg-yellow-400 shadow-[2px_2px_0_0_rgba(0,0,0,1)]" : "border-black/20 hover:border-black"}`}
                      >{i + 1}</button>
                    ))}
                  </div>
                  <button onClick={() => setCurrentPageIdx(p => Math.min(displayPages.length - 1, p + 1))} disabled={currentPageIdx === displayPages.length - 1} className="p-2 border-2 border-black rounded-lg disabled:opacity-30 hover:bg-yellow-50 transition-all">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Main preview area */}
              <div className="flex gap-4">
                {/* Page preview */}
                <div className="flex-1 max-w-2xl mx-auto">
                  <div
                    id="print-area"
                    className="bg-white shadow-2xl rounded-lg overflow-hidden"
                    style={{ border: editMode ? "2px dashed #3b82f6" : "none" }}
                  >
                    {displayPages.length > 0 && displayPages[currentPageIdx] && (
                      <EvalPageViewer
                        page={displayPages[currentPageIdx]}
                        questions={detectedQuestions}
                        answers={generatedAnswers}
                        profile={activeProfile}
                        variantSeed={variantSeed}
                        editMode={editMode}
                        offsets={offsets}
                        onOffsetChange={handleOffsetChange}
                        isRealUpload={isRealUpload}
                      />
                    )}
                    {/* For preloaded templates with no base64, render a placeholder */}
                    {usePreloaded && (!displayPages[0]?.base64 || displayPages[0].base64 === "") && (
                      <PreloadedPageRenderer
                        templateId={preloadedTemplateId}
                        questions={detectedQuestions}
                        answers={generatedAnswers}
                        profile={activeProfile}
                        variantSeed={variantSeed}
                        editMode={editMode}
                        offsets={offsets}
                        onOffsetChange={handleOffsetChange}
                      />
                    )}
                  </div>
                </div>

                {/* Answer editor sidebar */}
                <div className="w-72 shrink-0 hidden lg:block no-print">
                  <div className="bg-white rounded-2xl border-4 border-black p-4 shadow-[4px_4px_0_0_rgba(0,0,0,1)] space-y-3 sticky top-24">
                    <h3 className="font-black text-sm flex items-center gap-2">
                      <Edit3 className="h-4 w-4" /> Réponses générées
                    </h3>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {detectedQuestions
                        .filter(q => q.pageIndex === currentPageIdx)
                        .map(q => (
                          <div key={q.id} className="space-y-1">
                            <label className="text-[9px] font-black text-black/50 block truncate">{q.text.substring(0, 50)}...</label>
                            <textarea
                              value={generatedAnswers[q.id] || ""}
                              onChange={e => setGeneratedAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                              className="w-full border-2 border-black/20 rounded-lg p-2 text-xs font-bold focus:outline-none focus:border-black resize-none"
                              rows={3}
                            />
                          </div>
                        ))}
                      {detectedQuestions.filter(q => q.pageIndex === currentPageIdx).length === 0 && (
                        <p className="text-xs text-black/40 font-bold text-center py-4">Aucune réponse pour cette page</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-4 no-print pt-2">
                <button onClick={() => setStep("grade")} className="flex items-center gap-2 px-6 py-3 border-2 border-black rounded-xl font-black text-sm hover:bg-yellow-50 transition-all">
                  <ChevronLeft className="h-4 w-4" /> Modifier grade
                </button>
                <button onClick={() => setStep("print")} className="flex items-center gap-2 px-8 py-3 bg-black text-yellow-400 border-2 border-black rounded-xl font-black text-sm shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:translate-y-[1px] hover:shadow-none transition-all">
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 6 — PRINT
          ════════════════════════════════════════════════════════════════ */}
          {step === "print" && (
            <motion.div key="print"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-6 max-w-2xl mx-auto"
            >
              <div className="text-center space-y-2 py-4">
                <h2 className="text-3xl font-black">Impression</h2>
                <p className="text-black/60 font-bold">
                  Résultat 100% réaliste — impression parfaite pour {activeProfile.name}
                </p>
              </div>

              <div className="bg-white rounded-3xl border-4 border-black p-6 shadow-[6px_6px_0_0_rgba(0,0,0,1)] space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-slate-50 rounded-xl border border-black/10">
                    <p className="text-[10px] font-black text-black/50">ÉLÈVE</p>
                    <p className="font-black">{activeProfile.name}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-black/10">
                    <p className="text-[10px] font-black text-black/50">NIVEAU</p>
                    <p className="font-black">{criteriaLevel}/8</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-black/10">
                    <p className="text-[10px] font-black text-black/50">STYLE</p>
                    <p className="font-black">{getFontFamily(activeProfile.fontKey)}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-black/10">
                    <p className="text-[10px] font-black text-black/50">PAGES</p>
                    <p className="font-black">{displayPages.length}</p>
                  </div>
                </div>

                <div className="border-2 border-black/10 rounded-xl p-4 bg-green-50 space-y-2">
                  <p className="font-black text-sm text-green-800 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" /> Prêt pour impression
                  </p>
                  <ul className="text-xs text-green-700 font-bold space-y-1">
                    <li>✓ Réponses générées par Gemini AI selon le niveau {criteriaLevel}</li>
                    <li>✓ Écriture authentique — aucun effet ordinateur visible</li>
                    <li>✓ {isRealUpload ? "Pages originales sans modifications" : "Template préchargé"}</li>
                    <li>✓ Sauvegardé dans MongoDB pour réutilisation</li>
                  </ul>
                </div>

                <button
                  onClick={() => {
                    // All pages printed
                    window.print();
                  }}
                  className="w-full py-5 bg-black text-yellow-400 border-4 border-black rounded-2xl font-black text-xl shadow-[6px_6px_0_0_rgba(250,204,21,1)] hover:translate-y-[2px] hover:shadow-[3px_3px_0_0_rgba(250,204,21,1)] transition-all flex items-center justify-center gap-3"
                >
                  <Printer className="h-6 w-6" /> IMPRIMER
                </button>

                <div className="flex gap-3">
                  <button onClick={() => setStep("preview")} className="flex-1 py-2.5 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition-all flex items-center justify-center gap-1">
                    <ChevronLeft className="h-3.5 w-3.5" /> Aperçu
                  </button>
                  <button
                    onClick={() => {
                      setStep("students");
                      setVariantSeed(s => (s % 10) + 1);
                    }}
                    className="flex-1 py-2.5 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition-all flex items-center justify-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Autre élève
                  </button>
                  <button
                    onClick={() => {
                      setStep("import");
                      setEvalPages([]);
                      setDetectedQuestions([]);
                      setGeneratedAnswers({});
                    }}
                    className="flex-1 py-2.5 border-2 border-black rounded-xl font-black text-xs hover:bg-yellow-50 transition-all flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Nouvelle éval
                  </button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── PRINT-ONLY AREA — all pages ── */}
      <div className="hidden print:block" id="print-area">
        {displayPages.map((page, i) => (
          <div
            key={i}
            className="relative bg-white"
            style={{
              width: "210mm",
              minHeight: "297mm",
              pageBreakAfter: i < displayPages.length - 1 ? "always" : "auto",
              overflow: "hidden",
            }}
          >
            {page.base64 && (
              <img
                src={page.base64}
                alt={`Page ${page.pageNum}`}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
              />
            )}
            {detectedQuestions
              .filter(q => q.pageIndex === i)
              .map(q => {
                const answer = generatedAnswers[q.id];
                if (!answer) return null;
                const off = offsets[q.id] || { x: 0, y: 0 };
                return (
                  <div
                    key={q.id}
                    style={{
                      position: "absolute",
                      left: `${q.x}%`,
                      top: `${q.y}%`,
                      transform: `translate(${off.x}px, ${off.y}px)`,
                      maxWidth: "80%",
                      userSelect: "none",
                    }}
                  >
                    {renderDeformedText(answer, q.id, activeProfile, variantSeed)}
                  </div>
                );
              })}
          </div>
        ))}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRELOADED PAGE RENDERER — renders prebuilt templates with answers
// ─────────────────────────────────────────────────────────────────────────────
interface PreloadedPageRendererProps {
  templateId: string;
  questions: DetectedQuestion[];
  answers: Record<string, string>;
  profile: StudentProfile;
  variantSeed: number;
  editMode: boolean;
  offsets: Record<string, { x: number; y: number }>;
  onOffsetChange: (qId: string, dx: number, dy: number) => void;
}

function PreloadedPageRenderer({ templateId, questions, answers, profile, variantSeed, editMode, offsets, onOffsetChange }: PreloadedPageRendererProps) {
  const template = PRELOADED_TEMPLATES.find(t => t.id === templateId);
  if (!template) return null;

  // Draw the preloaded template background using the canvas approach
  return (
    <div
      className="relative bg-white"
      style={{ width: "100%", aspectRatio: "210/297", overflow: "hidden" }}
    >
      {/* Preloaded background template — simple A4 lined paper */}
      <div
        className="absolute inset-0"
        style={{
          background: "#fafaf9",
          backgroundImage: `linear-gradient(0deg, #e5e7eb 1px, transparent 1px)`,
          backgroundSize: "100% 32px",
        }}
      />
      {/* Template title */}
      <div
        style={{
          position: "absolute",
          top: "3%",
          left: "5%",
          right: "5%",
          fontSize: "10px",
          fontFamily: "var(--font-sans)",
          fontWeight: 900,
          color: "#000",
          borderBottom: "2px solid #000",
          paddingBottom: "4px",
        }}
      >
        {template.title}
      </div>

      {/* Answers */}
      {questions.map(q => {
        const answer = answers[q.id];
        if (!answer) return null;
        const off = offsets[q.id] || { x: 0, y: 0 };
        return (
          <div
            key={q.id}
            style={{
              position: "absolute",
              left: `${q.x}%`,
              top: `${q.y}%`,
              transform: `translate(${off.x}px, ${off.y}px)`,
              maxWidth: "80%",
            }}
          >
            {renderDeformedText(answer, q.id, profile, variantSeed)}
          </div>
        );
      })}
    </div>
  );
}
