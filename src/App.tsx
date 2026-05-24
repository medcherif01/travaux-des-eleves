/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Upload, 
  FileText, 
  Sparkles, 
  Download, 
  RotateCcw, 
  CheckCircle, 
  Layers, 
  AlertCircle, 
  Palette, 
  Edit3,
  Move,
  RefreshCw,
  HelpCircle,
  Trash2,
  User,
  Users,
  Plus,
  PenTool,
  Pencil,
  Droplets
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRELOADED_TEMPLATES, RUBRIC_ANSWERS, EXAM_CRITERIA_LEVELS } from "./templates";
import { CriteriaLevel, WorksheetQuestion, AnswerItem } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface StudentProfile {
  name: string;
  hwImage: string | null;
  hwImageName: string;
  // Handwriting font key (no more standard fonts — only custom script/cursive)
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

interface GeneratedCopy {
  studentName: string;
  answers: { [qId: string]: string };
  profile: StudentProfile;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FONT REGISTRY — Only authentic handwriting fonts, no standards
// ─────────────────────────────────────────────────────────────────────────────

const HANDWRITING_FONTS: { key: string; label: string; family: string; cssVar: string }[] = [
  { key: "homemade-apple",  label: "✍️ Écolier Naturel",       family: "Homemade Apple",   cssVar: "--font-homemade"  },
  { key: "marck-script",    label: "🖋️ Cursive Feutre",         family: "Marck Script",     cssVar: "--font-marck"    },
  { key: "parisienne",      label: "🎀 Cursive Fine",            family: "Parisienne",       cssVar: "--font-parisienne"},
  { key: "allura",          label: "🌸 Cursive Fluide",          family: "Allura",           cssVar: "--font-allura"   },
  { key: "la-belle-aurore", label: "📝 Cursive Stylée",          family: "La Belle Aurore",  cssVar: "--font-la-belle" },
  { key: "bad-script",      label: "✏️ Écriture Plume",          family: "Bad Script",       cssVar: "--font-badscript"},
];

function getFontVar(key: string): string {
  return HANDWRITING_FONTS.find(f => f.key === key)?.cssVar || "--font-homemade";
}

function getFontFamily(key: string): string {
  return HANDWRITING_FONTS.find(f => f.key === key)?.family || "Homemade Apple";
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC HASH — seed-based randomness from string inputs
// ─────────────────────────────────────────────────────────────────────────────

function deterministicHash(str: string, index: number = 0): number {
  let hash = 0;
  const combined = str + index;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) / 2147483647;
}

// Unique per-student per-question seed — ensures completely different outputs
function studentSeed(studentName: string, qId: string, index: number = 0): number {
  return deterministicHash(studentName + "_" + qId + "_" + index, index);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT PROFILE
// ─────────────────────────────────────────────────────────────────────────────

function defaultProfile(name: string = "Élève"): StudentProfile {
  return {
    name,
    hwImage: null,
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
// MAIN APP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {

  // ── Application Modes ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"preload" | "custom">("preload");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("page3");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [criteriaLevel, setCriteriaLevel] = useState<CriteriaLevel>(CriteriaLevel.LEVEL_5_6);

  // ── Student Management ─────────────────────────────────────────────────────
  const [activeStudentName, setActiveStudentName] = useState<string>("Élève 1");
  const [newStudentNameInput, setNewStudentNameInput] = useState<string>("");
  const [examDate, setExamDate] = useState<string>("24 / 05 / 2026");
  const [showStudentHeader, setShowStudentHeader] = useState<boolean>(false);
  const [activeTab2, setActiveTab2] = useState<"profile" | "copies">("profile");

  // ── Saved Profiles ─────────────────────────────────────────────────────────
  const [savedProfiles, setSavedProfiles] = useState<StudentProfile[]>(() => {
    try {
      const data = localStorage.getItem("student_profiles_v3");
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  });

  // ── Current editing profile ────────────────────────────────────────────────
  const [editingProfile, setEditingProfile] = useState<StudentProfile>(() => defaultProfile("Élève 1"));

  // ── Generated copies per student ──────────────────────────────────────────
  const [generatedCopies, setGeneratedCopies] = useState<GeneratedCopy[]>([]);
  const [activeCopyIdx, setActiveCopyIdx] = useState<number>(0);

  // ── Scanner / paper effects ────────────────────────────────────────────────
  const [enableScannerFilter, setEnableScannerFilter] = useState<boolean>(true);
  const [paperType, setPaperType] = useState<"dotted" | "seyyes" | "carreaux" | "blank">("dotted");
  const [scannerPreset, setScannerPreset] = useState<"color-vintage" | "photocopy-grey" | "scanner-high-contrast" | "raw">("color-vintage");
  const [enableGreenUnderlines, setEnableGreenUnderlines] = useState<boolean>(true);
  const [enableSlightTilt, setEnableSlightTilt] = useState<boolean>(true);
  const [enablePaperGrain, setEnablePaperGrain] = useState<boolean>(true);
  const [enablePaperStains, setEnablePaperStains] = useState<boolean>(true);
  const [enableRatures, setEnableRatures] = useState<boolean>(true);
  const [enableDoodles, setEnableDoodles] = useState<boolean>(true);
  const [enableTeacherMarks, setEnableTeacherMarks] = useState<boolean>(true);

  // ── Drawing tools for diagrams ─────────────────────────────────────────────
  const [drawingTool, setDrawingTool] = useState<"pen" | "pencil" | "watercolor" | "crayon">("pen");

  // ── Status ─────────────────────────────────────────────────────────────────
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [showPrintNotice, setShowPrintNotice] = useState<boolean>(false);

  // ── Answers and Layout ─────────────────────────────────────────────────────
  const [editableAnswers, setEditableAnswers] = useState<{ [qId: string]: string }>({});
  const [offsets, setOffsets] = useState<{ [qId: string]: { x: number; y: number } }>({});
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [globalOffsetX, setGlobalOffsetX] = useState<number>(0);
  const [globalOffsetY, setGlobalOffsetY] = useState<number>(0);

  // ── DND ────────────────────────────────────────────────────────────────────
  const [draggedQId, setDraggedQId] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sheetContainerRef = useRef<HTMLDivElement>(null);

  // ── PDF processing ─────────────────────────────────────────────────────────
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(false);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [currentPdfPageIndex, setCurrentPdfPageIndex] = useState<number>(0);
  const [customQuestions, setCustomQuestions] = useState<WorksheetQuestion[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // ── Multiple responses for same grade ─────────────────────────────────────
  const [enableMultipleVariants, setEnableMultipleVariants] = useState<boolean>(true);
  const [variantSeed, setVariantSeed] = useState<number>(1);

  // ── Organically random styles per question ─────────────────────────────────
  const [enableOrganicRandomStyle, setEnableOrganicRandomStyle] = useState<boolean>(true);

  // ── Prompt copy ────────────────────────────────────────────────────────────
  const [promptCopied, setPromptCopied] = useState<boolean>(false);

  // Load PDF.js from CDN
  useEffect(() => {
    if ((window as any).pdfjsLib) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    script.async = true;
    script.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    };
    document.body.appendChild(script);
  }, []);

  // ── Persist profiles ───────────────────────────────────────────────────────
  const persistProfiles = (profiles: StudentProfile[]) => {
    localStorage.setItem("student_profiles_v3", JSON.stringify(profiles));
  };

  const handleSaveStudentProfile = () => {
    if (!editingProfile.name.trim()) return;
    setSavedProfiles(prev => {
      const filtered = prev.filter(p => p.name.toLowerCase() !== editingProfile.name.toLowerCase());
      const updated = [...filtered, { ...editingProfile }];
      persistProfiles(updated);
      return updated;
    });
  };

  const handleLoadStudentProfile = (p: StudentProfile) => {
    setEditingProfile({ ...p });
    setActiveStudentName(p.name);
  };

  const handleDeleteStudentProfile = (name: string) => {
    setSavedProfiles(prev => {
      const filtered = prev.filter(p => p.name !== name);
      persistProfiles(filtered);
      return filtered;
    });
  };

  // ── Update editing profile helper ──────────────────────────────────────────
  const updateProfile = (key: keyof StudentProfile, value: any) => {
    setEditingProfile(prev => ({ ...prev, [key]: value }));
  };

  // ── Active questions ───────────────────────────────────────────────────────
  const activeQuestions = (() => {
    if (activeTab === "preload") {
      const template = PRELOADED_TEMPLATES.find(t => t.id === selectedTemplateId);
      return template ? template.questions : [];
    } else {
      if (pdfPages.length > 0) {
        if (currentPdfPageIndex === 2) return PRELOADED_TEMPLATES[0].questions;
        if (currentPdfPageIndex === 3) return PRELOADED_TEMPLATES[1].questions;
        if (currentPdfPageIndex === 4) return PRELOADED_TEMPLATES[2].questions;
        return [...(analysisResult?.customTemplate?.questions || []), ...customQuestions];
      }
      return [...(analysisResult?.customTemplate?.questions || []), ...customQuestions];
    }
  })();

  // ── Sync answers when template/level changes ───────────────────────────────
  useEffect(() => {
    // If we have a generated copy active, show those answers
    if (generatedCopies.length > 0 && activeCopyIdx < generatedCopies.length) {
      const copy = generatedCopies[activeCopyIdx];
      setEditableAnswers(copy.answers);
      return;
    }
    const answersForLevel = RUBRIC_ANSWERS[criteriaLevel] || {};
    const initial: { [qId: string]: string } = {};
    const initialOffsets: { [qId: string]: { x: number; y: number } } = {};
    activeQuestions.forEach((q) => {
      initial[q.id] = answersForLevel[q.id] || editableAnswers[q.id] || `Réponse à la question ${q.number}`;
      initialOffsets[q.id] = offsets[q.id] || { x: 0, y: 0 };
    });
    setEditableAnswers(prev => {
      const merged = { ...prev };
      activeQuestions.forEach(q => { merged[q.id] = initial[q.id]; });
      return merged;
    });
    setOffsets(prev => {
      const merged = { ...prev };
      activeQuestions.forEach(q => { merged[q.id] = initialOffsets[q.id]; });
      return merged;
    });
  }, [criteriaLevel, activeTab, currentPdfPageIndex, selectedTemplateId, pdfPages.length, customQuestions.length]);

  // ── PDF / Image upload ─────────────────────────────────────────────────────
  const handleWorksheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setIsPdfLoading(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
          const pdfjsLib = (window as any).pdfjsLib;
          if (!pdfjsLib) { alert("PDF.js en cours d'init..."); setIsPdfLoading(false); return; }
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          const extractedPages: string[] = [];
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.8 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (context) {
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: context, viewport }).promise;
              extractedPages.push(canvas.toDataURL("image/png"));
            }
          }
          if (extractedPages.length > 0) {
            setPdfPages(extractedPages);
            setCurrentPdfPageIndex(0);
            setBgImage(extractedPages[0]);
            setActiveTab("custom");
            setCustomQuestions([]);
          }
        } catch (err) { console.error(err); } finally { setIsPdfLoading(false); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPdfPages([]);
        setBgImage(event.target?.result as string);
        setActiveTab("custom");
        setCustomQuestions([]);
      };
      reader.readAsDataURL(file);
    }
  };

  // ── Handwriting image upload → auto-analyze ────────────────────────────────
  const handleHandwritingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateProfile("hwImageName", file.name);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      updateProfile("hwImage", base64);
      await analyzeHandwritingSample(base64);
    };
    reader.readAsDataURL(file);
  };

  const analyzeHandwritingSample = async (base64Img: string) => {
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksheetId: "preload",
          criteriaLevel,
          handwritingImage: base64Img,
          studentName: editingProfile.name,
        }),
      });
      const data = await response.json();
      if (data.success && data.handwritingStyle) {
        const style = data.handwritingStyle;
        // Map returned font to our custom-only list
        const fontKeyMap: Record<string, string> = {
          "homemade apple": "homemade-apple",
          "marck script": "marck-script",
          "parisienne": "parisienne",
          "allura": "allura",
          "la belle aurore": "la-belle-aurore",
          "bad script": "bad-script",
        };
        const mappedFont = fontKeyMap[style.suggestedFont?.toLowerCase()] || "homemade-apple";

        // Parse realistic ink color from Gemini suggestion
        const colorMap: Record<string, string> = {
          blue: "#1d3278",
          black: "#1c1c1e",
          red: "#be0000",
          green: "#0a7a2a",
        };

        setEditingProfile(prev => ({
          ...prev,
          fontKey: mappedFont,
          inkColor: colorMap[style.suggestedColor?.toLowerCase()] || prev.inkColor,
          fontSize: style.suggestedSize || prev.fontSize,
          rotationAngle: typeof style.suggestedRotation === "number" ? style.suggestedRotation : prev.rotationAngle,
          analysisDescription: style.analysisDescription,
          confidenceScore: style.confidenceScore,
        }));
      }
    } catch (e) {
      console.error("Analysis failed", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Gemini: Generate student-specific answers via backend ──────────────────
  const generateStudentAnswers = async (profile: StudentProfile, seed: number = 1) => {
    setIsGenerating(true);
    try {
      const currentTemplate = getActiveTemplate();
      const response = await fetch("/api/generate-student-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksheetId: activeTab === "preload" ? selectedTemplateId : "custom",
          criteriaLevel,
          studentName: profile.name,
          variantSeed: seed,
          customAssessmentImage: activeTab === "custom" ? bgImage : null,
          questions: currentTemplate?.questions?.map(q => ({ id: q.id, text: q.questionText })) || [],
          uploadedSheetImages: pdfPages.length > 0 ? [pdfPages[currentPdfPageIndex]] : (bgImage ? [bgImage] : []),
        }),
      });
      const data = await response.json();
      if (data.success && data.answers) {
        const newCopy: GeneratedCopy = {
          studentName: profile.name,
          answers: data.answers,
          profile: { ...profile },
          timestamp: Date.now(),
        };
        setGeneratedCopies(prev => [...prev, newCopy]);
        setActiveCopyIdx(prev => generatedCopies.length); // point to new copy
        setEditableAnswers(data.answers);
        // Also update the offsets for all questions
        const newOffsets: { [qId: string]: { x: number; y: number } } = {};
        (currentTemplate?.questions || []).forEach(q => { newOffsets[q.id] = { x: 0, y: 0 }; });
        setOffsets(newOffsets);
      }
    } catch (err) {
      console.error("Generation failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Solve custom worksheet ─────────────────────────────────────────────────
  const solveCustomWorksheet = async () => {
    if (!bgImage) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksheetId: "custom",
          criteriaLevel,
          customAssessmentImage: bgImage,
          handwritingImage: editingProfile.hwImage,
          studentName: activeStudentName,
        }),
      });
      const data = await response.json();
      if (data.success) {
        const customQuestionsArr: WorksheetQuestion[] = (data.questions || []).map((q: any, idx: number) => ({
          id: q.id,
          number: idx + 1,
          questionText: q.text,
          defaultX: 15,
          defaultY: 25 + idx * 22,
          maxWidth: 550,
        }));
        const loadedAnswers: { [qId: string]: string } = {};
        (data.questions || []).forEach((q: any) => { loadedAnswers[q.id] = data.answers[q.id] || ""; });
        setEditableAnswers(loadedAnswers);
        setAnalysisResult({
          customTemplate: {
            id: "custom",
            title: "Évaluation Téléversée",
            pageNumber: 1,
            imageUrl: bgImage,
            questions: customQuestionsArr,
          },
        });
      }
    } catch (err) { console.error(err); } finally { setIsGenerating(false); }
  };

  // ── Active template lookup ─────────────────────────────────────────────────
  const getActiveTemplate = () => {
    if (activeTab === "custom") {
      return {
        id: pdfPages.length > 0
          ? (currentPdfPageIndex === 2 ? "page3" : currentPdfPageIndex === 3 ? "page4" : currentPdfPageIndex === 4 ? "page5" : "custom")
          : "custom",
        title: pdfPages.length > 0 ? `PDF - Page ${currentPdfPageIndex + 1}` : "Évaluation Téléversée",
        pageNumber: pdfPages.length > 0 ? currentPdfPageIndex + 1 : 1,
        imageUrl: bgImage || "",
        questions: activeQuestions,
      };
    }
    return PRELOADED_TEMPLATES.find(t => t.id === selectedTemplateId) || null;
  };

  const currentTemplate = getActiveTemplate();
  const currentLevelInfo = EXAM_CRITERIA_LEVELS.find(l => l.level === criteriaLevel);

  // ── Organic style per question (student-aware, truly random per pair) ──────
  const getOrganicStyle = (qId: string, profile: StudentProfile) => {
    // Seed depends on student name + qId + variant seed — different every combination
    const seed = studentSeed(profile.name + variantSeed, qId);
    const fontList = HANDWRITING_FONTS.map(f => f.key);

    const fontKey = enableOrganicRandomStyle
      ? fontList[Math.floor(seed * fontList.length)]
      : profile.fontKey;

    const rotation = profile.rotationAngle + (enableOrganicRandomStyle ? (seed * 4 - 2) : 0);
    const size = profile.fontSize + (enableOrganicRandomStyle ? (seed * 2.5 - 1.2) : 0);
    const slant = profile.skewAngle + (enableOrganicRandomStyle ? (seed * 5 - 2.5) : 0);
    const thickness = Math.max(0.8, profile.penThickness + (enableOrganicRandomStyle ? (seed * 0.7 - 0.35) : 0));

    return { fontKey, rotation, size, slant, thickness };
  };

  // ── Scratch-out rature path (random, organic) ──────────────────────────────
  const getRandomRaturePath = (qId: string, profileName: string) => {
    const seed = Math.floor(studentSeed(profileName, qId) * 6);
    const paths = [
      "M 1 5 Q 12 1, 25 7 T 50 3 T 75 8 T 100 4 T 114 5",
      "M 2 4 C 18 1, 35 9, 55 3 T 85 7 T 110 2",
      "M 1 6 Q 18 8, 30 2 T 60 7 T 90 3 T 115 5",
      "M 3 3 C 20 8, 45 1, 70 8 S 100 2, 114 6",
      "M 1 7 Q 25 2, 45 8 T 70 3 T 95 7 T 113 4",
      "M 2 5 C 15 9, 40 1, 65 7 S 95 3, 114 5",
    ];
    return paths[seed] || paths[0];
  };

  // ── Teacher comment font (random per page) ────────────────────────────────
  const getTeacherFontClass = (qId: string) => {
    const seed = Math.floor(deterministicHash(qId) * 3);
    return ["font-la-belle", "font-marck", "font-badscript"][seed] || "font-la-belle";
  };

  // ── Rature text (fake crossed-out attempt) ────────────────────────────────
  const getRatureForQuestion = (qId: string) => {
    const ratures: Record<string, string> = {
      "ex1_q1": "Correction : 900 x 0.50 = 450 €",
      "ex1_q2": "Consommation par jour = 900 / 30 = 30 kWh",
      "ex1_q3": "Hausse : 135 + 20% = 155 € de plus",
      "ex1_q4": "Conclusion : L'énergie est gratuite",
      "ex2_q1": "Opinion : L'extrait A est scientifique et neutre.",
      "ex2_q2": "L'expert n'a aucune preuve pour ses calculs.",
      "ex2_q3": "Il faut ignorer les rapports officiels d'agences.",
    };
    return ratures[qId] || "Erreur de calcul précédente";
  };

  // ── Ink color for pencil/drawing tools ────────────────────────────────────
  const getToolColor = (profile: StudentProfile) => {
    if (drawingTool === "pencil") {
      const pencilColors: Record<string, string> = {
        HB: "#4a4a4a",
        "2B": "#2e2e2e",
        "4B": "#1a1a1a",
        "2H": "#7a7a7a",
      };
      return pencilColors[profile.pencilHardness] || "#4a4a4a";
    }
    if (drawingTool === "watercolor") return profile.inkColor + "aa"; // transparent
    return profile.inkColor;
  };

  // ── Render a single word with authentic character deformations ─────────────
  const renderWord = (word: string, wordIdx: number, qId: string, profile: StudentProfile, style: { fontKey: string; size: number; slant: number; thickness: number; rotation: number }) => {
    const wordSeed = studentSeed(profile.name + word, wordIdx + (qId.charCodeAt(0) || 0));
    const inkCol = getToolColor(profile);
    const isPencilMode = drawingTool === "pencil";

    const baseWordY = (wordSeed - 0.5) * 2 * profile.wordDrift;
    const baseWordRot = (wordSeed * 0.8 - 0.4) * 0.5;

    const letters = word.split("");
    const renderedLetters = letters.map((char, charIdx) => {
      const cSeed = studentSeed(profile.name + char, wordIdx * 100 + charIdx + (qId.charCodeAt(0) || 0));

      // Case chaos
      let finalChar = char;
      if (profile.letterCaseChaos && cSeed > 0.85 && char.toLowerCase() !== char.toUpperCase()) {
        finalChar = cSeed > 0.92 ? char.toUpperCase() : char.toLowerCase();
      }

      // Per-letter deformations
      const letterY = (cSeed - 0.5) * profile.messinessIntensity * 2.2;
      const letterX = (cSeed * 0.6 - 0.3) * profile.messinessIntensity * 1.3;
      const letterSkew = style.slant + (cSeed - 0.5) * profile.messinessIntensity * 4.5;
      const letterSizeMod = (cSeed * 0.8 - 0.4) * profile.messinessIntensity * 1.4;
      const letterRot = (cSeed - 0.5) * profile.messinessIntensity * 5.5;

      // Ink skip / pressure
      let opacity = 1;
      let textShadow = isPencilMode
        ? `0.3px 0.3px 0.5px rgba(0,0,0,0.3), 0.1px 0.1px 0.2px rgba(0,0,0,0.2)`
        : `0.1px 0.1px 0.1px rgba(0,0,0,0.15)`;

      if (profile.inkDrySkipping && cSeed < 0.12 && !isPencilMode) {
        opacity = 0.45 + cSeed * 2.0;
      } else if (cSeed > 0.94 && !isPencilMode) {
        textShadow = `0px 0px 1.2px ${inkCol}, 0.2px 0.3px 0.3px rgba(0,0,0,0.4)`;
      }
      if (isPencilMode) {
        // Pencil graphite inconsistency
        opacity = 0.6 + cSeed * 0.4;
        if (cSeed > 0.9) opacity = 0.4 + cSeed * 0.3; // lighter patches
      }

      const letterStyle: React.CSSProperties = {
        display: "inline-block",
        transform: `translate(${letterX}px, ${letterY}px) rotate(${letterRot}deg) skewX(${letterSkew}deg)`,
        fontSize: `${Math.max(9, style.size + letterSizeMod)}px`,
        opacity,
        textShadow,
        marginLeft: charIdx === 0 ? "0px" : `${profile.letterSpacing + (cSeed - 0.5) * 1.2}px`,
        fontFamily: `var(${getFontVar(style.fontKey)})`,
        WebkitTextStroke: !isPencilMode && style.thickness > 1.1 ? `${(style.thickness - 1.1) * 0.35}px ${inkCol}` : "0px",
        color: inkCol,
      };

      return <span key={charIdx} style={letterStyle} className="select-none inline-block">{finalChar}</span>;
    });

    const wordStyle: React.CSSProperties = {
      display: "inline-block",
      transform: `translateY(${baseWordY}px) rotate(${baseWordRot}deg)`,
      marginRight: `${6 + (wordSeed - 0.5) * 5 + profile.messinessIntensity * 1.5}px`,
      whiteSpace: "nowrap",
    };

    const keywordsToUnderline = [
      "135", "165", "10", "kWh", "162", "27", "éco", "fiabilité", "aiea",
      "gouvernemental", "rapports", "blogs", "parfaite", "calculs", "erreur", "analyse",
    ];
    const shouldUnderline = keywordsToUnderline.some(kw => word.toLowerCase().includes(kw));

    if (shouldUnderline && enableGreenUnderlines) {
      return (
        <span key={wordIdx} className="relative inline-block" style={wordStyle}>
          <span className="inline-block">{renderedLetters}</span>
          <svg className="absolute left-0 bottom-[-2.5px] w-full h-[6.5px] overflow-visible pointer-events-none select-none" style={{ color: "#16a34a" }} preserveAspectRatio="none" viewBox="0 0 100 10">
            <path d="M 1 5 C 15 2, 40 7, 70 3 C 85 2, 95 6, 99 5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        </span>
      );
    }
    return <span key={wordIdx} style={wordStyle} className="inline-block">{renderedLetters}</span>;
  };

  // ── Render full deformed text ──────────────────────────────────────────────
  const renderDeformedText = (qId: string, text: string, profile: StudentProfile) => {
    if (!text) return null;
    const style = getOrganicStyle(qId, profile);
    const lines = text.split("\n");
    return (
      <div className="flex flex-col space-y-1.5 ink-soaking" style={{ lineHeight: `${(style.size || 18) * 1.5}px` }}>
        {lines.map((line, lineIdx) => {
          const words = line.split(/\s+/).filter(w => w.length > 0);
          return (
            <div key={lineIdx} className="flex flex-wrap items-center">
              {words.map((word, wordIdx) => renderWord(word, lineIdx * 100 + wordIdx, qId, profile, style))}
              {words.length === 0 && <div className="h-4" />}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Handle DND ─────────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent, qId: string) => {
    setDraggedQId(qId);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedQId) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    setOffsets(prev => ({
      ...prev,
      [draggedQId]: { x: (prev[draggedQId]?.x || 0) + dx, y: (prev[draggedQId]?.y || 0) + dy },
    }));
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => setDraggedQId(null);

  const handleResetPositions = () => {
    const reset: { [qId: string]: { x: number; y: number } } = {};
    currentTemplate?.questions.forEach((q: any) => { reset[q.id] = { x: 0, y: 0 }; });
    setOffsets(reset);
    setGlobalOffsetX(0);
    setGlobalOffsetY(0);
  };

  const handleAddCustomTextLine = () => {
    const nextNum = customQuestions.length + 1;
    const newId = `custom_manual_${Date.now()}`;
    const newQ: WorksheetQuestion = {
      id: newId,
      number: nextNum,
      questionText: `Zone d'écriture manuelle #${nextNum}`,
      defaultX: 20,
      defaultY: Math.max(15, (20 + customQuestions.length * 8) % 85),
      maxWidth: 550,
      lineHeight: 24,
    };
    setCustomQuestions(prev => [...prev, newQ]);
    setEditableAnswers(prev => ({ ...prev, [newId]: `Réponse libre #${nextNum}` }));
    setOffsets(prev => ({ ...prev, [newId]: { x: 0, y: 0 } }));
  };

  const handleDeleteQuestion = (qId: string) => {
    setCustomQuestions(prev => prev.filter(q => q.id !== qId));
    setEditableAnswers(prev => { const c = { ...prev }; delete c[qId]; return c; });
  };

  const handleDownloadSheet = () => {
    setShowPrintNotice(true);
    setTimeout(() => setShowPrintNotice(false), 10000);
    window.print();
  };

  // ── Active profile to use in rendering ────────────────────────────────────
  // If a generated copy is active, use that copy's profile; else use editingProfile
  const activeRenderProfile: StudentProfile = (() => {
    if (generatedCopies.length > 0 && activeCopyIdx < generatedCopies.length) {
      return generatedCopies[activeCopyIdx].profile;
    }
    return editingProfile;
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-yellow-400 flex flex-col text-black antialiased" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>

      {/* ── Header ── */}
      <header className="bg-white/90 backdrop-blur-md border-b-4 border-black px-6 py-4 flex flex-wrap justify-between items-center sticky top-0 z-50 shadow-[0_4px_0_0_rgba(0,0,0,1)]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-yellow-400 font-black italic text-xl shadow-[2px_2px_0_0_rgba(250,204,21,1)]">nb</div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black flex items-center gap-2">
              nanobanana
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-yellow-400 border-2 border-black text-black font-extrabold shadow-[2px_2px_0_0_rgba(0,0,0,1)]">PRO</span>
            </h1>
            <p className="text-xs font-bold text-black/70">Génération d'évaluations manuscrites réalistes — Gemini AI</p>
          </div>
        </div>
        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          <div className="flex items-center space-x-1.5 text-xs bg-lime-400 text-black font-black border-2 border-black py-1.5 px-3 rounded-xl shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
            <span className="h-2 w-2 rounded-full bg-black animate-pulse" />
            <span>GEMINI 2.5 FLASH • EN LIGNE</span>
          </div>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ────────────────────────────────────────────────────────────────────
            LEFT SIDEBAR — Controls
        ──────────────────────────────────────────────────────────────────── */}
        <aside className="lg:col-span-5 space-y-6">

          {/* 01 — Source Worksheets */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-black text-black flex items-center gap-2">
                <span className="bg-blue-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">01</span>
                Importer les devoirs
              </h2>
              <div className="flex space-x-1 bg-black p-1 rounded-xl">
                <button
                  onClick={() => { setActiveTab("preload"); setBgImage(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === "preload" ? "bg-yellow-400 text-black border border-black shadow-[2px_2px_0px_rgb(0,0,0)]" : "text-white hover:text-yellow-400"}`}
                >Al Kawthar</button>
                <button
                  onClick={() => setActiveTab("custom")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === "custom" ? "bg-yellow-400 text-black border border-black shadow-[2px_2px_0px_rgb(0,0,0)]" : "text-white hover:text-yellow-400"}`}
                >Autre Fiche</button>
              </div>
            </div>

            {activeTab === "preload" ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-black/70 block">Page à résoudre :</label>
                <div className="grid grid-cols-3 gap-3">
                  {PRELOADED_TEMPLATES.map((t) => (
                    <button key={t.id} onClick={() => setSelectedTemplateId(t.id)}
                      className={`py-3 px-3 text-xs font-black border-2 rounded-2xl text-center transition-all flex flex-col items-center justify-center ${selectedTemplateId === t.id ? "border-black bg-yellow-400 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" : "border-black/20 hover:border-black bg-white hover:bg-yellow-50 text-black"}`}
                    >
                      <FileText className="h-5 w-5 mb-1 text-black shrink-0" />
                      <span>Page {t.pageNumber}</span>
                      <span className="text-[9px] opacity-70 truncate max-w-full font-bold">{t.pageNumber === 3 ? "Exercice 1" : "Exercice 2"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border-4 border-dashed border-black/40 rounded-2xl p-6 bg-slate-50 text-center relative transition hover:bg-yellow-50/50 cursor-pointer">
                  <input type="file" accept="application/pdf,image/*" onChange={handleWorksheetUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  {isPdfLoading ? <RefreshCw className="h-8 w-8 text-black/60 mx-auto mb-2 animate-spin text-blue-500" /> : <Upload className="h-8 w-8 text-black/60 mx-auto mb-2" />}
                  <p className="text-xs font-black text-black">{isPdfLoading ? "Séparation PDF..." : "Téléverser (PDF ou Image)"}</p>
                  <p className="text-[10px] text-black/60 mt-1">PDF complet ou image PNG/JPG</p>
                </div>

                {pdfPages.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-dashed border-black/20">
                    <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider block">📄 Pages extraites :</span>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {pdfPages.map((pageSrc, idx) => (
                        <button key={idx} type="button"
                          onClick={() => { setCurrentPdfPageIndex(idx); setBgImage(pageSrc); }}
                          className={`flex-shrink-0 w-16 border-2 rounded-lg overflow-hidden relative transition-all ${currentPdfPageIndex === idx ? "border-yellow-400 scale-105 shadow-[2px_2px_0px_rgba(0,0,0,1)]" : "border-black/20 hover:border-black"}`}
                        >
                          <img src={pageSrc} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute bottom-0 right-0 left-0 bg-black/75 text-white py-0.5 text-[8.5px] text-center font-black">P. {idx + 1}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  <button type="button" onClick={handleAddCustomTextLine}
                    className="w-full px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 border-2 border-black rounded-xl font-black text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center space-x-1"
                  ><Plus className="h-3.5 w-3.5 mr-1" /><span>AJOUTER UNE ZONE D'ÉCRITURE</span></button>

                  {bgImage && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-blue-50 border-2 border-black rounded-xl">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-lg">🖼️</span>
                        <span className="text-xs font-black text-black truncate">Support chargé</span>
                      </div>
                      <button type="button" onClick={solveCustomWorksheet} disabled={isGenerating}
                        className="w-full sm:w-auto px-4 py-2 bg-black text-white hover:bg-zinc-950 border-2 border-black rounded-xl font-black text-xs shadow-[3px_3px_0px_0px_rgba(59,130,246,1)] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center justify-center space-x-1"
                      >
                        {isGenerating ? <RefreshCw className="h-3 w-3 animate-spin text-yellow-400" /> : <Sparkles className="h-3 w-3 text-yellow-400" />}
                        <span>RÉSOUDRE VIA GEMINI</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 02 — Student Profiles & Handwriting */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-black text-black flex items-center gap-2">
              <span className="bg-pink-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">02</span>
              Gestion des Élèves &amp; Écritures
            </h2>

            {/* Tab switcher */}
            <div className="flex space-x-1 bg-black p-1 rounded-xl">
              <button onClick={() => setActiveTab2("profile")}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 ${activeTab2 === "profile" ? "bg-pink-400 text-black border border-black" : "text-white hover:text-pink-300"}`}
              ><User className="h-3 w-3" /> Profil Actif</button>
              <button onClick={() => setActiveTab2("copies")}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 ${activeTab2 === "copies" ? "bg-pink-400 text-black border border-black" : "text-white hover:text-pink-300"}`}
              ><Users className="h-3 w-3" /> Copies Générées ({generatedCopies.length})</button>
            </div>

            {activeTab2 === "profile" ? (
              <div className="space-y-4">
                {/* Student name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-black/70">Nom de l'élève :</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editingProfile.name}
                      onChange={(e) => updateProfile("name", e.target.value)}
                      placeholder="Ex: Ahmed Benali..."
                      className="flex-1 bg-white border-2 border-black rounded-xl text-xs font-extrabold px-3 py-1.5 focus:outline-none"
                    />
                    <button onClick={handleSaveStudentProfile}
                      className="bg-lime-400 hover:bg-lime-300 border-2 border-black text-black font-black px-3.5 py-1.5 rounded-xl text-xs shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-all hover:-translate-y-0.5"
                      title="Enregistrer le profil sous ce nom"
                    >💾 Sauver</button>
                  </div>
                </div>

                {/* Handwriting sample upload */}
                <div className="border-4 border-dashed border-black/40 rounded-2xl p-4 bg-slate-50 text-center relative transition hover:bg-pink-50/50 cursor-pointer">
                  <input type="file" accept="image/*" onChange={handleHandwritingUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <Upload className="h-6 w-6 text-black/60 mx-auto mb-1" />
                  <p className="text-xs font-black text-black">{editingProfile.hwImageName || "Téléverser l'écriture de l'élève"}</p>
                  <p className="text-[9px] text-black/50 mt-0.5">Photo d'un texte écrit à la main par l'élève</p>
                </div>

                {isAnalyzing && (
                  <div className="flex items-center space-x-2 text-xs font-bold text-black bg-yellow-400 p-3 rounded-xl border-2 border-black">
                    <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                    <span>Analyse de l'écriture par Gemini...</span>
                  </div>
                )}

                {editingProfile.analysisDescription && (
                  <div className="bg-emerald-50 border-2 border-black p-3 rounded-xl space-y-1 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                    <div className="flex items-center text-xs font-black text-black gap-1.5">
                      <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Style Détecté</span>
                      <span className="ml-auto text-[9px] bg-emerald-200 px-2 py-0.5 rounded border border-emerald-400 font-extrabold">Fiabilité : {editingProfile.confidenceScore || 95}%</span>
                    </div>
                    <p className="text-xs font-medium text-emerald-950 leading-relaxed">{editingProfile.analysisDescription}</p>
                  </div>
                )}

                {/* Saved profiles list */}
                {savedProfiles.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-black/10">
                    <p className="text-[10px] text-black font-black uppercase tracking-wider">Profils sauvegardés ({savedProfiles.length}) :</p>
                    <div className="flex flex-col gap-1.5 max-h-[130px] overflow-y-auto pr-1">
                      {savedProfiles.map((p) => (
                        <div key={p.name} className="flex items-center justify-between gap-2 p-1.5 bg-white border-2 border-black/10 hover:border-black rounded-lg transition-all">
                          <button onClick={() => handleLoadStudentProfile(p)}
                            className={`flex-1 text-left px-2 py-0.5 text-xs font-extrabold truncate ${editingProfile.name.toLowerCase() === p.name.toLowerCase() ? "text-purple-600 font-black" : "text-slate-700"}`}
                          >👤 {p.name}</button>
                          <button onClick={() => handleDeleteStudentProfile(p.name)}
                            className="text-red-500 hover:text-white hover:bg-red-500 font-extrabold shrink-0 border border-transparent hover:border-black/30 p-1 text-[10px] rounded"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Generate button */}
                <div className="pt-2 border-t-2 border-dashed border-black/20 space-y-2">
                  <p className="text-[10px] font-black text-black/60">Générer une copie avec Gemini pour cet élève :</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => generateStudentAnswers(editingProfile, variantSeed)}
                      disabled={isGenerating}
                      className="flex-1 px-4 py-2.5 bg-black text-white hover:bg-zinc-900 border-2 border-black rounded-xl font-black text-xs shadow-[3px_3px_0px_0px_rgba(250,204,21,1)] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2"
                    >
                      {isGenerating ? <RefreshCw className="h-3 w-3 animate-spin text-yellow-400" /> : <Sparkles className="h-3 w-3 text-yellow-400" />}
                      Générer Copie {enableMultipleVariants ? `(Var. ${variantSeed})` : ""}
                    </button>
                    {enableMultipleVariants && (
                      <button type="button"
                        onClick={() => { setVariantSeed(s => s + 1); }}
                        className="px-3 py-2 bg-yellow-400 hover:bg-yellow-300 border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                        title="Changer de variante pour une réponse différente"
                      >🔀</button>
                    )}
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input type="checkbox" checked={enableMultipleVariants} onChange={(e) => setEnableMultipleVariants(e.target.checked)} className="h-4 w-4 accent-black" />
                    <span className="text-[10px] font-black text-black">Variantes multiples (différentes réponses, même note)</span>
                  </label>
                </div>
              </div>
            ) : (
              /* Copies tab */
              <div className="space-y-3">
                {generatedCopies.length === 0 ? (
                  <div className="text-center py-8 text-black/40">
                    <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-bold">Aucune copie générée</p>
                    <p className="text-[10px] mt-1">Créez un profil élève et cliquez sur "Générer Copie"</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] text-black/60 font-bold">{generatedCopies.length} copie(s) générée(s) — cliquez pour prévisualiser :</p>
                    <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
                      {generatedCopies.map((copy, idx) => (
                        <button key={copy.timestamp} type="button"
                          onClick={() => {
                            setActiveCopyIdx(idx);
                            setEditableAnswers(copy.answers);
                            setEditingProfile(copy.profile);
                          }}
                          className={`flex items-center gap-3 p-2.5 border-2 rounded-xl text-left transition-all ${activeCopyIdx === idx ? "border-black bg-yellow-400 shadow-[2px_2px_0px_rgba(0,0,0,1)]" : "border-black/10 hover:border-black bg-white"}`}
                        >
                          <div className="w-7 h-7 rounded-full bg-black text-yellow-400 flex items-center justify-center font-black text-xs shrink-0">{idx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black truncate">👤 {copy.studentName}</p>
                            <p className="text-[9px] text-black/50 font-bold">Note {criteriaLevel} • {new Date(copy.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          {activeCopyIdx === idx && <CheckCircle className="h-4 w-4 text-black shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => { setGeneratedCopies([]); setActiveCopyIdx(0); }}
                      className="text-[10px] text-red-500 hover:text-red-700 font-bold underline"
                    >Effacer toutes les copies</button>
                  </>
                )}
              </div>
            )}
          </section>

          {/* 03 — Target Grade */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-black text-black flex items-center gap-2">
                <span className="bg-yellow-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">03</span>
                Note Cible (Critère C)
              </h2>
              <span className="text-[10px] bg-yellow-400 border-2 border-black text-black px-2 py-0.5 rounded-full font-black uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)]">/ 8</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {EXAM_CRITERIA_LEVELS.map((levelObj) => (
                <button key={levelObj.level} onClick={() => setCriteriaLevel(levelObj.level)}
                  className={`py-3 px-2 border-2 rounded-xl text-center transition-all flex flex-col justify-center items-center ${criteriaLevel === levelObj.level ? "border-black bg-rose-400 text-black font-black shadow-[3px_3px_0px_rgba(0,0,0,1)]" : "border-black/20 hover:border-black bg-white hover:bg-rose-50/50 text-black"}`}
                >
                  <span className="text-sm font-black block">{levelObj.level}</span>
                  <span className="text-[8px] uppercase tracking-wider font-extrabold opacity-75 mt-0.5">Note</span>
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={criteriaLevel} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                className="bg-slate-50 border-2 border-black p-4 rounded-xl space-y-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
              >
                <h4 className="text-xs font-black text-black">{currentLevelInfo?.title}</h4>
                <p className="text-[11px] text-black/70 font-bold leading-relaxed">{currentLevelInfo?.description}</p>
                <div className="text-[10px] text-indigo-600 font-black">→ Gemini adapte les réponses selon ce niveau.</div>
              </motion.div>
            </AnimatePresence>
          </section>

          {/* 04 — Handwriting Settings */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-black text-black flex items-center gap-2">
              <span className="bg-purple-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">04</span>
              Réglages Écriture Manuscrite
            </h2>

            {/* Random organic style toggle */}
            <div className="bg-amber-50 border-2 border-amber-400 p-2.5 rounded-xl space-y-1">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input type="checkbox" checked={enableOrganicRandomStyle} onChange={(e) => setEnableOrganicRandomStyle(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-amber-600 cursor-pointer" />
                <span className="text-[11px] font-black text-black leading-tight">🌟 Style Aléatoire par Bloc (Recommandé)</span>
              </label>
              <p className="text-[9px] text-amber-800 leading-normal pl-6">
                Chaque bloc de réponse utilise une police, un angle et une épaisseur différents — 100% compatibles avec l'écriture de l'élève.
              </p>
            </div>

            {/* Quick presets */}
            <div className="bg-purple-50 border-2 border-purple-200 p-3 rounded-xl text-xs space-y-2">
              <span className="font-extrabold text-purple-950 block">✨ Préréglages :</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Écolier Réaliste ❤️", fn: () => setEditingProfile(p => ({ ...p, fontKey: "homemade-apple", skewAngle: -4, wordDrift: 1.8, letterSpacing: -0.5, messinessIntensity: 2.4, letterCaseChaos: true, inkDrySkipping: true, fontSize: 19 })), col: "bg-purple-400" },
                  { label: "Très Mauvaise 🤒", fn: () => setEditingProfile(p => ({ ...p, fontKey: "la-belle-aurore", skewAngle: -6, wordDrift: 3.8, messinessIntensity: 4.2, letterCaseChaos: true, inkDrySkipping: true, fontSize: 21 })), col: "bg-rose-400" },
                  { label: "Soignée Feutre", fn: () => setEditingProfile(p => ({ ...p, fontKey: "marck-script", skewAngle: -2, wordDrift: 1, messinessIntensity: 0.8, letterCaseChaos: false, inkDrySkipping: false, fontSize: 17 })), col: "bg-white" },
                ].map(({ label, fn, col }) => (
                  <button key={label} type="button" onClick={fn}
                    className={`${col} hover:opacity-80 border border-black text-black font-extrabold px-2.5 py-1 rounded shadow-[1.5px_1.5px_0_0_rgba(0,0,0,1)] text-[10px]`}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Font selection — ONLY custom handwriting fonts, no standards */}
            <div className="space-y-2">
              <label className="text-xs font-black text-black/70 flex justify-between select-none">
                <span>Police manuscrite :</span>
                <span className="text-[10px] bg-purple-200 border border-purple-500 px-2 rounded-full font-black text-black uppercase">{getFontFamily(editingProfile.fontKey)}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {HANDWRITING_FONTS.map((f) => (
                  <button key={f.key} type="button" onClick={() => updateProfile("fontKey", f.key)}
                    className={`p-1.5 border-2 text-[11px] text-left rounded-xl truncate transition-all font-black ${editingProfile.fontKey === f.key ? "border-black bg-purple-400 text-black shadow-[2.5px_2.5px_0px_rgba(0,0,0,1)]" : "border-black/10 hover:border-black bg-white text-black"}`}
                    style={{ fontFamily: f.family }}
                    title={f.family}
                  >{f.label}</button>
                ))}
              </div>
              <p className="text-[9px] text-black/40 font-bold">⚠️ Seules des polices manuscrites authentiques sont disponibles — les polices standard ont été supprimées.</p>
            </div>

            {/* Tool selection: pen / pencil / watercolor / crayon */}
            <div className="space-y-2">
              <label className="text-xs font-black text-black/70">Outil de dessin / écriture :</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { key: "pen", label: "Stylo", icon: <PenTool className="h-3.5 w-3.5" /> },
                  { key: "pencil", label: "Crayon", icon: <Pencil className="h-3.5 w-3.5" /> },
                  { key: "watercolor", label: "Aquarelle", icon: <Droplets className="h-3.5 w-3.5" /> },
                  { key: "crayon", label: "Craie", icon: <Edit3 className="h-3.5 w-3.5" /> },
                ].map((tool) => (
                  <button key={tool.key} type="button" onClick={() => setDrawingTool(tool.key as any)}
                    className={`flex flex-col items-center gap-0.5 py-2 border-2 rounded-xl text-[9px] font-black transition-all ${drawingTool === tool.key ? "border-black bg-indigo-400 text-black shadow-[2px_2px_0px_rgba(0,0,0,1)]" : "border-black/10 hover:border-black bg-white text-black"}`}
                  >
                    {tool.icon}
                    {tool.label}
                  </button>
                ))}
              </div>

              {/* Pencil hardness (only for pencil mode) */}
              {drawingTool === "pencil" && (
                <div className="bg-slate-50 border-2 border-black rounded-xl p-2.5 space-y-1.5">
                  <label className="text-[10px] font-black text-black">Dureté du crayon :</label>
                  <div className="flex gap-2">
                    {(["2H", "HB", "2B", "4B"] as const).map(h => (
                      <button key={h} type="button" onClick={() => updateProfile("pencilHardness", h)}
                        className={`flex-1 py-1 border-2 rounded-lg text-[10px] font-black transition-all ${editingProfile.pencilHardness === h ? "border-black bg-slate-700 text-white" : "border-black/20 hover:border-black bg-white text-black"}`}
                      >{h}</button>
                    ))}
                  </div>
                  <p className="text-[9px] text-black/50">2H = très clair, 4B = très sombre et épais. HB est la norme scolaire.</p>
                </div>
              )}

              {/* Watercolor opacity note */}
              {drawingTool === "watercolor" && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-2.5 text-[9px] text-blue-800 font-bold">
                  🎨 Mode Aquarelle : encre transparente et légèrement fondue, idéal pour les dessins de schémas scientifiques colorés.
                </div>
              )}

              {/* Crayon note */}
              {drawingTool === "crayon" && (
                <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-2.5 text-[9px] text-orange-800 font-bold">
                  🖍️ Mode Craie : trait épais, irrégulier et texturé, comme un crayon de couleur d'élève.
                </div>
              )}
            </div>

            {/* Pen type selection */}
            {drawingTool === "pen" && (
              <div className="space-y-2">
                <label className="text-xs font-black text-black/70">Type de stylo :</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { key: "ballpoint", label: "Bille" },
                    { key: "gel", label: "Gel" },
                    { key: "felt", label: "Feutre" },
                  ].map((pt) => (
                    <button key={pt.key} type="button" onClick={() => updateProfile("penType", pt.key)}
                      className={`py-1.5 border-2 rounded-xl text-[10px] font-black transition-all ${editingProfile.penType === pt.key ? "border-black bg-sky-400 text-black" : "border-black/10 hover:border-black bg-white text-black"}`}
                    >{pt.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Pen tip size */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Pointure du stylo / crayon :</span>
                <span className="text-[10px] bg-sky-200 border border-sky-500 px-2 rounded-full font-black text-black uppercase">
                  {editingProfile.penThickness <= 1.2 ? "Fine 0.38mm" : editingProfile.penThickness <= 1.8 ? "Bille 0.50mm" : editingProfile.penThickness <= 2.4 ? "Gel 0.70mm" : "Feutre 1.0mm"}
                </span>
              </div>
              <input type="range" min="0.8" max="3.2" step="0.1" value={editingProfile.penThickness}
                onChange={(e) => updateProfile("penThickness", parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
              <div className="flex justify-between gap-1">
                {[{ label: "Fine 0.38", value: 1.1 }, { label: "Bille 0.5", value: 1.5 }, { label: "Gel 0.7", value: 2.1 }, { label: "Feutre 1.0", value: 2.8 }].map(pt => (
                  <button key={pt.value} type="button" onClick={() => updateProfile("penThickness", pt.value)}
                    className={`flex-1 text-[9px] font-extrabold border py-0.5 rounded text-center transition-all ${editingProfile.penThickness === pt.value ? "bg-sky-400 border-black text-black" : "bg-slate-50 border-slate-200 hover:border-black text-slate-500"}`}
                  >{pt.label}</button>
                ))}
              </div>
            </div>

            {/* Realistic ink colors */}
            <div className="space-y-2">
              <label className="text-xs font-black text-black/70">Couleur d'encre réaliste :</label>
              <div className="flex flex-wrap gap-2 items-center">
                {[
                  { name: "Bleu Stylo à Bille (Sheen)", hex: "#1d3278" },
                  { name: "Bleu Gel Indigo Intense", hex: "#121b4a" },
                  { name: "Bleu Effaçable Clémenceau", hex: "#3445ad" },
                  { name: "Bleu Royal Oxford", hex: "#0047ab" },
                  { name: "Noir Carbone Pur", hex: "#1c1c1e" },
                  { name: "Gris Graphite Stylo", hex: "#3d3d3d" },
                  { name: "Rouge Stylo Enseignant", hex: "#be0000" },
                  { name: "Rouge Bordeaux Plume", hex: "#7c0a02" },
                  { name: "Vert Correcteur Copies", hex: "#0a7a2a" },
                  { name: "Vert Encre Waterman", hex: "#1b5e20" },
                  { name: "Violet Encre Plume Iroshizuku", hex: "#521d82" },
                  { name: "Brun Sepia Vintage", hex: "#704214" },
                ].map((color) => (
                  <button key={color.hex} type="button" onClick={() => updateProfile("inkColor", color.hex)}
                    className={`h-7 w-7 rounded-full relative transition shrink-0 border-2 border-black ${editingProfile.inkColor === color.hex ? "ring-2 ring-black scale-110 shadow-[2.5px_2.5px_0px_rgba(0,0,0,1)]" : "hover:scale-105"}`}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  >
                    {editingProfile.inkColor === color.hex && <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-black">✓</span>}
                  </button>
                ))}
                {/* Custom hex color picker */}
                <div className="relative">
                  <input type="color" value={editingProfile.inkColor}
                    onChange={(e) => updateProfile("inkColor", e.target.value)}
                    className="h-7 w-7 rounded-full border-2 border-black cursor-pointer appearance-none opacity-0 absolute inset-0"
                    title="Couleur personnalisée"
                  />
                  <div className="h-7 w-7 rounded-full border-2 border-dashed border-black flex items-center justify-center text-[10px] font-black" title="Choisir une couleur personnalisée"
                    style={{ backgroundColor: editingProfile.inkColor + "33" }}
                  >+</div>
                </div>
              </div>
              <p className="text-[9px] text-black/40 font-bold">Couleur actuelle : <span style={{ color: editingProfile.inkColor, fontWeight: 900 }}>{editingProfile.inkColor}</span></p>
            </div>

            {/* Font size */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Taille des lettres :</span><span>{editingProfile.fontSize}px</span>
              </div>
              <input type="range" min="12" max="28" step="0.5" value={editingProfile.fontSize}
                onChange={(e) => updateProfile("fontSize", parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Slant */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Inclinaison / Slant :</span><span>{editingProfile.skewAngle}°</span>
              </div>
              <input type="range" min="-15" max="15" step="0.5" value={editingProfile.skewAngle}
                onChange={(e) => updateProfile("skewAngle", parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Word drift */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Oscillation sur la ligne :</span><span>{editingProfile.wordDrift}px</span>
              </div>
              <input type="range" min="0" max="5" step="0.2" value={editingProfile.wordDrift}
                onChange={(e) => updateProfile("wordDrift", parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Letter spacing */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Espacement des lettres :</span><span>{editingProfile.letterSpacing}px</span>
              </div>
              <input type="range" min="-4" max="3" step="0.1" value={editingProfile.letterSpacing}
                onChange={(e) => updateProfile("letterSpacing", parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Messiness */}
            <div className="pt-2 border-t border-black/10 space-y-2">
              <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 uppercase tracking-wide block w-fit">🔥 Désordre & Brouillon</span>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-800 font-extrabold">
                  <span>Intensité du désordre :</span>
                  <span className="text-rose-600 font-black">{editingProfile.messinessIntensity}</span>
                </div>
                <input type="range" min="0" max="5" step="0.1" value={editingProfile.messinessIntensity}
                  onChange={(e) => updateProfile("messinessIntensity", parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border border-black rounded-xl select-none">
                  <input type="checkbox" checked={editingProfile.letterCaseChaos} onChange={(e) => updateProfile("letterCaseChaos", e.target.checked)} className="w-4 h-4 accent-black shrink-0" />
                  <span className="text-[10px] font-extrabold text-slate-800">Majuscules aléatoires</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border border-black rounded-xl select-none">
                  <input type="checkbox" checked={editingProfile.inkDrySkipping} onChange={(e) => updateProfile("inkDrySkipping", e.target.checked)} className="w-4 h-4 accent-black shrink-0" />
                  <span className="text-[10px] font-extrabold text-slate-800">Manque d'encre</span>
                </label>
              </div>
            </div>

            {/* Block rotation */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Rotation globale du bloc :</span><span>{editingProfile.rotationAngle}°</span>
              </div>
              <input type="range" min="-8" max="8" step="0.2" value={editingProfile.rotationAngle}
                onChange={(e) => updateProfile("rotationAngle", parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Global position offset */}
            <div className="pt-3 border-t-2 border-dotted border-black/30 space-y-3">
              <span className="text-[10px] font-black text-black/50 uppercase tracking-wider block">Réalignement global</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-black/75">Ajustement H : {globalOffsetX}px</label>
                  <input type="range" min="-40" max="40" value={globalOffsetX} onChange={(e) => setGlobalOffsetX(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-black/75">Ajustement V : {globalOffsetY}px</label>
                  <input type="range" min="-40" max="40" value={globalOffsetY} onChange={(e) => setGlobalOffsetY(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black" />
                </div>
              </div>
            </div>
          </section>

          {/* 05 — Realism & Scanner Effects */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-black text-black flex items-center gap-2">
              <span className="bg-lime-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">05</span>
              Réalisme Extrême &amp; Scanner 📷
            </h2>

            {/* Identity */}
            <div className="border-2 border-black rounded-xl p-3 bg-yellow-50/50 space-y-2">
              <span className="text-[10px] font-black text-black uppercase tracking-wider block">Identité de l'Élève</span>
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input type="checkbox" checked={showStudentHeader} onChange={(e) => setShowStudentHeader(e.target.checked)} className="w-4 h-4 accent-black" />
                <span className="text-[10px] font-black uppercase text-black">Afficher Nom &amp; Date</span>
              </label>
              {showStudentHeader && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-black/70">Nom :</label>
                    <input type="text" value={editingProfile.name} onChange={(e) => updateProfile("name", e.target.value)} className="w-full bg-white border-2 border-black rounded-lg px-2 py-1 text-xs font-bold focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-black/70">Date :</label>
                    <input type="text" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="w-full bg-white border-2 border-black rounded-lg px-2 py-1 text-xs font-bold focus:outline-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Paper & Scanner */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-black">Type de Support :</label>
                <select value={paperType} onChange={(e: any) => setPaperType(e.target.value)} className="w-full bg-white border-2 border-black rounded-lg p-1.5 font-bold focus:outline-none">
                  <option value="dotted">Petits Points (Dotted)</option>
                  <option value="seyyes">Grandes Lignes (Seyès)</option>
                  <option value="carreaux">Petits Carreaux (5x5)</option>
                  <option value="blank">Page Blanche</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-black">Filtre Scanner :</label>
                <select value={scannerPreset} disabled={!enableScannerFilter} onChange={(e: any) => setScannerPreset(e.target.value)} className="w-full bg-white border-2 border-black rounded-lg p-1.5 font-bold focus:outline-none disabled:opacity-50">
                  <option value="color-vintage">Scan Couleur Vintage 📔</option>
                  <option value="photocopy-grey">Photocopieur N&amp;B 📠</option>
                  <option value="scanner-high-contrast">Scan Haute Clarté 🏛️</option>
                  <option value="raw">Brut (Sans filtre)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Scanner Actif", value: enableScannerFilter, set: setEnableScannerFilter },
                { label: "Inclinaison Scan", value: enableSlightTilt, set: setEnableSlightTilt },
                { label: "Texture Papier", value: enablePaperGrain, set: setEnablePaperGrain },
                { label: "Taches & Café", value: enablePaperStains, set: setEnablePaperStains },
                { label: "Ratures (<s>abc</s>)", value: enableRatures, set: setEnableRatures, html: true },
                { label: "Brouillons", value: enableDoodles, set: setEnableDoodles },
              ].map(({ label, value, set, html }) => (
                <label key={label} className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border-2 border-black rounded-xl select-none">
                  <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="w-4 h-4 accent-black" />
                  {html ? <span className="text-[11px] font-black text-black" dangerouslySetInnerHTML={{ __html: label }} /> : <span className="text-[11px] font-black text-black">{label}</span>}
                </label>
              ))}
              <label className="flex items-center space-x-2 cursor-pointer bg-emerald-50 hover:bg-emerald-100 p-2 border-2 border-black rounded-xl select-none col-span-2">
                <input type="checkbox" checked={enableGreenUnderlines} onChange={(e) => setEnableGreenUnderlines(e.target.checked)} className="w-4 h-4 accent-black" />
                <span className="text-[11px] font-black text-emerald-950">Soulignés correctifs (Vert prof) ✓</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer bg-rose-50 hover:bg-rose-100 p-2 border-2 border-black rounded-xl select-none col-span-2">
                <input type="checkbox" checked={enableTeacherMarks} onChange={(e) => setEnableTeacherMarks(e.target.checked)} className="w-4 h-4 accent-black" />
                <span className="text-[11px] font-black text-rose-950">Annotations prof (Rouge) ★</span>
              </label>
            </div>
          </section>

        </aside>

        {/* ────────────────────────────────────────────────────────────────────
            RIGHT — Live Preview
        ──────────────────────────────────────────────────────────────────── */}
        <main className="lg:col-span-7 flex flex-col items-center">

          {/* Action Toolbar */}
          <div className="w-full bg-black text-white border-4 border-black rounded-t-3xl px-6 py-4 flex flex-wrap justify-between items-center gap-3 shadow-[6px_0px_0px_0px_rgba(0,0,0,1)] z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="bg-lime-400 p-1 rounded-lg border border-black text-black shrink-0">
                <Layers className="h-4 w-4" />
              </span>
              <span className="text-xs font-black uppercase tracking-wider select-none">Aperçu • Page A4</span>
              {generatedCopies.length > 0 && (
                <span className="text-[10px] bg-yellow-400 text-black font-black px-2 py-0.5 rounded-full border border-black">
                  👤 {activeRenderProfile.name}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={handleResetPositions}
                className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 border-2 border-black text-black rounded-xl text-xs font-black shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none flex items-center space-x-1.5"
              ><RotateCcw className="h-3.5 w-3.5" /><span>Rétablir</span></button>
              <button onClick={handleDownloadSheet}
                className="px-4 py-2 bg-blue-400 hover:bg-blue-300 border-2 border-black text-black rounded-xl text-xs font-black shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none flex items-center space-x-1.5"
              ><Download className="h-4 w-4" /><span>Imprimer / PDF</span></button>
            </div>
          </div>

          {/* Sheet container */}
          <div className="w-full border-x-4 border-b-4 border-black bg-black/15 p-4 lg:p-8 flex items-center justify-center overflow-auto rounded-b-3xl h-[1000px] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] bg-grid-pattern">

            {/* Physical paper */}
            <div
              id="printed-worksheet-paper"
              ref={sheetContainerRef}
              className={`relative w-[700px] min-h-[920px] bg-white text-slate-900 px-10 py-12 border border-slate-300 rounded select-none ${
                activeTab === "custom" ? "bg-white" :
                paperType === "blank" ? "bg-white" :
                paperType === "dotted" ? "bg-grid-pattern" :
                paperType === "seyyes" ? "bg-seyyes-pattern" :
                paperType === "carreaux" ? "bg-carreaux-pattern" : "bg-grid-pattern"
              } print:shadow-none print:border-none print:m-0 transition-all duration-300`}
              style={{
                minHeight: "920px",
                transform: enableSlightTilt ? "scale(0.98) rotate(0.4deg)" : "none",
                filter: !enableScannerFilter ? "none" :
                  scannerPreset === "color-vintage" ? "sepia(0.08) contrast(1.18) brightness(1.01) saturate(1.12)" :
                  scannerPreset === "photocopy-grey" ? "grayscale(1.0) contrast(1.48) brightness(1.02)" :
                  scannerPreset === "scanner-high-contrast" ? "contrast(1.32) brightness(1.02) saturate(0.8)" :
                  "contrast(1.15) brightness(1.02) saturate(0.92)",
                boxShadow: enableSlightTilt ? "12px 12px 28px rgba(0,0,0,0.18)" : "0 4px 6px -1px rgba(0,0,0,0.1)",
                transformOrigin: "center center",
              }}
            >
              {/* SVG ink bleed filter */}
              <svg style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }} aria-hidden="true">
                <defs>
                  <filter id="authentic-ink-bleed">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="0.25" result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -5" result="goo" />
                    <feMerge><feMergeNode in="goo" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  {/* Pencil graphite filter */}
                  <filter id="pencil-texture">
                    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                    <feGaussianBlur in="displaced" stdDeviation="0.3" result="blurred" />
                    <feMerge><feMergeNode in="blurred" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  {/* Watercolor wash filter */}
                  <filter id="watercolor-wash">
                    <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                    <feGaussianBlur in="displaced" stdDeviation="0.8" />
                  </filter>
                  {/* Crayon texture */}
                  <filter id="crayon-texture">
                    <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" result="noise" />
                    <feColorMatrix in="noise" type="saturate" values="0" result="greyNoise" />
                    <feBlend in="SourceGraphic" in2="greyNoise" mode="multiply" result="blend" />
                    <feComposite in="blend" in2="SourceGraphic" operator="in" />
                  </filter>
                </defs>
              </svg>

              {/* Paper grain */}
              {enablePaperGrain && (
                <div className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-[0.14] bg-repeat z-30"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
                />
              )}

              {/* Paper stains */}
              {enablePaperStains && (
                <>
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.06)_100%)] z-25" />
                  <div className="absolute bottom-8 right-12 w-28 h-28 pointer-events-none opacity-[0.22] z-25 select-none transform rotate-12">
                    <svg className="w-full h-full text-[#78350f]" viewBox="0 0 100 100" fill="none">
                      <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="1.8" strokeDasharray="30 2 20 5 15 1" opacity="0.8" />
                      <circle cx="50" cy="50" r="41.5" stroke="currentColor" strokeWidth="1" strokeDasharray="10 30" opacity="0.5" />
                    </svg>
                  </div>
                  <div className="absolute top-0 right-0 w-[45px] h-[45px] pointer-events-none opacity-20 z-25 select-none overflow-hidden">
                    <svg className="w-full h-full text-black" viewBox="0 0 100 100">
                      <polygon points="100,0 100,100 0,0" fill="rgba(0,0,0,0.15)" />
                      <line x1="100" y1="100" x2="0" y2="0" stroke="rgba(0,0,0,0.6)" strokeWidth="1.5" />
                    </svg>
                  </div>
                </>
              )}

              {/* Doodles/sketches in margins */}
              {enableDoodles && (
                <div className="absolute inset-0 pointer-events-none select-none z-15 text-slate-400 opacity-60">
                  {currentTemplate?.id === "page3" && (
                    <>
                      <div className="absolute left-[78%] top-[25%] transform rotate-3 select-none scale-75 pt-2">
                        <svg className="w-20 h-20 text-slate-500" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                          <path d="M5,80 L20,20 L80,20 L95,80 Z" strokeWidth="1.5" strokeDasharray="4,4" />
                          <text x="25" y="45" fill="currentColor" fontSize="10" fontFamily="monospace">900 kWh</text>
                          <text x="25" y="60" fill="currentColor" fontSize="10" fontFamily="monospace">x 0,15 €</text>
                          <line x1="20" y1="67" x2="80" y2="67" stroke="currentColor" strokeWidth="1" />
                          <text x="25" y="80" fill="currentColor" fontSize="10" fontFamily="monospace">= 135 €</text>
                        </svg>
                      </div>
                      <div className="absolute left-[84%] top-[48%] select-none opacity-40">
                        <svg className="w-8 h-12 text-amber-500" viewBox="0 0 100 100" fill="currentColor">
                          <path d="M50,0 L15,55 L45,55 L30,100 L85,42 L52,42 Z" />
                        </svg>
                      </div>
                    </>
                  )}
                  {currentTemplate?.id === "page4" && (
                    <div className="absolute left-[84%] top-[15%] select-none opacity-40">
                      <svg className="w-12 h-12 text-sky-400" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="50" cy="50" r="4" fill="currentColor" />
                        <path d="M50,50 C40,30 30,30 50,20 C70,30 60,30 50,50" />
                        <path d="M50,50 C30,40 30,30 20,50 C30,70 30,60 50,50" />
                        <path d="M50,50 C60,70 70,70 50,80 C30,70 40,70 50,50" />
                      </svg>
                    </div>
                  )}
                </div>
              )}

              {/* Teacher annotations — NO grade circle */}
              {enableTeacherMarks && (
                <div className="absolute inset-0 pointer-events-none select-none z-20 text-rose-600">
                  {currentTemplate?.id === "page3" && (
                    <>
                      <div className="absolute left-[78%] top-[39%] text-3xl font-bold select-none text-red-600">✓</div>
                      <div className="absolute left-[78%] top-[56%] text-3xl font-bold select-none text-red-600">✓</div>
                      <div className="absolute left-[78%] top-[74%] text-3xl font-bold select-none text-red-600">✓</div>
                      <div className="absolute left-[65%] top-[89%] text-sm font-bold rotate-[-3deg] select-none text-red-600"
                        style={{ fontFamily: `var(${getFontVar(getTeacherFontClass("page3_comment"))})` }}>
                        Très bonne conclusion !
                      </div>
                    </>
                  )}
                  {currentTemplate?.id === "page4" && (
                    <>
                      <div className="absolute top-14 right-16 border-2 border-red-500 rounded px-2 py-0.5 transform -rotate-12 opacity-80 select-none bg-white/45">
                        <p className="text-[10px] font-extrabold tracking-wider select-none text-red-600">APPROUVÉ • AL KAWTHAR</p>
                      </div>
                      <div className="absolute left-[80%] top-[72%] text-3xl font-bold select-none text-red-600">✓</div>
                      <div className="absolute left-[80%] top-[90%] text-3xl font-bold select-none text-red-600">✓</div>
                      <div className="absolute left-[62%] top-[60%] text-sm font-bold rotate-[4deg] select-none text-red-600"
                        style={{ fontFamily: `var(${getFontVar(getTeacherFontClass("page4_comment"))})` }}>
                        Analyse critique rigoureuse
                      </div>
                    </>
                  )}
                  {currentTemplate?.id === "page5" && (
                    <div className="absolute left-[80%] top-[32%] text-3xl font-bold select-none text-red-600">✓</div>
                  )}
                </div>
              )}

              {/* Student header overlay */}
              {showStudentHeader && (activeTab === "custom" || currentTemplate?.id !== "page3") && (
                <div
                  style={{
                    position: "absolute",
                    left: `calc(12% + ${(offsets["student_info"]?.x || 0) + globalOffsetX}px)`,
                    top: `calc(6% + ${(offsets["student_info"]?.y || 0) + globalOffsetY}px)`,
                    color: activeRenderProfile.inkColor,
                    cursor: "grab",
                    pointerEvents: "auto",
                    userSelect: "none",
                    zIndex: 20,
                    fontFamily: `var(${getFontVar(activeRenderProfile.fontKey)})`,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, "student_info")}
                  className="group border-2 border-dashed border-transparent hover:border-lime-500 hover:bg-lime-50/40 p-2 text-xs transition-all"
                >
                  <div className="flex flex-col space-y-1 font-bold select-none pointer-events-none" style={{ filter: "url(#authentic-ink-bleed)" }}>
                    <div className="whitespace-nowrap flex items-center gap-1">
                      <span>Nom :</span>
                      <span className="text-sm px-1.5">{editingProfile.name}</span>
                    </div>
                    <div className="whitespace-nowrap flex items-center gap-1">
                      <span>Date :</span>
                      <span className="text-sm px-1.5">{examDate}</span>
                    </div>
                    <p className="text-[7.5px] text-slate-400/80 font-sans tracking-wide block select-none print:hidden font-normal pt-1">(Cliquez-glissez pour ajuster)</p>
                  </div>
                </div>
              )}

              {/* Custom uploaded worksheet background */}
              {activeTab === "custom" && currentTemplate?.imageUrl && currentTemplate.imageUrl !== "page3_bg" && currentTemplate.imageUrl !== "page4_bg" && currentTemplate.imageUrl !== "page5_bg" ? (
                <div className="absolute inset-0 pointer-events-none">
                  <img src={currentTemplate.imageUrl} alt="Custom assessment" className="w-full h-full object-contain opacity-95" referrerPolicy="no-referrer" />
                </div>
              ) : (
                /* Al Kawthar built-in layout */
                <div className="space-y-6">
                  <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-full border border-blue-600 flex items-center justify-center bg-blue-50 text-[10px] font-extrabold text-blue-700 leading-none shrink-0">
                        <span className="text-center font-serif">AL<br /><span className="text-[6px]">KAWTHAR</span></span>
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[11px] tracking-wide text-blue-900 uppercase">LES ÉCOLES INTERNATIONALES AL KAWTHAR</h3>
                        <p className="text-[9px] text-slate-500 font-medium">Année scolaire 2025-2026 • Vision 2030</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="border border-indigo-200 bg-indigo-50/50 px-2 py-1 rounded text-[10px] font-bold text-indigo-800">PEI 4 (Classe)</div>
                    </div>
                  </div>

                  {currentTemplate?.id === "page3" && (
                    <div className="space-y-4">
                      <div className="text-center space-y-1">
                        <h2 className="text-sm font-extrabold underline uppercase tracking-tight text-slate-800">Évaluation de Sciences (Unité 3 : L'Énergie Électrique et le Nucléaire)</h2>
                        <p className="text-xs font-bold text-rose-600">Critère C : Traitement et évaluation de l'information</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs py-2 border-b border-slate-200">
                        <div>
                          <span className="font-extrabold text-slate-600">Nom et prénom :</span>
                          <span className={`ml-2 border-b border-dashed border-slate-400 w-56 inline-block font-bold text-base leading-none`}
                            style={{ color: activeRenderProfile.inkColor, transform: "rotate(-1deg)", display: "inline-block", fontFamily: `var(${getFontVar(activeRenderProfile.fontKey)})` }}
                          >{editingProfile.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-slate-600 mr-2">Date :</span>
                          <span className="border-b border-dashed border-slate-400 w-28 inline-block text-center font-bold text-base leading-none"
                            style={{ color: activeRenderProfile.inkColor, transform: "rotate(0.5deg)", display: "inline-block", fontFamily: `var(${getFontVar(activeRenderProfile.fontKey)})` }}
                          >{examDate}</span>
                        </div>
                      </div>
                      <div className="p-3 bg-yellow-50/50 border border-amber-200 rounded-lg text-[10.5px] leading-relaxed">
                        <strong className="text-rose-600">Énoncé de recherche : </strong>
                        L'exploration des méthodes de production d'énergie électrique et nucléaire révèle des transformations complexes, des équilibres délicats et des conséquences profondes pour la durabilité mondiale et le bien-être humain.
                      </div>
                      <div className="border-l-4 border-indigo-600 pl-3 pt-0.5 space-y-1">
                        <h4 className="font-extrabold text-[12px] text-slate-900">Exercice 1 : Analyse de la consommation électrique (15 minutes)</h4>
                        <p className="text-[10px] text-rose-600 font-semibold italic">Critère C : ii. Interpréter des données et expliquer des tendances</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-[11px] space-y-1">
                        <p className="font-medium text-slate-700">Données de la facture d'électricité simplifiée :</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-slate-600">
                          <div>• Période : 1er janvier au 31 mars</div>
                          <div>• Consommation totale : 900 kWh</div>
                          <div>• Coût du kWh : 0,15 €</div>
                          <div>• Abonnement fixe : 30 €</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentTemplate?.id === "page4" && (
                    <div className="space-y-4">
                      <div className="border-b border-slate-200 pb-2">
                        <h3 className="font-bold text-sm text-slate-800">Exercice 2 : Évaluation de la fiabilité des informations (15 minutes)</h3>
                        <p className="text-[10px] text-rose-600 italic">Critère C : iv. Évaluer la pertinence et la fiabilité des données</p>
                      </div>
                      <div className="space-y-3">
                        <div className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-lg space-y-1">
                          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Extrait A : Article de Blog</span>
                          <p className="text-[10.5px] leading-relaxed font-serif text-slate-700 italic">
                            &ldquo;Un article de blog récent affirme que l'énergie éolienne est la solution parfaite. Il déclare que les éoliennes ne produisent aucune pollution et ne présentent aucun inconvénient.&rdquo;
                          </p>
                        </div>
                        <div className="p-3 bg-sky-50/40 border border-sky-100 rounded-lg space-y-1">
                          <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider block">Extrait B : Rapport Institutionnel</span>
                          <p className="text-[10.5px] leading-relaxed font-serif text-slate-700 italic">
                            &ldquo;Un rapport gouvernemental mentionne que l'énergie nucléaire est bas-carbone, mais souligne la complexité de la gestion des déchets radioactifs, s'appuyant sur des données de l'AIEA.&rdquo;
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentTemplate?.id === "page5" && (
                    <div className="space-y-4">
                      <div className="border-b border-slate-200 pb-2">
                        <h3 className="font-bold text-sm text-slate-800">Exercice 2 : Évaluation de la fiabilité (Partie 2)</h3>
                        <p className="text-[10px] text-slate-500">Suite de l'examen de sciences.</p>
                      </div>
                    </div>
                  )}

                  {/* Questions with blank lines */}
                  <div className="space-y-8 pt-2">
                    {currentTemplate?.questions.map((q) => (
                      <div key={q.id} className="relative pb-1 bg-transparent">
                        <p className="text-xs font-semibold text-slate-800 leading-tight mb-2">{q.questionText}</p>
                        {paperType !== "seyyes" && paperType !== "carreaux" && (
                          <div className="space-y-6 pt-1">
                            <div className="border-b border-dotted border-slate-300 h-1"></div>
                            <div className="border-b border-dotted border-slate-300 h-1"></div>
                            <div className="border-b border-dotted border-slate-300 h-1"></div>
                            {q.id.includes("q1") || q.id.includes("q2") || q.id.includes("conclusion") ? (
                              <>
                                <div className="border-b border-dotted border-slate-300 h-1"></div>
                                <div className="border-b border-dotted border-slate-300 h-1 print:hidden"></div>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Handwriting overlay layer */}
              <div className="absolute inset-0 pointer-events-none">
                {currentTemplate?.questions.map((q) => {
                  const answerText = editableAnswers[q.id] || "";
                  if (!answerText) return null;
                  const offset = offsets[q.id] || { x: 0, y: 0 };
                  const qStyle = getOrganicStyle(q.id, activeRenderProfile);
                  const toolFilter = drawingTool === "pencil" ? "url(#pencil-texture)" : drawingTool === "watercolor" ? "url(#watercolor-wash)" : drawingTool === "crayon" ? "url(#crayon-texture)" : "url(#authentic-ink-bleed) drop-shadow(0.15px 0.15px 0.2px rgba(0,0,0,0.25))";

                  const textStyle: React.CSSProperties = {
                    position: "absolute",
                    left: `calc(${q.defaultX}% + ${offset.x + globalOffsetX}px)`,
                    top: `calc(${q.defaultY}% + ${offset.y + globalOffsetY}px)`,
                    color: getToolColor(activeRenderProfile),
                    fontSize: `${qStyle.size}px`,
                    transform: `rotate(${qStyle.rotation}deg)`,
                    maxWidth: `${q.maxWidth || 550}px`,
                    lineHeight: `${q.lineHeight || 24}px`,
                    whiteSpace: "pre-wrap",
                    cursor: "grab",
                    pointerEvents: "auto",
                    userSelect: "none",
                    filter: toolFilter,
                    fontFamily: `var(${getFontVar(qStyle.fontKey)})`,
                    WebkitTextStroke: drawingTool !== "pencil" && qStyle.thickness > 1.1 ? `${(qStyle.thickness - 1.1) * 0.35}px ${getToolColor(activeRenderProfile)}` : "0px",
                  };

                  return (
                    <div key={q.id} style={textStyle}
                      onMouseDown={(e) => handleMouseDown(e, q.id)}
                      className="group select-none border-2 border-transparent hover:border-violet-300 hover:bg-violet-50/40 p-1.5 rounded-lg transition-transform duration-75"
                      title="Cliquez et glissez pour repositionner"
                    >
                      {editingQId === q.id ? (
                        <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={answerText}
                            onChange={(e) => setEditableAnswers({ ...editableAnswers, [q.id]: e.target.value })}
                            onBlur={() => setEditingQId(null)}
                            autoFocus
                            rows={3}
                            className="w-full bg-white text-slate-800 border-2 border-indigo-500 rounded p-1 text-xs focus:ring-0 focus:outline-none"
                            style={{ fontFamily: "sans-serif", fontSize: "12px", width: "350px" }}
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Appuyez en dehors pour enregistrer</p>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            {enableRatures && (
                              <span className="relative inline-block mr-4 select-none opacity-70 italic">
                                <span className="inline-block">{renderDeformedText(q.id + "-rature", getRatureForQuestion(q.id), activeRenderProfile)}</span>
                                <span className="absolute left-0 right-0 top-1/2 -translate-y-[40%] h-full w-[105%] pointer-events-none select-none">
                                  <svg className="w-full h-[16px] text-current overflow-visible" preserveAspectRatio="none" viewBox="0 0 120 10">
                                    <path d={getRandomRaturePath(q.id, activeRenderProfile.name)} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d={getRandomRaturePath(q.id + "-secondary", activeRenderProfile.name)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                    {activeRenderProfile.messinessIntensity > 1.8 && (
                                      <path d="M 3 6 Q 8 1, 13 8 T 23 3 T 33 8 T 43 4 T 53 8 T 63 3 T 73 8 T 83 4 T 93 8 T 103 3 T 113 7"
                                        fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
                                    )}
                                  </svg>
                                </span>
                              </span>
                            )}
                            <span className="inline-block">{renderDeformedText(q.id, answerText, activeRenderProfile)}</span>
                          </div>
                          {/* Hover edit/move controls */}
                          <div className="absolute top-0 right-0 transform translate-x-1 translate-y-[-100%] opacity-0 group-hover:opacity-100 flex items-center space-x-1 bg-violet-600 text-white p-1 rounded-md text-[10px] pointer-events-auto">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setEditingQId(q.id); }} className="hover:text-amber-200 transition p-0.5" title="Modifier la réponse">
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <span className="cursor-grab active:cursor-grabbing p-0.5" title="Glisser pour déplacer">
                              <Move className="h-3 w-3" />
                            </span>
                            {activeTab === "custom" && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.id); }} className="hover:text-red-200 text-red-100 transition p-0.5" title="Supprimer">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          {/* Help hint */}
          <div className="w-full mt-6 bg-yellow-100 border-4 border-black p-4 rounded-3xl flex items-start space-x-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] text-black">
            <HelpCircle className="h-5 w-5 text-black mt-0.5 shrink-0" />
            <div className="text-xs space-y-1 font-bold">
              <p className="font-black text-black">💡 ASTUCE :</p>
              <p className="leading-relaxed text-black/80">
                Les réponses générées sont <strong>déplaçables</strong>. Survolez un bloc et <strong>glissez</strong> pour l'aligner sur les pointillés. Chaque élève reçoit une copie unique (style, écriture, réponses) via Gemini AI.
              </p>
            </div>
          </div>

        </main>

      </div>

      {/* Footer */}
      <footer className="px-8 py-5 bg-black text-white flex flex-col sm:flex-row justify-between items-center mt-12 gap-4 border-t-4 border-black font-semibold text-xs text-center sm:text-left select-none">
        <p className="opacity-80 font-bold uppercase tracking-wider">Propulsé par Gemini 2.5 Flash • Génération différenciée par élève</p>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
            <span className="w-2.5 h-2.5 bg-lime-400 rounded-full" />
            Serveurs en ligne
          </span>
          <span className="opacity-65 italic tracking-tighter">@nanobanana_app</span>
        </div>
      </footer>

      {/* Print notice toast */}
      <AnimatePresence>
        {showPrintNotice && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 max-w-sm bg-black text-white p-4 rounded-2xl border-4 border-lime-400 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-50 text-xs font-bold leading-relaxed space-y-2 select-none print:hidden pointer-events-auto"
          >
            <div className="flex items-center gap-2 text-yellow-300">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="font-extrabold uppercase text-xs">IMPRESSION LANCÉE !</span>
            </div>
            <p className="text-slate-200 text-xs">Si la fenêtre d'impression ne s'affiche pas, cliquez sur <strong className="text-lime-300">"Ouvrir dans un nouvel onglet"</strong> pour imprimer en pleine page.</p>
            <button onClick={() => setShowPrintNotice(false)} className="text-xs text-lime-400 hover:text-white underline font-semibold mt-1">Fermer</button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
