import type { jsPDF } from 'jspdf';
import { normalizeCanonicalPdfText } from '../../shared/canonical-document-vector-pdf';
import { buildContractSemanticRuns, type ContractSemanticRun } from '../../../../shared/contrato-aluno/semantic-format';
import {
  PAGE_WIDTH, PAGE_LEFT, PAGE_RIGHT,
  LEGACY_BODY_START, V2_BODY_START, V2_CONTINUATION_BODY_START,
  V3_BODY_START, V3_CONTINUATION_BODY_START,
  LEGACY_CONTRACT_TITLE_SIZE, LEGACY_CONTRACT_TITLE_TOP,
  V2_CONTRACT_TITLE_SIZE, V2_CONTRACT_TITLE_TOP, CONTRACT_TITLE_LINE_HEIGHT,
  type ContractVisualDocument, type ContractPresentationMode,
} from './model';

export const getContractBodyStart = (
  pdf: jsPDF,
  title: string,
  presentationMode: ContractPresentationMode,
  showTitle = true,
) => {
  if (!showTitle && presentationMode !== "LEGACY") {
    return presentationMode === "V3"
      ? V3_CONTINUATION_BODY_START
      : V2_CONTINUATION_BODY_START;
  }
  const titleSize = presentationMode !== "LEGACY"
    ? V2_CONTRACT_TITLE_SIZE
    : LEGACY_CONTRACT_TITLE_SIZE;
  const titleTop = presentationMode !== "LEGACY"
    ? V2_CONTRACT_TITLE_TOP
    : LEGACY_CONTRACT_TITLE_TOP;
  const bodyStart = presentationMode === "V3"
    ? V3_BODY_START
    : presentationMode === "V2"
      ? V2_BODY_START
      : LEGACY_BODY_START;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(titleSize);
  const titleLines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(title),
    PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
  ) as string[];
  const visibleTitleLines = Math.min(Math.max(titleLines.length, 1), 2);
  const titleHeight = visibleTitleLines * titleSize * 0.352778 *
    CONTRACT_TITLE_LINE_HEIGHT;
  return Math.max(bodyStart, titleTop + titleHeight + 3);
};


export interface ContractPdfPiece {
  text: string;
  bold: boolean;
  accent: boolean;
  attention: boolean;
  width: number;
}

export interface ContractPdfWord {
  pieces: ContractPdfPiece[];
  width: number;
}

export interface ContractPdfLine {
  words: ContractPdfWord[];
  paragraphEnd: boolean;
  attention: boolean;
}

export interface ContractPdfBodyLayout {
  lines: ContractPdfLine[];
  fontSize: number;
  spaceWidth: number;
  lineHeight: number;
  height: number;
}

export const CONTRACT_BODY_FONT_SIZE = 10.5;
export const CONTRACT_BODY_LINE_HEIGHT_FACTOR = 1.7;
export const CONTRACT_V3_BODY_FONT_SIZE = 8.5;
export const CONTRACT_V3_BODY_LINE_HEIGHT_FACTOR = 1.22;
export const CONTRACT_BODY_NORMAL_COLOR = [30, 41, 59] as const;
export const CONTRACT_BODY_ACCENT_COLOR = [237, 28, 78] as const;
export const CONTRACT_BODY_ATTENTION_COLOR = [255, 245, 247] as const;
export const CONTRACT_BODY_MIN_SPACE_WIDTH = 1.2;

export const getContractBodyTypography = (presentationMode: ContractPresentationMode) => (
  presentationMode === "V3"
    ? {
      fontSize: CONTRACT_V3_BODY_FONT_SIZE,
      lineHeightFactor: CONTRACT_V3_BODY_LINE_HEIGHT_FACTOR,
    }
    : {
      fontSize: CONTRACT_BODY_FONT_SIZE,
      lineHeightFactor: CONTRACT_BODY_LINE_HEIGHT_FACTOR,
    }
);

export const getContractPdfSpaceWidth = (
  pdf: jsPDF,
  presentationMode: ContractPresentationMode,
) => presentationMode === "V3"
  ? Math.max(pdf.getTextWidth(" "), CONTRACT_BODY_MIN_SPACE_WIDTH)
  : pdf.getTextWidth(" ");

export const setContractPdfPieceStyle = (
  pdf: jsPDF,
  piece: Pick<ContractPdfPiece, "bold" | "accent">,
  fontSize: number,
) => {
  pdf.setFont("times", piece.bold ? "bold" : "normal");
  if (piece.accent) {
    pdf.setTextColor(...CONTRACT_BODY_ACCENT_COLOR);
  } else {
    pdf.setTextColor(...CONTRACT_BODY_NORMAL_COLOR);
  }
  pdf.setFontSize(fontSize);
};

