/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Upload, 
  FileText, 
  Sparkles, 
  Sliders, 
  Download, 
  RotateCcw, 
  CheckCircle, 
  Layers, 
  AlertCircle, 
  Type as FontIcon, 
  Palette, 
  Edit3,
  Move,
  Maximize2,
  RefreshCw,
  HelpCircle,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRELOADED_TEMPLATES, RUBRIC_ANSWERS, EXAM_CRITERIA_LEVELS } from "./templates";
import { CriteriaLevel, WorksheetQuestion, AnswerItem } from "./types";

export default function App() {
  // Application Modes & Statuses
  const [activeTab, setActiveTab] = useState<"preload" | "custom">("preload");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("page3");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [hwImage, setHwImage] = useState<string | null>(null);
  const [hwImageName, setHwImageName] = useState<string>("");
  const [criteriaLevel, setCriteriaLevel] = useState<CriteriaLevel>(CriteriaLevel.LEVEL_5_6);

  // Student details customizable inputs
  const [studentName, setStudentName] = useState<string>("Alexandre Martin");
  const [examDate, setExamDate] = useState<string>("24 / 05 / 2026");
  const [showStudentHeader, setShowStudentHeader] = useState<boolean>(false);

  // Extreme Reality & Scanner Effect states
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

  // Status metrics
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [promptCopied, setPromptCopied] = useState<boolean>(false);
  const [showPrintNotice, setShowPrintNotice] = useState<boolean>(false);

  // Custom Editable answers
  const [editableAnswers, setEditableAnswers] = useState<{ [qId: string]: string }>({});
  const [offsets, setOffsets] = useState<{ [qId: string]: { x: number; y: number } }>({});
  const [editingQId, setEditingQId] = useState<string | null>(null);

  // Handwriting parameters (interactive customization)
  const [selectedFont, setSelectedFont] = useState<string>("Homemade Apple");
  const [inkColor, setInkColor] = useState<string>("#1e40af"); // blue ink default
  const [fontSize, setFontSize] = useState<number>(18);
  const [rotationAngle, setRotationAngle] = useState<number>(-0.5);
  const [fontJitter, setFontJitter] = useState<number>(1.8); // slight letter scatter / size variation
  const [skewAngle, setSkewAngle] = useState<number>(-3); // Slant in degrees, mimicking the student slanted cursive
  const [wordDrift, setWordDrift] = useState<number>(1.5); // Natural baseline deviation
  const [letterSpacing, setLetterSpacing] = useState<number>(-0.5); // Tighten letter spacing for beautiful cursive connectors
  const [messinessIntensity, setMessinessIntensity] = useState<number>(2.5); // 0 (neat) to 5 (highly chaotic bad penmanship)
  const [enableUnreadableLetters, setEnableUnreadableLetters] = useState<boolean>(true); // severely twisted local letters
  const [letterCaseChaos, setLetterCaseChaos] = useState<boolean>(true); // awkward schoolboy uppercase/lowercase mixing
  const [inkDrySkipping, setInkDrySkipping] = useState<boolean>(true); // simulated skipping pen ink intensity

  // New customizable pen thickness and organic randomization styles
  const [penThickness, setPenThickness] = useState<number>(1.5); // fine/medium/felt pen tip thickness
  const [enableOrganicRandomStyle, setEnableOrganicRandomStyle] = useState<boolean>(true); // make lines/ratures random
  
  const [savedProfiles, setSavedProfiles] = useState<{
    name: string;
    hwImage: string | null;
    hwImageName: string;
    selectedFont: string;
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
  }[]>(() => {
    try {
      const data = localStorage.getItem("handwriting_student_profiles");
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  });

  // Save profile to local state and localStorage
  const handleSaveStudentProfile = () => {
    if (!studentName.trim()) return;
    
    const newProfile = {
      name: studentName.trim(),
      hwImage: hwImage,
      hwImageName: hwImageName,
      selectedFont,
      inkColor,
      fontSize,
      rotationAngle,
      skewAngle,
      wordDrift,
      letterSpacing,
      messinessIntensity,
      enableUnreadableLetters,
      letterCaseChaos,
      inkDrySkipping,
      penThickness
    };

    setSavedProfiles(prev => {
      const updated = prev.filter(p => p.name.toLowerCase() !== newProfile.name.toLowerCase());
      updated.push(newProfile);
      localStorage.setItem("handwriting_student_profiles", JSON.stringify(updated));
      return updated;
    });
  };

  // Load a student profile parameters
  const handleLoadStudentProfile = (p: any) => {
    if (p.name) setStudentName(p.name);
    setHwImage(p.hwImage || null);
    setHwImageName(p.hwImageName || "");
    if (p.selectedFont) setSelectedFont(p.selectedFont);
    if (p.inkColor) setInkColor(p.inkColor);
    if (p.fontSize) setFontSize(p.fontSize);
    if (p.rotationAngle !== undefined) setRotationAngle(p.rotationAngle);
    if (p.skewAngle !== undefined) setSkewAngle(p.skewAngle);
    if (p.wordDrift !== undefined) setWordDrift(p.wordDrift);
    if (p.letterSpacing !== undefined) setLetterSpacing(p.letterSpacing);
    if (p.messinessIntensity !== undefined) setMessinessIntensity(p.messinessIntensity);
    if (p.enableUnreadableLetters !== undefined) setEnableUnreadableLetters(p.enableUnreadableLetters);
    if (p.letterCaseChaos !== undefined) setLetterCaseChaos(p.letterCaseChaos);
    if (p.inkDrySkipping !== undefined) setInkDrySkipping(p.inkDrySkipping);
    if (p.penThickness !== undefined) setPenThickness(p.penThickness);
  };

  const handleDeleteStudentProfile = (nameToDelete: string) => {
    setSavedProfiles(prev => {
      const filtered = prev.filter(p => p.name !== nameToDelete);
      localStorage.setItem("handwriting_student_profiles", JSON.stringify(filtered));
      return filtered;
    });
  };

  // Organic question style resolver to guarantee uniqueness per line block
  const getOrganicStyleForQuestion = (qId: string) => {
    // Generate simple seed based on character codes
    let hash = 0;
    for (let i = 0; i < qId.length; i++) {
      hash = (hash << 5) - hash + qId.charCodeAt(i);
    }
    const seed = Math.abs(hash % 100) / 100; // 0.0 to 0.99

    // High quality cursive/script fonts remaining (removed standard)
    const scriptFontsList = [
      "Homemade Apple",
      "Marck Script",
      "Parisienne",
      "Allura",
      "La Belle Aurore",
      "Bad Script"
    ];

    const font = enableOrganicRandomStyle 
      ? scriptFontsList[Math.floor(seed * scriptFontsList.length)]
      : selectedFont;

    const rotation = enableOrganicRandomStyle
      ? rotationAngle + (seed * 3.6 - 1.8) // subtle sway
      : rotationAngle;

    const size = enableOrganicRandomStyle
      ? fontSize + (seed * 2.4 - 1.2) // slight size difference
      : fontSize;

    const slant = enableOrganicRandomStyle
      ? skewAngle + (seed * 5 - 2.5) // slant variance
      : skewAngle;

    const thickness = enableOrganicRandomStyle
      ? Math.max(0.8, penThickness + (seed * 0.6 - 0.3))
      : penThickness;

    return { font, rotation, size, slant, thickness };
  };

  // Get distinct scratch-out wave path for authentic ratures
  const getRandomRaturePath = (qId: string) => {
    let hash = 0;
    for (let i = 0; i < qId.length; i++) {
      hash = (hash << 5) - hash + qId.charCodeAt(i);
    }
    const seed = Math.abs(hash % 4);
    switch (seed) {
      case 0: return "M 1 5 Q 12 1, 25 7 T 50 3 T 75 8 T 100 4 T 114 5";
      case 1: return "M 2 4 C 18 1, 35 9, 55 3 T 85 7 T 110 2";
      case 2: return "M 1 6 Q 18 8, 30 2 T 60 7 T 90 3 T 115 5";
      default: return "M 3 3 C 20 8, 45 1, 70 8 S 100 2, 114 6";
    }
  };

  // Get distinct font for teacher comments to look human
  const getTeacherFontClass = (qId: string) => {
    let hash = 0;
    for (let i = 0; i < qId.length; i++) {
      hash = (hash << 5) - hash + qId.charCodeAt(i);
    }
    const seed = Math.abs(hash % 3);
    switch (seed) {
      case 0: return "font-caveat";
      case 1: return "font-kalam";
      default: return "font-schoolbell";
    }
  };

  // Layout fine-tuning (applies globally)
  const [globalOffsetX, setGlobalOffsetX] = useState<number>(0);
  const [globalOffsetY, setGlobalOffsetY] = useState<number>(0);

  // Dynamic DND tracking state
  const [draggedQId, setDraggedQId] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sheetContainerRef = useRef<HTMLDivElement>(null);

  // PDF-processing and split pages states
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(false);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [currentPdfPageIndex, setCurrentPdfPageIndex] = useState<number>(0);
  const [customQuestions, setCustomQuestions] = useState<WorksheetQuestion[]>([]);

  // Dynamically load PDF.js from CDN
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

  const handleAddCustomTextLine = () => {
    const nextNum = customQuestions.length + 1;
    const newId = `custom_manual_${Date.now()}`;
    const newQ: WorksheetQuestion = {
      id: newId,
      number: nextNum,
      questionText: `Écriture Manuelle libre #${nextNum}`,
      defaultX: 20,
      defaultY: Math.max(15, (20 + (customQuestions.length * 8)) % 85), // cascade vertically nicely
      maxWidth: 550,
      lineHeight: 24
    };

    setCustomQuestions(prev => [...prev, newQ]);
    setEditableAnswers(prev => ({
      ...prev,
      [newId]: `Réponse libre #${nextNum} (Double-cliquez pour modifier ce texte!)`
    }));
    setOffsets(prev => ({
      ...prev,
      [newId]: { x: 0, y: 0 }
    }));
  };

  const handleDeleteQuestion = (qId: string) => {
    setCustomQuestions(prev => prev.filter(q => q.id !== qId));
    if (analysisResult?.customTemplate?.questions) {
      setAnalysisResult((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          customTemplate: {
            ...prev.customTemplate,
            questions: prev.customTemplate.questions.filter((q: any) => q.id !== qId)
          }
        };
      });
    }
    setEditableAnswers(prev => {
      const copy = { ...prev };
      delete copy[qId];
      return copy;
    });
  };

  // Check backend server capability & env variables when App mounts
  useEffect(() => {
    // Quick test to see if backend has Gemini API key
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worksheetId: "ping" }),
    })
      .then((res) => {
        setHasApiKey(true); // Connected to full stack
      })
      .catch((err) => {
        console.warn("Backend API offline or CORS issues, falling back to client mode.");
      });
  }, []);

  // Determine questions for current layout
  const activeQuestions = (() => {
    if (activeTab === "preload") {
      const template = PRELOADED_TEMPLATES.find(t => t.id === selectedTemplateId);
      return template ? template.questions : [];
    } else {
      // Custom Tab
      if (pdfPages.length > 0) {
        if (currentPdfPageIndex === 2) {
          // Page 3 matches preloaded page3
          return PRELOADED_TEMPLATES[0].questions;
        } else if (currentPdfPageIndex === 3) {
          // Page 4 matches preloaded page4
          return PRELOADED_TEMPLATES[1].questions;
        } else if (currentPdfPageIndex === 4) {
          // Page 5 matches preloaded page5
          return PRELOADED_TEMPLATES[2].questions;
        } else {
          return [
            ...(analysisResult?.customTemplate?.questions || []),
            ...customQuestions
          ];
        }
      } else {
        return [
          ...(analysisResult?.customTemplate?.questions || []),
          ...customQuestions
        ];
      }
    }
  })();

  // Update sheet answers when template, page, or level changes
  useEffect(() => {
    const answersForLevel = RUBRIC_ANSWERS[criteriaLevel] || {};
    const initialAnswers: { [qId: string]: string } = {};
    const initialOffsets: { [qId: string]: { x: number; y: number } } = {};
    
    activeQuestions.forEach((q) => {
      // For standard preloaded questions, always pull from RUBRIC_ANSWERS matching current level
      if (answersForLevel[q.id]) {
        initialAnswers[q.id] = answersForLevel[q.id];
      } else {
        // Otherwise, keep user's existing input or fallback
        initialAnswers[q.id] = editableAnswers[q.id] || `Réponse libre à la question ${q.number}`;
      }
      initialOffsets[q.id] = offsets[q.id] || { x: 0, y: 0 };
    });
    
    setEditableAnswers(prev => {
      // Merge keys
      const merged = { ...prev };
      activeQuestions.forEach((q) => {
        merged[q.id] = initialAnswers[q.id];
      });
      return merged;
    });

    setOffsets(prev => {
      const merged = { ...prev };
      activeQuestions.forEach((q) => {
        merged[q.id] = initialOffsets[q.id];
      });
      return merged;
    });
  }, [criteriaLevel, activeTab, currentPdfPageIndex, selectedTemplateId, pdfPages.length, customQuestions, analysisResult]);

  // Handle Drag-and-drop of worksheets or handwriting
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
          if (!pdfjsLib) {
            alert("Moteur PDF.js en cours d'initialisation... Merci de réessayer dans un instant.");
            setIsPdfLoading(false);
            return;
          }
          
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          const extractedPages: string[] = [];

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.8 }); // balanced high fidelity size/resolution ratio
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (context) {
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: context, viewport: viewport }).promise;
              extractedPages.push(canvas.toDataURL("image/png"));
            }
          }

          if (extractedPages.length > 0) {
            setPdfPages(extractedPages);
            setCurrentPdfPageIndex(0);
            setBgImage(extractedPages[0]);
            setActiveTab("custom");
            // Wipe manual questions on new file load
            setCustomQuestions([]);
          }
        } catch (err) {
          console.error("Erreur lors de l'extraction des pages du PDF: ", err);
        } finally {
          setIsPdfLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Traditional image fallback
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

  const handleHandwritingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setHwImageName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setHwImage(event.target?.result as string);
        // Automatically analyze the handwriting
        analyzeHandwritingSample(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Analyze handwriting using backend Express route running gemini-3.5-flash
  const analyzeHandwritingSample = async (base64Img: string) => {
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksheetId: "preload",
          criteriaLevel: criteriaLevel,
          handwritingImage: base64Img,
        }),
      });
      const data = await response.json();
      if (data.success && data.handwritingStyle) {
        const style = data.handwritingStyle;
        setAnalysisResult(style);
        
        // Map suggested configurations
        if (style.suggestedFont) {
          // Normalize to font families
          const fontMap: { [key: string]: string } = {
            "caveat": "Caveat",
            "kalam": "Kalam",
            "shadows": "Shadows Into Light",
            "indie": "Indie Flower",
            "architects": "Architects Daughter",
            "schoolbell": "Schoolbell"
          };
          const cleanFont = fontMap[style.suggestedFont.toLowerCase()] || style.suggestedFont;
          setSelectedFont(cleanFont);
        }
        
        if (style.suggestedColor) {
          const colorMap: { [key: string]: string } = {
            blue: "#1e40af", // deep blue ink
            black: "#1e293b", // carbon black
            red: "#dc2626", // grading red
            green: "#16a34a", // correction green
          };
          setInkColor(colorMap[style.suggestedColor] || style.suggestedColor);
        }
        
        if (style.suggestedSize) {
          setFontSize(style.suggestedSize);
        }
        
        if (typeof style.suggestedRotation === "number") {
          setRotationAngle(style.suggestedRotation);
        }
      }
    } catch (e) {
      console.error("Analysis failed, using demo placeholders", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Triggers Gemini solver for custom worksheets
  const solveCustomWorksheet = async () => {
    if (!bgImage) return;
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksheetId: "custom",
          criteriaLevel: criteriaLevel,
          customAssessmentImage: bgImage,
          handwritingImage: hwImage,
        }),
      });
      const data = await response.json();
      if (data.success) {
        const loadedAnswers: { [qId: string]: string } = {};
        const loadedOffsets: { [qId: string]: { x: number; y: number } } = {};
        
        // Map detected questions
        const customQuestionsArr: WorksheetQuestion[] = data.questions.map((q: any, idx: number) => {
          loadedAnswers[q.id] = data.answers[q.id] || "";
          // Distribute custom answers sequentially down the page
          loadedOffsets[q.id] = { x: 0, y: 0 };
          return {
            id: q.id,
            number: idx + 1,
            questionText: q.text,
            defaultX: 15,
            defaultY: 25 + idx * 22,
            maxWidth: 550,
          };
        });

        // Set the active preloaded mock template to this custom parsed output
        const customTemplate = {
          id: "custom",
          title: "Évaluation Personnalisée Téléversée",
          pageNumber: 1,
          imageUrl: bgImage,
          questions: customQuestionsArr,
        };

        // Cache coordinates
        setEditableAnswers(loadedAnswers);
        setOffsets(loadedOffsets);
        
        // Push custom template to state by swapping tab
        setAnalysisResult({
          customTemplate,
          analysisDescription: "Rond de résolution Nanobanana appliqué avec succès sur votre feuille !"
        });
      }
    } catch (err) {
      console.error("Solving failed", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset offset coordinates to default positions
  const handleResetPositions = () => {
    const template = activeTab === "custom" && analysisResult?.customTemplate 
      ? analysisResult.customTemplate 
      : PRELOADED_TEMPLATES.find(t => t.id === selectedTemplateId);

    if (template) {
      const resetOffsets: { [qId: string]: { x: number; y: number } } = {};
      template.questions.forEach((q: any) => {
        resetOffsets[q.id] = { x: 0, y: 0 };
      });
      resetOffsets["student_info"] = { x: 0, y: 0 };
      setOffsets(resetOffsets);
      setGlobalOffsetX(0);
      setGlobalOffsetY(0);
    }
  };

  // Touch/Mouse Drag to Position individual answers on canvas
  const handleMouseDown = (e: React.MouseEvent, qId: string) => {
    setDraggedQId(qId);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedQId) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    
    setOffsets((prev) => ({
      ...prev,
      [draggedQId]: {
        x: (prev[draggedQId]?.x || 0) + dx,
        y: (prev[draggedQId]?.y || 0) + dy,
      },
    }));
    
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setDraggedQId(null);
  };

  // Convert handwriting page overlay into downloadable image or request browser print.
  const handleDownloadSheet = () => {
    setShowPrintNotice(true);
    // Auto collapse after 10s
    setTimeout(() => {
      setShowPrintNotice(false);
    }, 10000);
    window.print();
  };

  // Construct highly specific instructions prompt for "Banana / AI Solver" compatible with actual grading rubrics
  const generateBananaPrompt = () => {
    const templateTitle = currentTemplate?.title || "Fiche Devoir Al Kawthar";
    const questionsBlock = currentTemplate?.questions.map((q, idx) => {
      return `[Exercice ${q.id.includes("ex2") ? "2" : "1"} - Question ${idx + 1}] ID : "${q.id}"
Texte de la question : "${q.questionText}"`;
    }).join("\n\n") || "";

    const criteriaDetails = currentLevelInfo ? `${currentLevelInfo.level} - ${currentLevelInfo.title}\nDescription : ${currentLevelInfo.description}` : "";

    return `====================================================================
PROMPT DE GRADATION & RÉSOLUTION DE COPIE D'ÉLÈVE POUR BANANA / CHARGEMENT D'ÉVALUATION
====================================================================
Bonjour l'IA, tu es chargée de résoudre un devoir scolaire en simulant l'écriture d'un élève.
Le but est de générer les réponses sous format JSON structuré pour que nous puissions les projeter sur notre canevas de rendu scolaire "Nanobanana".

[MÉTADONNÉES DE L'ÉLÈVE]
- Nom et prénom de l'élève : ${studentName}
- Date de l'examen : ${examDate}

[GRILLE DE GRAVITÉ / BARÈME DEMANDÉ]
- Critère ciblé : Critère C (Traitement de l'information, Sciences Physiques / Mathématiques d'Al Kawthar)
- Niveau/Note de l'élève à simuler : Note de ${criteriaLevel} / 8
- Attentes académiques pour ce niveau ciblé :
${criteriaDetails}

[QUESTIONS DE L'ÉVALUATION À RÉSOUDRE]
Sujet : ${templateTitle}
${questionsBlock}

[DIRECTIVES DE RÉDACTION SÉCURISÉES POUR L'IA (COMPATIBLES AU RÉEL)]
1. Adopte rigoureusement le niveau cognitif correspondant au barème sélectionné :
   - Si Note = 1-2 ou 3-4 : Propose des erreurs de calcul (ex: faux calcul de TVA ou d'énergie par jour), des justifications incomplètes ou des phrases naïves.
   - Si Note = 5-6 : Propose des calculs corrects (ex: 135 € pour l'exercice 1, 10 kWh par jour) mais des analyses de textes scientifiques encore maladroites ou l'utilisation de termes imprécis.
   - Si Note = 7-8 : Fournis un travail exemplaire, des calculs de consommation parfaitement justifiés, une analyse technique critique montrant la partialité du blog d'opinion de l'Extrait A par rapport au rapport institutionnel factuel de l'Extrait B (AIEA).
2. Écris des phrases à la première personne ou sous forme de réponses d'adolescents (élèves réels de collège/lycée). Ne structure pas avec du markdown (pas de gras, pas d'italique, pas de listes à puces) car ce texte est destiné à être affiché comme écrit à la main au stylo bleu ou noir sur les pointillés !
3. N'utilise pas d'abréviations d'ordinateurs. Garde des sauts de ligne naturels courts pour tenir sur le papier.

[FORMAT DE SORTIE REQUIS EN RETOUR (JSON DIRECT ET PROPRE)]
Tu dois UNIQUEMENT renvoyer ce bloc de données structuré sans préambule ni texte explicatif :
{
  "success": true,
  "answers": {
    ${currentTemplate?.questions.map(q => `"${q.id}": "Rédige ici la réponse manuscrite simulée de l'élève correspondante (sans markdown)."`).join(",\n    ")}
  }
}
====================================================================`;
  };

  // Copy constructed prompt to clipboard for Banana ingestion
  const handleCopyPrompt = () => {
    const textToCopy = generateBananaPrompt();
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setPromptCopied(true);
        setTimeout(() => setPromptCopied(false), 3000);
      })
      .catch((err) => {
        console.error("Failed to copy using navigator.clipboard, falling back", err);
        try {
          const textArea = document.createElement("textarea");
          textArea.value = textToCopy;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          setPromptCopied(true);
          setTimeout(() => setPromptCopied(false), 3000);
        } catch (e) {
          // alert is blocked by frame permissions sometimes, so we let the user know via UI
        }
      });
  };

  // Map chosen font keys to styling classes
  const getFontFamilyClass = (fontName: string) => {
    switch (fontName) {
      case "Caveat": return "font-caveat";
      case "Kalam": return "font-kalam";
      case "Shadows Into Light": return "font-shadows";
      case "Indie Flower": return "font-indie";
      case "Architects Daughter": return "font-architects";
      case "Schoolbell": return "font-schoolbell";
      case "Parisienne": return "font-parisienne";
      case "Allura": return "font-allura";
      case "Homemade Apple": return "font-homemade";
      case "Bad Script": return "font-badscript";
      case "Marck Script": return "font-marck";
      case "La Belle Aurore": return "font-la-belle";
      default: return "font-homemade";
    }
  };

  // Get realistic student mistake scratch-out text to simulate extremely authentic worksheet responses
  const getRatureForQuestion = (qId: string) => {
    switch (qId) {
      case "ex1_q1": return "Correction : 900 x 0.50 = 450 €";
      case "ex1_q2": return "Consommation par jour = 900 / 30 = 30 kWh";
      case "ex1_q3": return "Hausse : 135 + 20% = 155 € de plus";
      case "ex1_q4": return "Conclusion : L’énergie est gratuite";
      case "ex2_q1": return "Opinion : L'extrait A est scientifique et neutre.";
      case "ex2_q2": return "L’expert n'a aucune preuve pour ses calculs.";
      case "ex2_q3": return "Il faut ignorer les rapports officiels d’agences.";
      default: return "Erreur : 15 x 900 = 13500 €";
    }
  };

  // Deterministic hash based on word text and its relative sequence index
  const getDeterministicHash = (str: string, index: number): number => {
    let hash = 0;
    const combined = str + index;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash) / 2147483647; // Float between 0 and 1
  };

  // Render a single word with custom organic slants and letter-by-letter deformations to look extremely messy and human
  const renderRealisticCursiveWord = (word: string, wordIdx: number, baseQId: string, styleOverride?: { font?: string; size?: number; slant?: number; thickness?: number }) => {
    const wordSeed = getDeterministicHash(word, wordIdx + (baseQId.charCodeAt(0) || 0));
    
    // Resolve dynamic styling variables per question/word block
    const refFont = styleOverride?.font || selectedFont;
    const refFontSize = styleOverride?.size || fontSize;
    const refSkewAngle = styleOverride?.slant !== undefined ? styleOverride.slant : skewAngle;
    const refThickness = styleOverride?.thickness !== undefined ? styleOverride.thickness : penThickness;
    const refInkColor = inkColor;

    // Base word properties (keeps the word clumped naturally)
    const baseWordY = (wordSeed - 0.5) * 2 * wordDrift;
    const baseWordRot = (wordSeed * 0.8 - 0.4) * fontJitter * 0.5;
    
    // Split the word into individual characters for extreme micro-deformations (mauvaise écriture / ratures réelles)
    const letters = word.split("");
    const renderedLetters = letters.map((char, charIdx) => {
      // Deterministic signature per letter
      const charSeed = getDeterministicHash(char, wordIdx * 100 + charIdx + (baseQId.charCodeAt(0) || 0));
      
      // 1. Awkward mixed case chaos (e.g. 'e' -> 'E', 's' -> 'S') simulating a clumsy child's hand
      let finalChar = char;
      if (letterCaseChaos && charSeed > 0.85 && char.toLowerCase() !== char.toUpperCase()) {
        finalChar = charSeed > 0.92 ? char.toUpperCase() : char.toLowerCase();
      }

      // 2. Local letter vertical drift (helps wavy, unaligned writing)
      const letterY = (charSeed - 0.5) * messinessIntensity * 2.2;
      
      // 3. Local horizontal displacement (unsteady alignment and overlap)
      const letterX = (charSeed * 0.6 - 0.3) * messinessIntensity * 1.3;

      // 4. Local letter slant (left/right wrist tension variation)
      const letterSkew = refSkewAngle + (charSeed - 0.5) * messinessIntensity * 4.5;

      // 5. Letter size jitter
      const letterSizeModifier = (charSeed * 0.8 - 0.4) * messinessIntensity * 1.4;

      // 6. Letter micro-rotation
      const letterRot = (charSeed - 0.5) * messinessIntensity * 5.5;

      // 7. Ballpoint ink skip simulation (ink fades or runs dry under pressure)
      let opacity = 1;
      let textShadow = "0.1px 0.1px 0.1px rgba(0,0,0,0.15)";
      if (inkDrySkipping && charSeed < 0.12) {
        opacity = 0.55 + charSeed * 2.0; // skips to 55%-79% opacity
      } else if (charSeed > 0.94) {
        // heavy ink pool
        textShadow = `0px 0px 1px ${refInkColor}, 0.2px 0.2px 0.2px rgba(0,0,0,0.4)`;
      }

      const letterStyle: React.CSSProperties = {
        display: "inline-block",
        transform: `translate(${letterX}px, ${letterY}px) rotate(${letterRot}deg) skewX(${letterSkew}deg)`,
        fontSize: `${Math.max(9, refFontSize + letterSizeModifier)}px`,
        opacity,
        textShadow,
        transition: "all 0.1s ease",
        // Connect letters dynamic spacing
        marginLeft: charIdx === 0 ? "0px" : `${letterSpacing + (charSeed - 0.5) * 1.2}px`,
        fontFamily: `var(--font-${getFontFamilyClass(refFont).replace("font-", "")})`,
        WebkitTextStroke: refThickness > 1.1 ? `${(refThickness - 1.1) * 0.35}px ${refInkColor}` : "0px",
      };

      return (
        <span key={charIdx} style={letterStyle} className="select-none inline-block">
          {finalChar}
        </span>
      );
    });

    const wordStyle: React.CSSProperties = {
      display: "inline-block",
      transform: `translateY(${baseWordY}px) rotate(${baseWordRot}deg)`,
      marginRight: `${6 + (wordSeed - 0.5) * 5 + messinessIntensity * 1.5}px`, // variable spacing between messy words
      whiteSpace: "nowrap",
    };

    // Determine if the word should be highlighted with a green correct marker
    const keywordsToUnderline = [
      "135", "165", "10", "kWh", "162", "27", "éco", "fiabilité", "aiea", "gouvernemental",
      "rapports", "blogs", "parfaite", "calculs", "erreur", "faux", "analyse", "technique"
    ];

    const shouldUnderline = keywordsToUnderline.some(kw => word.toLowerCase().includes(kw));

    if (shouldUnderline && enableGreenUnderlines) {
      return (
        <span key={wordIdx} className="relative inline-block" style={wordStyle}>
          <span className="inline-block">{renderedLetters}</span>
          {/* Custom curvy correction overlay path */}
          <svg className="absolute left-0 bottom-[-2.5px] w-full h-[6.5px] text-emerald-600/90 overflow-visible pointer-events-none select-none" preserveAspectRatio="none" viewBox="0 0 100 10">
            <path 
              d="M 1 5 C 15 2, 40 7, 70 3 C 85 2, 95 6, 99 5" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.8" 
              strokeLinecap="round" 
            />
          </svg>
        </span>
      );
    }

    return (
      <span key={wordIdx} style={wordStyle} className="inline-block">
        {renderedLetters}
      </span>
    );
  };

  // Process and render lines with organic flow, drift, and hand deformation controls
  const renderRealisticDeformedText = (qId: string, text: string, styleOverride?: { font?: string; size?: number; slant?: number; thickness?: number }) => {
    if (!text) return null;
    
    // Fallback if no local style passed
    const style = styleOverride || { font: selectedFont, size: fontSize, slant: skewAngle, thickness: penThickness };
    const lines = text.split("\n");
    return (
      <div className="flex flex-col space-y-1.5 ink-soaking" style={{ lineHeight: `${(style.size || fontSize) * 1.5}px` }}>
        {lines.map((line, lineIdx) => {
          const words = line.split(/\s+/).filter(w => w.length > 0);
          return (
            <div key={lineIdx} className="flex flex-wrap items-center">
              {words.map((word, wordIdx) => renderRealisticCursiveWord(word, lineIdx * 100 + wordIdx, qId, style))}
              {words.length === 0 && <div className="h-4" />}
            </div>
          );
        })}
      </div>
    );
  };

  // Backward compatibility wrapper
  const renderRealisticTextWithCorrections = (qId: string, text: string, styleOverride?: any) => {
    return renderRealisticDeformedText(qId, text, styleOverride);
  };

  // Render original school assessment layout on canvas using Tailwind elements
  const currentLevelInfo = EXAM_CRITERIA_LEVELS.find(l => l.level === criteriaLevel);
  const currentTemplate = activeTab === "custom"
    ? {
        id: pdfPages.length > 0 
          ? (currentPdfPageIndex === 2 ? "page3" : currentPdfPageIndex === 3 ? "page4" : currentPdfPageIndex === 4 ? "page5" : "custom")
          : "custom",
        title: pdfPages.length > 0 
          ? `Évaluation PDF - Page ${currentPdfPageIndex + 1}` 
          : "Évaluation Personnalisée Téléversée",
        pageNumber: pdfPages.length > 0 ? currentPdfPageIndex + 1 : 1,
        imageUrl: bgImage || "custom_bg",
        questions: activeQuestions
      }
    : PRELOADED_TEMPLATES.find(t => t.id === selectedTemplateId);

  return (
    <div className="min-h-screen bg-yellow-400 flex flex-col text-black antialiased" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Header Top Bar */}
      <header className="bg-white/90 backdrop-blur-md border-b-4 border-black px-6 py-4 flex flex-wrap justify-between items-center sticky top-0 z-50 shadow-[0_4px_0_0_rgba(0,0,0,1)]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-yellow-400 font-black italic text-xl shadow-[2px_2px_0_0_rgba(250,204,21,1)]">
            nb
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black flex items-center gap-2">
              nanobanana
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-yellow-400 border-2 border-black text-black font-extrabold shadow-[2px_2px_0_0_rgba(0,0,0,1)]">PRO</span>
            </h1>
            <p className="text-xs font-bold text-black/70">Génération d'évaluations sous forme manuscrite réaliste</p>
          </div>
        </div>

        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          <div className="flex items-center space-x-1.5 text-xs bg-lime-400 text-black font-black border-2 border-black py-1.5 px-3 rounded-xl shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
            <span className="h-2 w-2 rounded-full bg-black animate-pulse"></span>
            <span>SERVEURS EN LIGNE • GEMINI 3.5</span>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Drawer - Controls & Input Options */}
        <aside className="lg:col-span-5 space-y-6">
          
          {/* Section 1: Source Worksheets Selection */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-black text-black flex items-center gap-2">
                <span className="bg-blue-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">01</span>
                Importer les devoirs
              </h2>
              <div className="flex space-x-1 bg-black p-1 rounded-xl">
                <button
                  onClick={() => { setActiveTab("preload"); setBgImage(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === 'preload' ? 'bg-yellow-400 text-black border border-black shadow-[2px_2px_0px_rgb(0,0,0)]' : 'text-white hover:text-yellow-400'}`}
                >
                  Modèle Al Kawthar
                </button>
                <button
                  onClick={() => setActiveTab("custom")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === 'custom' ? 'bg-yellow-400 text-black border border-black shadow-[2px_2px_0px_rgb(0,0,0)]' : 'text-white hover:text-yellow-400'}`}
                >
                  Autre Fiche
                </button>
              </div>
            </div>

            {activeTab === "preload" ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-black/70 block">Choisissez la page d'examen à résoudre :</label>
                <div className="grid grid-cols-3 gap-3">
                  {PRELOADED_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`py-3 px-3 text-xs font-black border-2 rounded-2xl text-center transition-all flex flex-col items-center justify-center ${selectedTemplateId === t.id ? 'border-black bg-yellow-400 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]' : 'border-black/20 hover:border-black bg-white hover:bg-yellow-50 text-black'}`}
                    >
                      <FileText className="h-5 w-5 mb-1 text-black shrink-0" />
                      <span>Page {t.pageNumber}</span>
                      <span className="text-[9px] opacity-70 truncate max-w-full font-bold">
                        {t.pageNumber === 3 ? "Exercice 1" : "Exercice 2"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border-4 border-dashed border-black/40 rounded-2xl p-6 bg-slate-50 text-center relative transition hover:bg-yellow-50/50 cursor-pointer">
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleWorksheetUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {isPdfLoading ? (
                    <RefreshCw className="h-8 w-8 text-black/60 mx-auto mb-2 animate-spin text-blue-500" />
                  ) : (
                    <Upload className="h-8 w-8 text-black/60 mx-auto mb-2" />
                  )}
                  <p className="text-xs font-black text-black">
                    {isPdfLoading ? "Séparation du PDF en cours..." : "Téléverser de nouveaux devoirs (PDF ou Image)"}
                  </p>
                  <p className="text-[10px] text-black/60 mt-1">Glissez-déposez un fichier PDF d'évaluation complet ou une image PNG/JPG</p>
                </div>

                {pdfPages.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-dashed border-black/20">
                    <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider block">📄 Pages splitées automatiquement :</span>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-black">
                      {pdfPages.map((pageSrc, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCurrentPdfPageIndex(idx);
                            setBgImage(pageSrc);
                          }}
                          className={`flex-shrink-0 w-16 h-22 border-2 rounded-lg overflow-hidden relative transition-all ${currentPdfPageIndex === idx ? 'border-yellow-400 scale-105 shadow-[2px_2px_0px_rgba(0,0,0,1)]' : 'border-black/20 hover:border-black'}`}
                        >
                          <img src={pageSrc} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute bottom-0 right-0 left-0 bg-black/75 text-white py-0.5 text-[8.5px] text-center font-black">
                            P. {idx + 1}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAddCustomTextLine}
                    className="w-full px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 border-2 border-black rounded-xl font-black text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center space-x-1"
                  >
                    <span>➕ AJOUTER UNE ZONE D'ÉCRITURE MANUELLE LIÉE</span>
                  </button>

                  {bgImage && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-blue-50 border-2 border-black rounded-xl">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-lg">🖼️</span>
                        <span className="text-xs font-black text-black truncate">Support chargé ({pdfPages.length > 0 ? `Page ${currentPdfPageIndex + 1}` : "Image"})</span>
                      </div>
                      <button
                        type="button"
                        onClick={solveCustomWorksheet}
                        disabled={isAnalyzing}
                        className="w-full sm:w-auto px-4 py-2 bg-black text-white hover:bg-zinc-950 border-2 border-black rounded-xl font-black text-xs shadow-[3px_3px_0px_0px_rgba(59,130,246,1)] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center justify-center space-x-1"
                      >
                        {isAnalyzing ? (
                          <RefreshCw className="h-3 w-3 animate-spin text-yellow-400" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-yellow-400" />
                        )}
                        <span>RÉSOUDRE VIA AI</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Student Handwriting Sample */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-black text-black flex items-center gap-2">
              <span className="bg-pink-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">02</span>
              Échantillon d'Écriture de l'Élève (Facultatif)
            </h2>
            <p className="text-xs font-bold text-black/60 leading-relaxed">
              Nanobanana analysera l'image de son écriture pour calibrer dynamiquement l'orientation, la taille des lettres et le choix de police.
            </p>

            <div className="border-4 border-dashed border-black/40 rounded-2xl p-6 bg-slate-50 text-center relative transition hover:bg-yellow-50/50 cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleHandwritingUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="h-8 w-8 text-black/60 mx-auto mb-2" />
              <p className="text-xs font-black text-black">
                {hwImageName ? hwImageName : "Téléverser l'écriture de l'élève"}
              </p>
              <p className="text-[10px] text-black/60 mt-1">Fournissez un paragraphe manuscrit d'exemple</p>
            </div>

            {isAnalyzing && (
              <div className="flex items-center space-x-2 text-xs font-bold text-black bg-yellow-400 p-3 rounded-xl border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <RefreshCw className="h-4 w-4 animate-spin text-black shrink-0" />
                <span>Analyse du style d'écriture de l'élève par l'IA...</span>
              </div>
            )}

            {analysisResult?.analysisDescription && (
              <div className="bg-emerald-50 border-2 border-black p-4 rounded-xl space-y-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center text-xs font-black text-black gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Style d'Écriture Détecté</span>
                  <span className="ml-auto text-[10px] bg-emerald-200 px-2 py-0.5 rounded border border-emerald-400 font-extrabold">Fiabilité : {analysisResult.confidenceScore || 96}%</span>
                </div>
                <p className="text-xs font-medium text-emerald-950 leading-relaxed">
                  {analysisResult.analysisDescription}
                </p>
              </div>
            )}

            {/* Student Profile Saving and Loading - Locally Persistent Custom Profile Library */}
            <div className="bg-slate-50 border-2 border-black rounded-2xl p-4 space-y-3 shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] text-black mt-3">
              <div className="flex items-center gap-1.5 text-xs font-black text-black">
                <span className="text-sm">💾</span>
                <span>Bibliothèque des Écritures Élèves</span>
              </div>
              
              <p className="text-[10px] text-black/60 font-bold leading-tight">
                Quand vous ajoutez un échantillon d'écriture d'un élève, enregistrez-le sous son nom pour l'appliquer instantanément sur d'autres évaluations.
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-black/70">Nom complet de l'élève à enregistrer :</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Ex: Fatima Al-Kawthar..."
                    className="flex-1 bg-white border-2 border-black rounded-xl text-xs font-extrabold px-3 py-1.5 focus:outline-none focus:ring-0"
                  />
                  <button
                    onClick={handleSaveStudentProfile}
                    className="bg-lime-400 hover:bg-lime-300 border-2 border-black text-black font-black px-3.5 py-1.5 rounded-xl text-xs shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-all hover:-translate-y-0.5"
                    title="Enregistrer les réglages et l'échantillon d'écriture sous ce nom"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>

              {savedProfiles.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-black/10">
                  <p className="text-[10px] text-black font-black uppercase tracking-wider">Profils élèves sauvegardés ({savedProfiles.length}) :</p>
                  <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {savedProfiles.map((p) => (
                      <div key={p.name} className="flex items-center justify-between gap-2 p-1 bg-white border-2 border-black/10 hover:border-black rounded-lg transition-all">
                        <button
                          onClick={() => handleLoadStudentProfile(p)}
                          className={`flex-1 text-left px-2 py-1 text-xs font-extrabold truncate ${
                            studentName.toLowerCase() === p.name.toLowerCase() ? "text-purple-600 font-black" : "text-slate-700"
                          }`}
                        >
                          👤 {p.name}
                        </button>
                        <button
                          onClick={() => handleDeleteStudentProfile(p.name)}
                          className="text-red-500 hover:text-white hover:bg-red-500 font-extrabold shrink-0 border border-transparent hover:border-black/30 p-1 text-[10px] rounded"
                          title="Supprimer ce profil"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section 3: Target Criterion C Grade selection */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-black text-black flex items-center gap-2">
                <span className="bg-yellow-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">03</span>
                Note Cible (Critère C - Sciences)
              </h2>
              <span className="text-[10px] bg-yellow-400 border-2 border-black text-black px-2 py-0.5 rounded-full font-black uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                Barème (8)
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {EXAM_CRITERIA_LEVELS.map((levelObj) => (
                <button
                  key={levelObj.level}
                  onClick={() => setCriteriaLevel(levelObj.level)}
                  className={`py-3 px-2 border-2 rounded-xl text-center transition-all flex flex-col justify-center items-center ${criteriaLevel === levelObj.level ? 'border-black bg-rose-400 text-black font-black shadow-[3px_3px_0px_rgba(0,0,0,1)]' : 'border-black/20 hover:border-black bg-white hover:bg-rose-50/50 text-black'}`}
                >
                  <span className="text-sm font-black block">{levelObj.level}</span>
                  <span className="text-[8px] uppercase tracking-wider font-extrabold opacity-75 mt-0.5">Note</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={criteriaLevel}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="bg-slate-50 border-2 border-black p-4 rounded-xl space-y-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
              >
                <h4 className="text-xs font-black text-black">{currentLevelInfo?.title}</h4>
                <p className="text-[11px] text-black/70 font-bold leading-relaxed">
                  {currentLevelInfo?.description}
                </p>
                <div className="text-[10px] text-indigo-600 font-black">
                  → Réponses adaptées selon les attentes de l'examinateur Al Kawthar.
                </div>
              </motion.div>
            </AnimatePresence>
          </section>

          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-black text-black flex items-center gap-2">
              <span className="bg-purple-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">04</span>
              Réglages de l'Écriture Manuscrite
            </h2>

            {/* Quick Presets matching user image */}
            <div className="bg-purple-50 border-2 border-purple-200 p-3 rounded-xl text-xs space-y-1">
              <span className="font-extrabold text-purple-950 block">✨ Préréglage Devoir Élève (Cursive Réaliste) :</span>
              <p className="text-[10.5px] text-purple-900/80 leading-snug">
                Pour reproduire exactement l'écriture maladroite d'un élève (imperfections d'encre réelles, lettres penchées et parfois brouillonnes).
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFont("Homemade Apple");
                    setSkewAngle(-4);
                    setWordDrift(1.8);
                    setLetterSpacing(-0.5);
                    setFontJitter(2.0);
                    setRotationAngle(-0.5);
                    setFontSize(19);
                    setMessinessIntensity(2.4);
                    setLetterCaseChaos(true);
                    setInkDrySkipping(true);
                  }}
                  className="bg-purple-400 hover:bg-purple-300 border border-black text-black font-extrabold px-2.5 py-1 rounded shadow-[1.5px_1.5px_0_0_rgba(0,0,0,1)] text-[10px]"
                >
                  Appliquer l'écriture de l'image ❤️ (Forte Réalité)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFont("La Belle Aurore");
                    setSkewAngle(-6);
                    setWordDrift(3.8);
                    setLetterSpacing(-0.9);
                    setFontJitter(3.2);
                    setRotationAngle(-1.2);
                    setFontSize(21);
                    setMessinessIntensity(4.2);
                    setLetterCaseChaos(true);
                    setInkDrySkipping(true);
                  }}
                  className="bg-rose-400 hover:bg-rose-300 border border-black text-black font-extrabold px-2.5 py-1 rounded shadow-[1.5px_1.5px_0_0_rgba(0,0,0,1)] text-[10px]"
                >
                  Très mauvaise écriture (Parfois illisible) 🤒
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFont("Marck Script");
                    setSkewAngle(-2);
                    setWordDrift(1);
                    setLetterSpacing(-0.2);
                    setFontJitter(1);
                    setRotationAngle(0);
                    setFontSize(17);
                    setMessinessIntensity(0.8);
                    setLetterCaseChaos(false);
                    setInkDrySkipping(false);
                  }}
                  className="bg-white hover:bg-slate-50 border border-black text-black font-extrabold px-2 py-0.5 rounded shadow-[1px_1px_0_0_rgba(0,0,0,1)] text-[10px]"
                >
                  Cursive Feutre (Scolaire Propre)
                </button>
              </div>
            </div>

            {/* Toggle Random/Organic Variance per block */}
            <div className="bg-amber-50 border-2 border-amber-400 p-2.5 rounded-xl space-y-1">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableOrganicRandomStyle}
                  onChange={(e) => setEnableOrganicRandomStyle(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-0 cursor-pointer"
                />
                <span className="text-[11px] font-black text-black leading-tight">
                  🌟 Style Aléatoire per Bloc (Recommandé)
                </span>
              </label>
              <p className="text-[9px] text-amber-800 leading-normal pl-6">
                Laisse ça random ! Évite toute standardisation numérique : chaque correction et rature est tracée avec une police, un slant et un angle d'inclinaison uniques.
              </p>
            </div>

            {/* Font Style Selection */}
            <div className="space-y-2">
              <label className="text-xs font-black text-black/70 flex justify-between select-none">
                <span>Police d'écriture de base :</span>
                <span className="text-[10px] bg-purple-200 border border-purple-500 px-2 rounded-full font-black text-black uppercase">{selectedFont}</span>
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-[190px] overflow-y-auto pr-1">
                {[
                  { id: "Homemade Apple", label: "✍️ Student Natural" },
                  { id: "Marck Script", label: "🖋️ Cursive Feutre" },
                  { id: "Parisienne", label: "🎀 Cursive Fine" },
                  { id: "Allura", label: "🌸 Cursive Fluide" },
                  { id: "La Belle Aurore", label: "📝 Cursive Stylée" },
                  { id: "Bad Script", label: "✏️ Écriture Plume" }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFont(f.id)}
                    className={`p-1.5 border-2 text-[11px] text-left rounded-xl truncate transition-all font-black ${selectedFont === f.id ? 'border-black bg-purple-400 text-black shadow-[2.5px_2.5px_0px_rgba(0,0,0,1)]' : 'border-black/10 hover:border-black bg-white text-black'}`}
                    style={{ fontFamily: f.id }}
                    title={f.id}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pen Tip Point Thickness choice ("La pointure du stylo au choix") */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Épaisseur / Pointure du Stylo :</span>
                <span className="text-[10px] bg-sky-200 border border-sky-500 px-2 rounded-full font-black text-black uppercase">
                  {penThickness <= 1.2 ? "Fine (0.38mm)" : penThickness <= 1.8 ? "Moyenne (0.50mm)" : penThickness <= 2.4 ? "Épaisse (0.70mm)" : "Felt-Tip (1.000mm)"}
                </span>
              </div>
              <input
                type="range"
                min="0.8"
                max="3.2"
                step="0.1"
                value={penThickness}
                onChange={(e) => setPenThickness(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
              <div className="flex justify-between gap-1">
                {[
                  { label: "Fine 0.38", value: 1.1 },
                  { label: "Bille 0.5", value: 1.5 },
                  { label: "Gel 0.7", value: 2.1 },
                  { label: "Feutre 1.0", value: 2.8 }
                ].map((pt) => (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => setPenThickness(pt.value)}
                    className={`flex-1 text-[9px] font-extrabold border py-0.5 rounded text-center transition-all ${penThickness === pt.value ? 'bg-sky-400 border-black text-black' : 'bg-slate-50 border-slate-200 hover:border-black text-slate-500'}`}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ink Ink-Color Selection */}
            <div className="space-y-2">
              <label className="text-xs font-black text-black/70">Couleur de l'encre réaliste :</label>
              <div className="flex flex-wrap gap-2 items-center">
                {[
                  { name: "Bleu Stylo à Bille (SHEEN)", hex: "#1d3278" },
                  { name: "Bleu Gel Indigo Intense", hex: "#121b4a" },
                  { name: "Option Effaçable Clémenceau", hex: "#3445ad" },
                  { name: "Crayon Graphite HB", hex: "#2b2c2e" },
                  { name: "Rouge Stylo Enseignant", hex: "#cf1515" },
                  { name: "Vert Correcteur de Copies", hex: "#0b8c2c" },
                  { name: "Violet Encre Plume", hex: "#521d82" }
                ].map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => setInkColor(color.hex)}
                    className={`h-8 w-8 rounded-full relative transition shrink-0 border-2 border-black ${inkColor === color.hex ? 'ring-2 ring-black scale-110 shadow-[2.5px_2.5px_0px_rgba(0,0,0,1)]' : 'hover:scale-105'}`}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  >
                    {inkColor === color.hex && (
                      <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-black">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size adjustments */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Taille des lettres :</span>
                <span>{fontSize}px</span>
              </div>
              <input
                type="range"
                min="12"
                max="28"
                step="0.5"
                value={fontSize}
                onChange={(e) => setFontSize(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Inclination (Skew) deformation mimicking writing hand posture */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Déformation / Slant de l'écriture (Inclinaison droite) :</span>
                <span>{skewAngle}°</span>
              </div>
              <input
                type="range"
                min="-15"
                max="15"
                step="0.5"
                value={skewAngle}
                onChange={(e) => setSkewAngle(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Word Wavering Drift (Wavy lines on paper) */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Oscillation sur la ligne (Hauteur des mots) :</span>
                <span>{wordDrift}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.2"
                value={wordDrift}
                onChange={(e) => setWordDrift(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Letters spacing compaction and jointures */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Compaction / Espacement des lettres :</span>
                <span>{letterSpacing}px</span>
              </div>
              <input
                type="range"
                min="-4"
                max="3"
                step="0.1"
                value={letterSpacing}
                onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Font Jitter / Imperfect Letter sizing randomness */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Imperfections & Jitter des lettres :</span>
                <span>{fontJitter}</span>
              </div>
              <input
                type="range"
                min="0"
                max="4"
                step="0.1"
                value={fontJitter}
                onChange={(e) => setFontJitter(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* HIGH-REALISM ADVANCED MESSY OPTIONS FOR "MAUVAISE ECRITURE" */}
            <div className="pt-3 border-t border-black/10 space-y-3 pb-2">
              <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 uppercase tracking-wide block w-fit">🔥 Options d'Écriture Illisible & Brouillon</span>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-800 font-extrabold">
                  <span>Désordre & Déformations (Mauvaise Écriture) :</span>
                  <span className="text-rose-600 font-black">{messinessIntensity}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={messinessIntensity}
                  onChange={(e) => setMessinessIntensity(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
                />
                <p className="text-[9.5px] text-black/60 leading-tight">
                  Augmentez pour tordre et désaligner chaque lettre individuellement, rendant les réponses de l'élève brouillonnes ou presque incompréhensibles.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border border-black rounded-xl transition-all select-none col-span-1">
                  <input
                    type="checkbox"
                    checked={letterCaseChaos}
                    onChange={(e) => setLetterCaseChaos(e.target.checked)}
                    className="w-4 h-4 accent-black shrink-0"
                  />
                  <span className="text-[10px] font-extrabold text-slate-800">Mélanger Majuscules/Minuscules</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border border-black rounded-xl transition-all select-none col-span-1">
                  <input
                    type="checkbox"
                    checked={inkDrySkipping}
                    onChange={(e) => setInkDrySkipping(e.target.checked)}
                    className="w-4 h-4 accent-black shrink-0"
                  />
                  <span className="text-[10px] font-extrabold text-slate-800">Simuler Manque d'Encre / Pression</span>
                </label>
              </div>
            </div>

            {/* Slant adjustments (Whole block rotation) */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-black/70 font-black">
                <span>Rotation globale du bloc de texte :</span>
                <span>{rotationAngle}°</span>
              </div>
              <input
                type="range"
                min="-8"
                max="8"
                step="0.2"
                value={rotationAngle}
                onChange={(e) => setRotationAngle(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
              />
            </div>

            {/* Alignment Offsets */}
            <div className="pt-3 border-t-2 border-dotted border-black/30 space-y-3">
              <span className="text-[10px] font-black text-black/50 uppercase tracking-wider block">Réalignement global des lignes</span>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-black/75">Ajustement H : {globalOffsetX}px</label>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    value={globalOffsetX}
                    onChange={(e) => setGlobalOffsetX(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-black/75">Ajustement V : {globalOffsetY}px</label>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    value={globalOffsetY}
                    onChange={(e) => setGlobalOffsetY(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 border border-black rounded-lg cursor-pointer accent-black"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section 5: Realisme Extreme & Scanner Effect (La Touche Realiste !) */}
          <section className="bg-white rounded-3xl border-4 border-black p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-black text-black flex items-center gap-2">
              <span className="bg-lime-400 text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs font-black">05</span>
              Réalisme Extrême & Scanner 📷
            </h2>
            <p className="text-xs font-bold text-black/60 leading-relaxed">
              Ajoutez des gestes d'élèves (ratures), annotations de prof, ou filtres de numérisation pour un rendu d'une authenticité totale.
            </p>

            <div className="space-y-3 pt-1">
              {/* Student Name and Date input area */}
              <div className="border-2 border-black rounded-xl p-3 bg-yellow-50/50 space-y-2">
                <span className="text-[10px] font-black text-black uppercase tracking-wider block">Identité de l'Élève sur la Feuille</span>
                
                <label className="flex items-center space-x-2 cursor-pointer pb-1 select-none">
                  <input
                    type="checkbox"
                    checked={showStudentHeader}
                    onChange={(e) => setShowStudentHeader(e.target.checked)}
                    className="w-4 h-4 accent-black shrink-0"
                  />
                  <span className="text-[10px] font-black uppercase text-black">Afficher l'Identité (Nom & Date)</span>
                </label>

                {showStudentHeader && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-black/70">Nom :</label>
                      <input
                        type="text"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        className="w-full bg-white border-2 border-black rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-black/70">Date :</label>
                      <input
                        type="text"
                        value={examDate}
                        onChange={(e) => setExamDate(e.target.value)}
                        className="w-full bg-white border-2 border-black rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Paper Selection and Scanner Adjustments */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-black">Type de Support :</label>
                  <select
                    value={paperType}
                    onChange={(e: any) => setPaperType(e.target.value)}
                    className="w-full bg-white border-2 border-black rounded-lg p-1.5 font-bold focus:outline-none"
                  >
                    <option value="dotted">Petits Points (Dotted)</option>
                    <option value="seyyes">Grandes Lignes (Seyès)</option>
                    <option value="carreaux">Petits Carreaux (5x5)</option>
                    <option value="blank">Page Blanche Examen</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-black">Filtre Photocan / Scan :</label>
                  <select
                    value={scannerPreset}
                    disabled={!enableScannerFilter}
                    onChange={(e: any) => setScannerPreset(e.target.value)}
                    className="w-full bg-white border-2 border-black rounded-lg p-1.5 font-bold focus:outline-none disabled:opacity-50"
                  >
                    <option value="color-vintage">Scan Couleur Vintage 📔</option>
                    <option value="photocopy-grey">Photocopieur Noir & Blanc 📠</option>
                    <option value="scanner-high-contrast">Scan Bureau Haute Clarté 🏛️</option>
                    <option value="raw">Brut (Sans aucun filtre)</option>
                  </select>
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border-2 border-black rounded-xl transition-all select-none col-span-1">
                  <input
                    type="checkbox"
                    checked={enableScannerFilter}
                    onChange={(e) => setEnableScannerFilter(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-[11px] font-black text-black">Scanner Actif</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border-2 border-black rounded-xl transition-all select-none col-span-1">
                  <input
                    type="checkbox"
                    checked={enableSlightTilt}
                    onChange={(e) => setEnableSlightTilt(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-[11px] font-black text-black">Inclinaison Scan</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border-2 border-black rounded-xl transition-all select-none col-span-1">
                  <input
                    type="checkbox"
                    checked={enablePaperGrain}
                    onChange={(e) => setEnablePaperGrain(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-[11px] font-black text-black">Texture Papier</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border-2 border-black rounded-xl transition-all select-none col-span-1">
                  <input
                    type="checkbox"
                    checked={enablePaperStains}
                    onChange={(e) => setEnablePaperStains(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-[11px] font-black text-black">Taches & Café</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border-2 border-black rounded-xl transition-all select-none col-span-1">
                  <input
                    type="checkbox"
                    checked={enableRatures}
                    onChange={(e) => setEnableRatures(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-[11px] font-black text-black">Ratures (<s>abc</s>)</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 hover:bg-slate-100 p-2 border-2 border-black rounded-xl transition-all select-none col-span-1">
                  <input
                    type="checkbox"
                    checked={enableDoodles}
                    onChange={(e) => setEnableDoodles(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-[11px] font-black text-black">Brouillons</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-emerald-50 hover:bg-emerald-100 p-2 border-2 border-black rounded-xl transition-all select-none col-span-2">
                  <input
                    type="checkbox"
                    checked={enableGreenUnderlines}
                    onChange={(e) => setEnableGreenUnderlines(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-[11px] font-black text-emerald-950">Soulignés correctifs (Vert prof) ✓</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-rose-50 hover:bg-rose-100 p-2 border-2 border-black rounded-xl transition-all select-none col-span-2">
                  <input
                    type="checkbox"
                    checked={enableTeacherMarks}
                    onChange={(e) => setEnableTeacherMarks(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span className="text-[11px] font-black text-rose-950">Notes & Timbres prof (Rouge) ★</span>
                </label>
              </div>
            </div>
          </section>

        </aside>

         {/* Right Preview - Live High Fidelity Worksheet Paper Layout */}
        <main className="lg:col-span-7 flex flex-col items-center">
          
          {/* Action Toolbar above worksheet */}
          <div className="w-full bg-black text-white border-4 border-black rounded-t-3xl px-6 py-4 flex flex-wrap justify-between items-center gap-3 shadow-[6px_0px_0px_0px_rgba(0,0,0,1)] z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="bg-lime-400 p-1 rounded-lg border border-black text-black shrink-0">
                <Layers className="h-4 w-4" />
              </span>
              <span className="text-xs font-black uppercase tracking-wider select-none">Aperçu du résultat • Page A4</span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleResetPositions}
                className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 border-2 border-black text-black rounded-xl text-xs font-black shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none flex items-center space-x-1.5"
                title="Rétablir les coordonnées à zéro"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Rétablir</span>
              </button>
              <button
                onClick={handleDownloadSheet}
                className="px-4 py-2 bg-blue-400 hover:bg-blue-300 border-2 border-black text-black rounded-xl text-xs font-black shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none flex items-center space-x-1.5"
              >
                <Download className="h-4 w-4" />
                <span>Imprimer / PDF</span>
              </button>
            </div>
          </div>

          {/* Worksheet sheet board container */}
          <div className="w-full border-x-4 border-b-4 border-black bg-black/15 p-4 lg:p-8 flex items-center justify-center overflow-auto rounded-b-3xl h-[1000px] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] bg-grid-pattern">
            
            {/* Elegant physical paper card mimicking teacher layouts with exact text */}
            <div 
              id="printed-worksheet-paper"
              ref={sheetContainerRef}
              className={`relative w-[700px] min-h-[920px] bg-white text-slate-900 px-10 py-12 border border-slate-300 rounded select-none ${
                activeTab === "custom" ? "bg-white" : 
                paperType === "blank" ? "bg-white" :
                paperType === "dotted" ? "bg-grid-pattern" :
                paperType === "seyyes" ? "bg-seyyes-pattern" :
                paperType === "carreaux" ? "bg-carreaux-pattern" :
                "bg-grid-pattern"
              } print:shadow-none print:border-none print:m-0 transition-all duration-300`}
              style={{ 
                minHeight: "920px",
                transform: enableSlightTilt ? "scale(0.98) rotate(0.4deg)" : "none",
                filter: !enableScannerFilter ? "none" :
                  scannerPreset === "color-vintage" ? "sepia(0.08) contrast(1.18) brightness(1.01) saturate(1.12) contrast(1.05)" :
                  scannerPreset === "photocopy-grey" ? "grayscale(1.0) contrast(1.48) brightness(1.02) contrast(1.1)" :
                  scannerPreset === "scanner-high-contrast" ? "contrast(1.32) brightness(1.02) saturate(0.8) contrast(1.06)" :
                  "contrast(1.15) brightness(1.02) saturate(0.92) contrast(1.04)",
                boxShadow: enableSlightTilt ? "12px 12px 28px rgba(0,0,0,0.18)" : "0 4px 6px -1px rgba(0,0,0,0.1)",
                transformOrigin: "center center"
              }}
            >
              {/* Hidden SVG with authentic handwriting ink bleed filters for digital rendering */}
              <svg style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }} aria-hidden="true">
                <defs>
                  <filter id="authentic-ink-bleed">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="0.25" result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -5" result="goo" />
                    <feMerge>
                      <feMergeNode in="goo" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
              </svg>

              {/* Paper Grain micro-texture overlay */}
              {enablePaperGrain && (
                <div 
                  className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-[0.14] bg-repeat z-30"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                  }}
                />
              )}

              {/* Creases and scanner ambient vignette/stains overlays */}
              {enablePaperStains && (
                <>
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.06)_100%)] z-25" />
                  
                  {/* Faint realistic coffee mug spill on bottom corner */}
                  <div className="absolute bottom-8 right-12 w-28 h-28 pointer-events-none opacity-[0.22] z-25 select-none transform rotate-12">
                    <svg className="w-full h-full text-[#78350f]" viewBox="0 0 100 100" fill="none">
                      <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="1.8" strokeDasharray="30 2 20 5 15 1" opacity="0.8" />
                      <circle cx="50" cy="50" r="41.5" stroke="currentColor" strokeWidth="1" strokeDasharray="10 30" opacity="0.5" />
                      <circle cx="35" cy="18" r="1.5" fill="currentColor" />
                      <circle cx="82" cy="72" r="1" fill="currentColor" />
                      <circle cx="15" cy="52" r="2" fill="currentColor" />
                    </svg>
                  </div>

                  {/* Top-Right creased/folded corner effect */}
                  <div className="absolute top-0 right-0 w-[45px] h-[45px] pointer-events-none opacity-20 z-25 select-none overflow-hidden">
                    <svg className="w-full h-full text-black" viewBox="0 0 100 100">
                      <polygon points="100,0 100,100 0,0" fill="rgba(0,0,0,0.15)" />
                      <line x1="100" y1="100" x2="0" y2="0" stroke="rgba(0,0,0,0.6)" strokeWidth="1.5" />
                    </svg>
                  </div>
                </>
              )}

              {/* Faint Pencil sketches, formula rough drafts in margins */}
              {enableDoodles && (
                <div className="absolute inset-0 pointer-events-none select-none z-15 text-slate-400 opacity-60">
                  {currentTemplate?.id === "page3" && (
                    <>
                      {/* Secondary draft calculation list next to Q1 */}
                      <div className="absolute left-[78%] top-[25%] transform rotate-3 select-none scale-75 pt-2">
                        <svg className="w-20 h-20 text-slate-500" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                          <path d="M5,80 L20,20 L80,20 L95,80 Z" strokeWidth="1.5" strokeDasharray="4,4" />
                          <text x="25" y="45" fill="currentColor" fontSize="10" fontFamily="monospace">900 kWh</text>
                          <text x="25" y="60" fill="currentColor" fontSize="10" fontFamily="monospace">x 0,15 €</text>
                          <line x1="20" y1="67" x2="80" y2="67" stroke="currentColor" strokeWidth="1" />
                          <text x="25" y="80" fill="currentColor" fontSize="10" fontFamily="monospace">= 135,00 €</text>
                        </svg>
                      </div>

                      {/* Cute lightning bolt physics sketch next to power bills */}
                      <div className="absolute left-[84%] top-[48%] select-none opacity-40">
                        <svg className="w-8 h-12 text-amber-500" viewBox="0 0 100 100" fill="currentColor">
                          <path d="M50,0 L15,55 L45,55 L30,100 L85,42 L52,42 Z" />
                        </svg>
                      </div>
                    </>
                  )}

                  {currentTemplate?.id === "page4" && (
                    <div className="absolute left-[84%] top-[15%] select-none opacity-40">
                      {/* Abstract mini science turbine drawing */}
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

              {/* Teacher grade circle stamp, signatures, comments in marker red */}
              {enableTeacherMarks && (
                <div className="absolute inset-0 pointer-events-none select-none z-20 text-rose-600">
                  {currentTemplate?.id === "page3" && (
                    <>
                      {/* Teacher tick indicators next to correct student answers */}
                      <div className="absolute left-[78%] top-[39%] text-3xl font-bold select-none text-red-600">✓</div>
                      <div className="absolute left-[78%] top-[56%] text-3xl font-bold select-none text-red-600">✓</div>
                      <div className="absolute left-[78%] top-[74%] text-3xl font-bold select-none text-red-600">✓</div>
                      <div className="absolute left-[65%] top-[89%] text-sm font-bold rotate-[-3deg] select-none text-red-600" style={{ fontFamily: `var(--font-${getTeacherFontClass("page3_comment").replace("font-", "")})` }}>
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
                      <div className="absolute left-[62%] top-[60%] text-sm font-bold rotate-[4deg] select-none text-red-600" style={{ fontFamily: `var(--font-${getTeacherFontClass("page4_comment").replace("font-", "")})` }}>
                        Analyse critique rigoureuse
                      </div>
                    </>
                  )}

                  {currentTemplate?.id === "page5" && (
                    <div className="absolute left-[80%] top-[32%] text-3xl font-bold select-none text-red-600">✓</div>
                  )}
                </div>
              )}

              {/* Draggable Student Name & Date Sticker overlaying custom or secondary template assets */}
              {showStudentHeader && (activeTab === "custom" || currentTemplate?.id !== "page3") && (
                <div 
                  style={{
                    position: "absolute",
                    left: `calc(12% + ${(offsets["student_info"]?.x || 0) + globalOffsetX}px)`,
                    top: `calc(6% + ${(offsets["student_info"]?.y || 0) + globalOffsetY}px)`,
                    color: inkColor,
                    cursor: "grab",
                    pointerEvents: "auto",
                    userSelect: "none",
                    zIndex: 20
                  }}
                  onMouseDown={(e) => handleMouseDown(e, "student_info")}
                  className={`group border-2 border-dashed border-transparent hover:border-lime-500 hover:bg-lime-50/40 p-2 text-xs transition-all ${getFontFamilyClass(selectedFont)}`}
                  title="Déplacer l'En-tête de l'Élève (Nom & Date)"
                >
                  <div className="flex flex-col space-y-1 font-bold select-none pointer-events-none" style={{ color: inkColor, filter: "url(#authentic-ink-bleed)" }}>
                    <div className="whitespace-nowrap flex items-center gap-1">
                      <span>Nom :</span> 
                      <span className="text-sm px-1.5" style={{ color: inkColor, fontFamily: "inherit" }}>{studentName}</span>
                    </div>
                    <div className="whitespace-nowrap flex items-center gap-1">
                      <span>Date :</span>
                      <span className="text-sm px-1.5" style={{ color: inkColor, fontFamily: "inherit" }}>{examDate}</span>
                    </div>
                    <p className="text-[7.5px] text-slate-400/80 font-sans tracking-wide block select-none print:hidden font-normal pt-1">(Cliquez-glissez pour ajuster)</p>
                  </div>
                </div>
              )}

              {/* If user uploaded their custom worksheet, draw that background directly */}
              {activeTab === "custom" && currentTemplate?.imageUrl && currentTemplate.imageUrl !== "page3_bg" && currentTemplate.imageUrl !== "page4_bg" && currentTemplate.imageUrl !== "page5_bg" ? (
                <div className="absolute inset-0 pointer-events-none">
                  <img 
                    src={currentTemplate.imageUrl} 
                    alt="Custom assessment" 
                    className="w-full h-full object-contain opacity-95" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                /* Drawn Layout based on Al Kawthar evaluation screenshots with perfect high-fidelity */
                <div className="space-y-6">
                  {/* Worksheet Header banner */}
                  <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                    <div className="flex items-center space-x-3">
                      {/* Logo reconstruction */}
                      <div className="h-10 w-10 rounded-full border border-blue-600 flex items-center justify-center bg-blue-50 text-[10px] font-extrabold text-blue-700 leading-none shrink-0">
                        <span className="text-center font-serif">AL<br/><span className="text-[6px]">KAWTHAR</span></span>
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[11px] tracking-wide text-blue-900 uppercase">
                          LES ÉCOLES INTERNATIONALES AL KAWTHAR
                        </h3>
                        <p className="text-[9px] text-slate-500 font-medium">Année scolaire 2025-2026 • Vision 2030</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="border border-indigo-200 bg-indigo-50/50 px-2 py-1 rounded text-[10px] font-bold text-indigo-800">
                        PEI 4 (Classe)
                      </div>
                    </div>
                  </div>

                  {/* Standard Test info and Title depending on loaded page */}
                  {currentTemplate?.id === "page3" && (
                    <div className="space-y-4">
                      {/* Header block details */}
                      <div className="text-center space-y-1">
                        <h2 className="text-sm font-extrabold underline uppercase tracking-tight text-slate-800">
                          Évaluation de Sciences (Unité 3 : L'Énergie Électrique et le Nucléaire : Production et Impact)
                        </h2>
                        <p className="text-xs font-bold text-rose-600">Critère C : Traitement et évaluation de l'information</p>
                      </div>

                      {/* Seamless borderless Name/Date lines */}
                      <div className="grid grid-cols-2 gap-4 text-xs py-2 border-b border-slate-200">
                        <div>
                          <span className="font-extrabold text-slate-600">Nom et prénom :</span>
                          <span 
                            className={`ml-2 border-b border-dashed border-slate-400 w-56 inline-block font-bold text-base leading-none ${getFontFamilyClass(selectedFont)}`}
                            style={{ color: inkColor, transform: "rotate(-1deg)", display: "inline-block" }}
                          >
                            {studentName}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-slate-600 mr-2">Date :</span>
                          <span 
                            className={`border-b border-dashed border-slate-400 w-28 inline-block text-center font-bold text-base leading-none ${getFontFamilyClass(selectedFont)}`}
                            style={{ color: inkColor, transform: "rotate(0.5deg)", display: "inline-block" }}
                          >
                            {examDate}
                          </span>
                        </div>
                      </div>

                      {/* Énoncé de recherche context */}
                      <div className="p-3 bg-yellow-50/50 border border-amber-200 rounded-lg text-[10.5px] leading-relaxed">
                        <strong className="text-rose-600">Énoncé de recherche : </strong>
                        L'exploration des méthodes de production d'énergie électrique et nucléaire révèle des transformations complexes, des équilibres délicats et des conséquences profondes pour la durabilité mondiale et le bien-être humain.
                      </div>

                      {/* Exercice title context */}
                      <div className="border-l-4 border-indigo-600 pl-3 pt-0.5 space-y-1">
                        <h4 className="font-extrabold text-[12px] text-slate-900">
                          Exercice 1 : Analyse de la consommation électrique (15 minutes)
                        </h4>
                        <p className="text-[10px] text-rose-600 font-semibold italic">
                          Critère C : ii. Interpréter des données et expliquer des tendances ou des relations, vi. Déduire des conclusions scientifiquement justifiées
                        </p>
                      </div>

                      {/* Bill raw data list */}
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-[11px] space-y-1">
                        <p className="font-medium text-slate-700">Données de la facture d'électricité simplifiée de votre foyer :</p>
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
                        <h3 className="font-bold text-sm text-slate-800">
                          Exercice 2 : Évaluation de la fiabilité des informations sur l'énergie (15 minutes)
                        </h3>
                        <p className="text-[10px] text-rose-600 italic">
                          Critère C : iv. Évaluer la pertinence et la fiabilité des données, vi. Déduire des conclusions scientifiquement justifiées
                        </p>
                      </div>

                      {/* Extrait list */}
                      <div className="space-y-3">
                        <div className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-lg space-y-1">
                          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">**Extrait A : Article de Blog**</span>
                          <p className="text-[10.5px] leading-relaxed font-serif text-slate-700 italic">
                            &ldquo;Un article de blog récent affirme que l'énergie éolienne est la solution parfaite à tous nos problèmes énergétiques. Il déclare que les éoliennes ne produisent aucune pollution, sont entièrement renouvelables et ne présentent aucun inconvénient, ce qui en fait le seul choix pour l'avenir.&rdquo;
                          </p>
                        </div>

                        <div className="p-3 bg-sky-50/40 border border-sky-100 rounded-lg space-y-1">
                          <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider block">**Extrait B : Rapport Institutionnel**</span>
                          <p className="text-[10.5px] leading-relaxed font-serif text-slate-700 italic">
                            &ldquo;Un rapport gouvernemental sur la stratégie énergétique du pays mentionne que l'énergie nucléaire est une source d'énergie bas-carbone, mais souligne la complexité de la gestion des déchets radioactifs et le besoin de mesures de sécurité rigoureuses, en s'appuyant sur des études d'impact environnemental et des données de l'Agence Internationale de l'Énergie Atomique.&rdquo;
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentTemplate?.id === "page5" && (
                    <div className="space-y-4">
                      <div className="border-b border-slate-200 pb-2">
                        <h3 className="font-bold text-sm text-slate-800">
                          Exercice 2 : Évaluation de la fiabilité (Partie 2)
                        </h3>
                        <p className="text-[10px] text-slate-500">Suite de l'examen de sciences sur la gestion mondiale et durabilité.</p>
                      </div>
                    </div>
                  )}

                  {/* Print original text of the template questions before writing blank lines */}
                  <div className="space-y-8 pt-2">
                    {currentTemplate?.questions.map((q) => (
                      <div key={q.id} className="relative pb-1 bg-transparent">
                        <p className="text-xs font-semibold text-slate-800 leading-tight mb-2">
                          {q.questionText}
                        </p>
                        
                        {/* Simulation of physical dotted answer sheet lines for realism */}
                        {paperType !== "seyyes" && paperType !== "carreaux" && (
                          <div className="space-y-6 pt-1">
                            <div className="border-b border-dotted border-slate-300 h-1"></div>
                            <div className="border-b border-dotted border-slate-300 h-1"></div>
                            <div className="border-b border-dotted border-slate-300 h-1"></div>
                            {q.id.includes("conclusion") || q.id.includes("q3") || q.id.includes("q1") || q.id.includes("q2") ? (
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

              {/* Absolute Overlaid Layer for Handwriting Text Answers */}
              <div className="absolute inset-0 pointer-events-none">
                {currentTemplate?.questions.map((q) => {
                  const answerText = editableAnswers[q.id] || "";
                  if (!answerText) return null;

                  const offset = offsets[q.id] || { x: 0, y: 0 };
                  
                  // Get this question's organic, randomized style (font, rotation, size, slant, thickness)
                  const qStyle = getOrganicStyleForQuestion(q.id);
                  const leftPercentage = q.defaultX;
                  const topPercentage = q.defaultY;

                  // Unique style rules to mimic real student writing over the paper lines
                  const textStyle: React.CSSProperties = {
                    position: "absolute",
                    left: `calc(${leftPercentage}% + ${offset.x + globalOffsetX}px)`,
                    top: `calc(${topPercentage}% + ${offset.y + globalOffsetY}px)`,
                    color: inkColor,
                    fontSize: `${qStyle.size}px`,
                    transform: `rotate(${qStyle.rotation}deg)`,
                    maxWidth: `${q.maxWidth || 550}px`,
                    lineHeight: `${q.lineHeight || 24}px`,
                    whiteSpace: "pre-wrap",
                    cursor: "grab",
                    pointerEvents: "auto", // enable grabbing and dragging
                    userSelect: "none",
                    filter: "url(#authentic-ink-bleed) drop-shadow(0.15px 0.15px 0.2px rgba(0,0,0,0.25))",
                    fontFamily: `var(--font-${getFontFamilyClass(qStyle.font).replace("font-", "")})`,
                    WebkitTextStroke: qStyle.thickness > 1.1 ? `${(qStyle.thickness - 1.1) * 0.35}px ${inkColor}` : "0px",
                  };

                  return (
                    <div
                      key={q.id}
                      style={textStyle}
                      onMouseDown={(e) => handleMouseDown(e, q.id)}
                      className="group select-none border-2 border-transparent hover:border-violet-300 hover:bg-violet-50/40 p-1.5 rounded-lg transition-transform duration-75"
                      title="Cliquez et glissez pour aligner parfaitement sur les pointillés"
                    >
                      {/* Interactive inline editing overlay inside canvas */}
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
                                <span className="inline-block">{renderRealisticTextWithCorrections(q.id + "-rature", getRatureForQuestion(q.id), qStyle)}</span>
                                {/* Genuine organic student scribble cross-out overlay */}
                                <span className="absolute left-0 right-0 top-1/2 -translate-y-[40%] h-full w-[105%] pointer-events-none select-none">
                                  <svg className="w-full h-[16px] text-current overflow-visible" preserveAspectRatio="none" viewBox="0 0 120 10">
                                    {/* Primary heavy organic wavy scratch out */}
                                    <path 
                                      d={getRandomRaturePath(q.id)} 
                                      fill="none" 
                                      stroke="currentColor" 
                                      strokeWidth="3.2" 
                                      strokeLinecap="round" 
                                      strokeLinejoin="round" 
                                    />
                                    {/* Secondary chaotic scratching overlay */}
                                    <path 
                                      d={getRandomRaturePath(q.id + "-secondary")} 
                                      fill="none" 
                                      stroke="currentColor" 
                                      strokeWidth="1.6" 
                                      strokeLinecap="round" 
                                      strokeLinejoin="round" 
                                    />
                                    {/* Aggressive looping cross-outs representing child-like messy correction */}
                                    {messinessIntensity > 1.8 && (
                                      <path 
                                        d="M 3 6 Q 8 1, 13 8 T 23 3 T 33 8 T 43 4 T 53 8 T 63 3 T 73 8 T 83 4 T 93 8 T 103 3 T 113 7"
                                        fill="none" 
                                        stroke="currentColor" 
                                        strokeWidth="1.4"
                                        strokeLinecap="round" 
                                        opacity="0.85"
                                      />
                                    )}
                                  </svg>
                                </span>
                              </span>
                            )}
                            <span className="inline-block">{renderRealisticTextWithCorrections(q.id, answerText, qStyle)}</span>
                          </div>
                          {/* Helper overlay UI showing drag handle & edit buttons */}
                          <div className="absolute top-0 right-0 transform translate-x-1 translate-y-[-100%] opacity-0 group-hover:opacity-100 flex items-center space-x-1 bg-violet-600 text-white p-1 rounded-md text-[10px] pointer-events-auto">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingQId(q.id); }}
                              className="hover:text-amber-200 transition p-0.5"
                              title="Modifier la réponse"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <span className="cursor-grab active:cursor-grabbing p-0.5" title="Glisser pour déplacer">
                              <Move className="h-3 w-3" />
                            </span>
                            {activeTab === "custom" && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.id); }}
                                className="hover:text-red-200 text-red-100 transition p-0.5"
                                title="Supprimer cet élément"
                              >
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

          {/* Quick guide helper alert about draggable elements */}
          <div className="w-full mt-6 bg-yellow-100 border-4 border-black p-4 rounded-3xl flex items-start space-x-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] text-black">
            <HelpCircle className="h-5 w-5 text-black mt-0.5 shrink-0" />
            <div className="text-xs space-y-1 font-bold">
              <p className="font-black text-black">💡 ASTUCE DE MISE EN PAGE :</p>
              <p className="leading-relaxed text-black/80">
                Les textes générés sont <strong className="font-extrabold text-black">entièrement déplaçables</strong> ! Survolez simplement les réponses bleues, 
                puis effectuez un <strong className="font-extrabold text-black">cliquez-glissez</strong> pour placer l'écriture de l'élève parfaitement sur les pointillés du devoir d'Al Kawthar.
              </p>
            </div>
          </div>

        </main>
        
      </div>

      {/* Footer Stats and Credits */}
      <footer className="px-8 py-5 bg-black text-white flex flex-col sm:flex-row justify-between items-center mt-12 gap-4 border-t-4 border-black font-semibold text-xs text-center sm:text-left select-none">
        <p className="opacity-80 font-bold uppercase tracking-wider">
          Propulsé par le modèle LLM Nanobanana-v2 • Supporte 42 langues
        </p>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
            <span className="w-2.5 h-2.5 bg-lime-400 rounded-full"></span>
            Serveurs en ligne
          </span>
          <span className="opacity-65 italic tracking-tighter">@nanobanana_app</span>
        </div>
      </footer>

      {/* Toast Notice to guide the user in standard iframe print flow */}
      <AnimatePresence>
        {showPrintNotice && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 max-w-sm bg-black text-white p-4 rounded-2xl border-4 border-lime-400 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-50 text-xs font-bold leading-relaxed space-y-2 select-none print:hidden pointer-events-auto"
          >
            <div className="flex items-center gap-2 text-yellow-300">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="font-extrabold uppercase text-xs">IMPRESSION LANCÉE !</span>
            </div>
            <p className="text-slate-200 text-xs">
              Si la fenêtre d'impression de votre navigateur ne s'affiche pas ou si l'aperçu est incomplet (restrictions d'iframe), veuillez cliquer sur le bouton <strong className="text-lime-300 uppercase">"Ouvrir dans un nouvel onglet"</strong> tout en haut à droite pour imprimer en pleine page !
            </p>
            <button
              onClick={() => setShowPrintNotice(false)}
              className="text-xs text-lime-400 hover:text-white underline font-semibold mt-1"
            >
              Fermer cet avis
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
