/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum CriteriaLevel {
  LEVEL_1_2 = "1-2",
  LEVEL_3_4 = "3-4",
  LEVEL_5_6 = "5-6",
  LEVEL_7_8 = "7-8",
}

export interface CriteriaLevelDescriptor {
  level: CriteriaLevel;
  title: string;
  description: string;
}

export interface WorksheetQuestion {
  id: string;
  number: number;
  questionText: string;
  // Default coordinates on page 3 or 4 of the evaluation template (in % or as placement coordinates)
  defaultX: number; // percentage (0-100) or pixels on standard width
  defaultY: number; // percentage (0-100) or pixels on standard width
  maxWidth?: number;
  lineHeight?: number;
}

export interface AnswerItem {
  questionId: string;
  text: string;
  // Custom offset details for custom positioning on the canvas
  offsetX: number; // adjustments in pixels
  offsetY: number; // adjustments in pixels
  fontSize?: number;
  rotation?: number; // degree
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

export interface AnalysisResponse {
  answers: { [questionId: string]: string };
  handwritingStyle?: HandwritingStyle;
}