export const contractRunsToPdfWords = (
  pdf: jsPDF,
  runs: readonly ContractSemanticRun[],
  fontSize: number,
) => {
  const tokens: Array<ContractPdfWord | "BREAK"> = [];
  let pieces: ContractPdfPiece[] = [];
  let pieceText = "";
  let pieceStyle: Pick<ContractPdfPiece, "bold" | "accent" | "attention"> | null = null;

  const flushPiece = () => {
    if (!pieceText || !pieceStyle) return;
    setContractPdfPieceStyle(pdf, pieceStyle, fontSize);
    pieces.push({
      ...pieceStyle,
      text: pieceText,
      width: pdf.getTextWidth(pieceText),
    });
    pieceText = "";
    pieceStyle = null;
  };
  const flushWord = () => {
    flushPiece();
    if (!pieces.length) return;
    tokens.push({
      pieces,
      width: pieces.reduce((total, piece) => total + piece.width, 0),
    });
    pieces = [];
  };

  runs.forEach((run) => {
    for (const character of run.text) {
      if (character === "\n") {
        flushWord();
        tokens.push("BREAK");
        continue;
      }
      if (/\s/u.test(character)) {
        flushWord();
        continue;
      }
      if (
        pieceStyle
        && (pieceStyle.bold !== run.bold
          || pieceStyle.accent !== run.accent
          || pieceStyle.attention !== run.attention)
      ) {
        flushPiece();
      }
      pieceStyle = {
        bold: run.bold,
        accent: run.accent,
        attention: run.attention,
      };
      pieceText += character;
    }
  });
  flushWord();
  return tokens;
};

export const layoutContractSemanticBody = (
  pdf: jsPDF,
  body: string,
  visual: ContractVisualDocument,
  presentationMode: ContractPresentationMode,
): ContractPdfBodyLayout => {
  const maxWidth = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const typography = getContractBodyTypography(presentationMode);
  const runs = buildContractSemanticRuns(normalizeCanonicalPdfText(body), {
    snapshot: visual.snapshot,
    criticalHighlights: visual.criticalHighlights,
    attentionHighlights: visual.attentionHighlights,
  });
  const tokens = contractRunsToPdfWords(pdf, runs, typography.fontSize);
  pdf.setFont("times", "normal");
  pdf.setFontSize(typography.fontSize);
  const spaceWidth = getContractPdfSpaceWidth(pdf, presentationMode);
  const lines: ContractPdfLine[] = [];
  let words: ContractPdfWord[] = [];
  let width = 0;

  const flushLine = (paragraphEnd: boolean) => {
    lines.push({
      words,
      paragraphEnd,
      attention: words.some((word) => word.pieces.some((piece) => piece.attention)),
    });
    words = [];
    width = 0;
  };

  tokens.forEach((token) => {
    if (token === "BREAK") {
      flushLine(true);
      return;
    }
    const gapWidth = words.length ? spaceWidth : 0;
    if (words.length && width + gapWidth + token.width > maxWidth) {
      flushLine(false);
    }
    width += (words.length ? spaceWidth : 0) + token.width;
    words.push(token);
  });
  if (words.length || !lines.length) flushLine(true);

  const lineHeight = typography.fontSize * 0.352778
    * typography.lineHeightFactor;
  return {
    lines,
    fontSize: typography.fontSize,
    spaceWidth,
    lineHeight,
    height: Math.max(lines.length, 1) * lineHeight,
  };
};

export const drawContractSemanticBody = (
  pdf: jsPDF,
  layout: ContractPdfBodyLayout,
  startY: number,
) => {
  const maxWidth = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFont("times", "normal");
  pdf.setFontSize(layout.fontSize);
  const normalSpaceWidth = layout.spaceWidth;

  layout.lines.forEach((line, lineIndex) => {
    if (!line.words.length) return;
    const wordsWidth = line.words.reduce((total, word) => total + word.width, 0);
    const gapCount = Math.max(line.words.length - 1, 0);
    const gapWidth = !line.paragraphEnd && gapCount > 0
      ? Math.max(normalSpaceWidth, (maxWidth - wordsWidth) / gapCount)
      : normalSpaceWidth;
    let cursorX = PAGE_LEFT;
    const cursorY = startY + lineIndex * layout.lineHeight;

    if (line.attention) {
      pdf.setFillColor(...CONTRACT_BODY_ATTENTION_COLOR);
      pdf.rect(
        PAGE_LEFT - 1.3,
        cursorY - 0.35,
        maxWidth + 2.6,
        layout.lineHeight,
        "F",
      );
      pdf.setDrawColor(...CONTRACT_BODY_ACCENT_COLOR);
      pdf.setLineWidth(0.45);
      pdf.line(
        PAGE_LEFT - 1.3,
        cursorY - 0.35,
        PAGE_LEFT - 1.3,
        cursorY + layout.lineHeight - 0.35,
      );
    }

    line.words.forEach((word, wordIndex) => {
      word.pieces.forEach((piece) => {
        setContractPdfPieceStyle(pdf, piece, layout.fontSize);
        pdf.text(piece.text, cursorX, cursorY, { baseline: "top" });
        cursorX += piece.width;
      });
      if (wordIndex < line.words.length - 1) cursorX += gapWidth;
    });
  });
};
