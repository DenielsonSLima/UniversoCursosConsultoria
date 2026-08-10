import type { jsPDF } from "jspdf";

import {
  canonicalAsRecord,
  canonicalText,
} from "../shared/canonical-document-render.utils";
import {
  type CanonicalPdfImage,
  createCanonicalPdfQr,
  drawCanonicalPdfText,
  drawCanonicalPdfWatermark,
  normalizeCanonicalPdfText,
  resolveCanonicalPdfPhoto,
} from "../shared/canonical-document-vector-pdf";
import { drawCanonicalInstitutionalHeader } from "../shared/canonical-institutional-header-pdf";
import { parseContratoAlunoClosingLayout } from "../../../shared/contrato-aluno/closing-layout";
import { normalizeContractSectionHeader } from "../../../shared/contrato-aluno/section-header";
import {
  buildContractSemanticRuns,
  normalizeContractAttentionHighlights,
  normalizeContractCriticalHighlights,
  type ContractSemanticRun,
} from "../../../shared/contrato-aluno/semantic-format";
import type {
  CanonicalDocumentPdfBuildOptions,
  CanonicalDocumentPdfResult,
} from "../shared/canonical-document-pdf.types";
import type { ContratoAlunoPreparedDocument } from "./types/contratos-aluno.types";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_LEFT = 18;
const PAGE_RIGHT = 18;
const PAGE_TOP = 15;
const PAGE_BOTTOM = 16;
const PAGE_NUMBER_Y = PAGE_HEIGHT - 7;
const LEGACY_BODY_START = 60;
const V2_BODY_START = 82;
const V2_CONTINUATION_BODY_START = 62;
const V3_BODY_START = 75;
const V3_CONTINUATION_BODY_START = 60;
/** Área exclusiva de encerramento: sobe as assinaturas sem invadir o corpo canônico. */
const CLOSING_TOP = 210;
const QR_SIZE = 17;
const LEGACY_CONTRACT_TITLE_TOP = 47.5;
const LEGACY_CONTRACT_TITLE_SIZE = 15;
const V2_CONTRACT_TITLE_TOP = 69;
const V2_CONTRACT_TITLE_SIZE = 13;
const CONTRACT_TITLE_LINE_HEIGHT = 1.12;
const CONTRACT_PRESENTATION_LEGACY = "CONTRATO_A4_INSTITUCIONAL_V1";
const CONTRACT_PRESENTATION_V2 = "CONTRATO_A4_INSTITUCIONAL_V2";
const CONTRACT_PRESENTATION_V3 = "CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA";

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

interface ContractVisualPage {
  header: string;
  title: string;
  body: string;
  footer: string;
}

interface ContractVisualDocument {
  pages: ContractVisualPage[];
  presentationVersion: string;
  snapshot: Record<string, unknown>;
  criticalHighlights: string[];
  attentionHighlights: string[];
  institution: {
    name: string;
    legalName: string;
    cnpj: string;
    address: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    phone: string;
    email: string;
    isHeadquarters: boolean;
    logoUrl: string | null;
  };
  qr: {
    enabled: boolean;
    label: string;
    validityLabel: string;
  };
  watermark: {
    enabled: boolean;
    imageUrl: string | null;
    label: string | null;
    opacity: number | null;
    scale: number | null;
    rotate: boolean;
  };
}

export type ContractPresentationMode = "LEGACY" | "V2" | "V3";

export const resolveContractPresentationMode = (
  presentationVersion: string | null | undefined,
): ContractPresentationMode => {
  if (!presentationVersion || presentationVersion === CONTRACT_PRESENTATION_LEGACY) {
    return "LEGACY";
  }
  if (presentationVersion === CONTRACT_PRESENTATION_V2) return "V2";
  if (presentationVersion === CONTRACT_PRESENTATION_V3) return "V3";
  throw new Error(
    `A versão de apresentação do contrato não é suportada: ${presentationVersion}.`,
  );
};

const clampContractAssetOpacity = (value: number | null | undefined) => {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.08;
};

const getContractWatermarkScaleRatio = (value: number | null | undefined) => {
  const scale = Number(value);
  return Math.min(1, Math.max(0.1, Number.isFinite(scale) ? scale / 100 : 0.5));
};

export const getContractWatermarkGeometry = (
  value: number | null | undefined,
) => {
  const scale = getContractWatermarkScaleRatio(value);
  const width = PAGE_WIDTH * scale;
  const height = PAGE_HEIGHT * scale;
  return {
    scale: scale * 100,
    x: (PAGE_WIDTH - width) / 2,
    y: (PAGE_HEIGHT - height) / 2,
    width,
    height,
  };
};

const drawContractWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: ContractVisualDocument["watermark"],
  asset: CanonicalPdfImage | null,
  assetAlias: string,
) => {
  if (!watermark.enabled) return;

  if (asset) {
    const properties = pdf.getImageProperties(asset.dataUrl);
    const geometry = getContractWatermarkGeometry(watermark.scale);
    const scale = Math.min(
      geometry.width / properties.width,
      geometry.height / properties.height,
    );
    const width = properties.width * scale;
    const height = properties.height * scale;

    pdf.saveGraphicsState();
    pdf.setGState(
      new GState({
        opacity: clampContractAssetOpacity(watermark.opacity),
      }) as never,
    );
    pdf.addImage(
      asset.dataUrl,
      asset.format,
      (PAGE_WIDTH - width) / 2,
      (PAGE_HEIGHT - height) / 2,
      width,
      height,
      assetAlias,
      "FAST",
      watermark.rotate ? -45 : 0,
    );
    pdf.restoreGraphicsState();
    return;
  }

  const geometry = getContractWatermarkGeometry(watermark.scale);

  drawCanonicalPdfWatermark(
    pdf,
    GState,
    {
      ...watermark,
      imageUrl: asset?.dataUrl ?? watermark.imageUrl,
    },
    {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      textSize: 28,
      rotate: watermark.rotate ? 45 : 0,
    },
  );
};

/** Reproduz exatamente a caixa e a rotação usadas pelo compositor anterior. */
const drawContractWatermarkLegacy = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: ContractVisualDocument["watermark"],
  asset: CanonicalPdfImage | null,
) => {
  drawCanonicalPdfWatermark(
    pdf,
    GState,
    {
      ...watermark,
      imageUrl: asset?.dataUrl ?? watermark.imageUrl,
    },
    {
      x: 25,
      y: 62,
      width: 160,
      height: 172,
      textSize: 28,
      rotate: 35,
    },
  );
};

/** Mantém o corpo abaixo de um título canônico que ocupe até duas linhas. */
const getContractBodyStart = (
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

const getClosingHeight = (pdf: jsPDF, footer: string, hasQr: boolean) => {
  const layout = parseContratoAlunoClosingLayout(footer);
  const closingWidth = hasQr ? 132 : PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;

  if (layout.fallbackText) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const lines = pdf.splitTextToSize(
      layout.fallbackText,
      closingWidth,
    ) as string[];
    return Math.max(lines.length, 1) * 8 * 0.352778 * 1.35 + 5;
  }

  let height = 4;
  if (layout.location) height += 6;
  if (layout.parties.length) height += 11;
  if (layout.witnesses.length) height += 12;
  if (layout.additionalLines.length) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    const lines = pdf.splitTextToSize(
      layout.additionalLines.join("\n"),
      closingWidth,
    ) as string[];
    height += Math.max(lines.length, 1) * 7 * 0.352778 * 1.3 + 3;
  }
  return height;
};

const drawContractClosing = (
  pdf: jsPDF,
  footer: string,
  hasQr: boolean,
) => {
  const layout = parseContratoAlunoClosingLayout(footer);
  const closingWidth = hasQr ? 132 : PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;

  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.2);
  pdf.line(PAGE_LEFT, CLOSING_TOP, PAGE_WIDTH - PAGE_RIGHT, CLOSING_TOP);

  if (layout.fallbackText) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    drawCanonicalPdfText(pdf, layout.fallbackText, PAGE_LEFT, CLOSING_TOP + 3, {
      maxWidth: closingWidth,
      maxLines: 10,
      lineHeight: 1.35,
    });
    return;
  }

  let cursorY = CLOSING_TOP + 4;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);

  if (layout.location) {
    pdf.setFontSize(8);
    drawCanonicalPdfText(pdf, layout.location, PAGE_LEFT, cursorY, {
      maxWidth: closingWidth,
      maxLines: 2,
      lineHeight: 1.25,
    });
    cursorY += 7;
  }

  if (layout.parties.length) {
    const columns = Math.min(layout.parties.length, 2);
    const gap = 8;
    const columnWidth = (closingWidth - gap * (columns - 1)) / columns;
    const lineY = cursorY + 5;

    layout.parties.slice(0, 2).forEach((party, index) => {
      const x = PAGE_LEFT + index * (columnWidth + gap);
      if (party.value) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.2);
        drawCanonicalPdfText(
          pdf,
          party.value,
          x + columnWidth / 2,
          lineY - 1.5,
          {
            align: "center",
            maxWidth: columnWidth - 2,
            maxLines: 1,
          },
        );
      }
      pdf.setDrawColor(71, 85, 105);
      pdf.setLineWidth(0.25);
      pdf.line(x, lineY, x + columnWidth, lineY);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(6.2);
      drawCanonicalPdfText(pdf, party.label, x + columnWidth / 2, lineY + 3.2, {
        align: "center",
        maxWidth: columnWidth,
        maxLines: 1,
      });
    });
    cursorY = lineY + 7;
  }

  if (layout.witnesses.length) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(6.2);
    drawCanonicalPdfText(pdf, "TESTEMUNHAS", PAGE_LEFT, cursorY, {
      maxWidth: closingWidth,
      maxLines: 1,
    });

    const columns = Math.min(layout.witnesses.length, 2);
    const gap = 8;
    const columnWidth = (closingWidth - gap * (columns - 1)) / columns;
    const lineY = cursorY + 5;
    layout.witnesses.forEach((witness, index) => {
      const x = PAGE_LEFT + index * (columnWidth + gap);
      if (witness.value) {
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(71, 85, 105);
        pdf.setFontSize(6.8);
        drawCanonicalPdfText(
          pdf,
          witness.value,
          x + columnWidth / 2,
          lineY - 1.3,
          {
            align: "center",
            maxWidth: columnWidth - 2,
            maxLines: 1,
          },
        );
      }
      pdf.setDrawColor(100, 116, 139);
      pdf.setLineWidth(0.2);
      pdf.line(x, lineY, x + columnWidth, lineY);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(148, 163, 184);
      pdf.setFontSize(5.5);
      drawCanonicalPdfText(
        pdf,
        witness.label,
        x + columnWidth / 2,
        lineY + 2.8,
        {
          align: "center",
          maxWidth: columnWidth,
          maxLines: 1,
        },
      );
    });
    cursorY = lineY + 6;
  }

  if (layout.additionalLines.length) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(7);
    drawCanonicalPdfText(
      pdf,
      layout.additionalLines.join("\n"),
      PAGE_LEFT,
      cursorY + 1,
      {
        maxWidth: closingWidth,
        maxLines: 4,
        lineHeight: 1.3,
      },
    );
  }
};

const readContractVisualDocument = (
  document: ContratoAlunoPreparedDocument,
): ContractVisualDocument => {
  const rendered = document.renderPayload?.rendered;
  if (!rendered?.pages.length) {
    throw new Error(
      "O contrato não possui páginas canônicas suficientes para gerar o PDF.",
    );
  }

  const snapshot = canonicalAsRecord(document.renderPayload?.snapshot);
  const template = canonicalAsRecord(document.renderPayload?.template);
  const validation = canonicalAsRecord(
    snapshot.validacao || snapshot.validacao_documento,
  );
  const institution = canonicalAsRecord(
    snapshot.instituicao || snapshot.institution,
  );
  const snapshotWatermark = canonicalAsRecord(
    snapshot.marcaDagua || snapshot.marca_dagua || snapshot.watermark,
  );
  const snapshotWatermarkScale = Number(
    snapshotWatermark.escala ?? snapshotWatermark.scale,
  );
  const renderedWatermarkRotate = rendered.watermark?.rotate;
  return {
    pages: rendered.pages.map((page) => ({
      header: canonicalText(page.header),
      title: canonicalText(page.title),
      body: canonicalText(page.body),
      footer: canonicalText(page.footer),
    })),
    presentationVersion: canonicalText(
      institution.presentationVersion,
      institution.presentation_version,
    ),
    snapshot: {
      ...snapshot,
      regras: canonicalAsRecord(template.regrasDinamicas),
    },
    criticalHighlights: normalizeContractCriticalHighlights(template.destaquesCriticos),
    attentionHighlights: normalizeContractAttentionHighlights(template.destaquesAtencao),
    institution: {
      name: canonicalText(institution.nome, institution.name),
      legalName: canonicalText(institution.razaoSocial, institution.legalName),
      cnpj: canonicalText(institution.cnpj, institution.taxId),
      address: canonicalText(institution.endereco, institution.address),
      number: canonicalText(institution.numero, institution.number),
      complement: canonicalText(institution.complemento, institution.complement),
      neighborhood: canonicalText(institution.bairro, institution.neighborhood),
      city: canonicalText(institution.cidade, institution.city),
      state: canonicalText(institution.uf, institution.estado, institution.state),
      postalCode: canonicalText(institution.cep, institution.postalCode),
      phone: canonicalText(institution.telefone, institution.contato, institution.phone),
      email: canonicalText(institution.email),
      isHeadquarters: institution.isMatriz === true || institution.is_matriz === true,
      logoUrl: canonicalText(institution.logoUrl, institution.logo_url) || null,
    },
    qr: {
      enabled: rendered.qr?.enabled === true,
      label: canonicalText(rendered.qr?.label, "Validar documento"),
      validityLabel: canonicalText(
        rendered.qr?.validityLabel,
        validation.validadeExibicao,
      ),
    },
    watermark: {
      enabled: rendered.watermark?.enabled === true,
      imageUrl: rendered.watermark?.imageUrl || null,
      label: rendered.watermark?.label || null,
      opacity: rendered.watermark?.opacity ?? null,
      scale: rendered.watermark?.scale
        ?? (Number.isFinite(snapshotWatermarkScale) ? snapshotWatermarkScale : null),
      rotate: renderedWatermarkRotate == null
        ? snapshotWatermark.rotacionar === true || snapshotWatermark.rotate === true
        : renderedWatermarkRotate,
    },
  };
};

const drawContractInstitutionalHeaderLegacy = (
  pdf: jsPDF,
  page: ContractVisualPage,
  visual: ContractVisualDocument,
  logo: CanonicalPdfImage | null,
) => {
  const name = canonicalText(
    page.header,
    visual.institution.name,
    "UNIVERSO CURSOS E CONSULTORIA",
  );
  const logoX = PAGE_LEFT;
  const logoY = PAGE_TOP;
  const logoSize = 19;
  const contentX = logoX + logoSize + 4;
  const contentWidth = PAGE_WIDTH - PAGE_RIGHT - contentX;

  if (logo) {
    const properties = pdf.getImageProperties(logo.dataUrl);
    const scale = Math.min(logoSize / properties.width, logoSize / properties.height);
    const width = properties.width * scale;
    const height = properties.height * scale;
    pdf.addImage(
      logo.dataUrl,
      logo.format,
      logoX + (logoSize - width) / 2,
      logoY + (logoSize - height) / 2,
      width,
      height,
      "contrato-logo-institucional",
      "FAST",
    );
  } else {
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(logoX, logoY, logoSize, logoSize, 1.5, 1.5, "S");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 26, 51);
    pdf.setFontSize(8);
    drawCanonicalPdfText(pdf, "U", logoX + logoSize / 2, logoY + logoSize / 2, {
      align: "center",
      maxWidth: logoSize - 2,
      maxLines: 1,
    });
  }

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(10);
  drawCanonicalPdfText(pdf, name, contentX, logoY + 2, {
    maxWidth: contentWidth,
    maxLines: 2,
    lineHeight: 1.1,
  });
  if (visual.institution.cnpj) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(6.8);
    drawCanonicalPdfText(pdf, `CNPJ: ${visual.institution.cnpj}`, contentX, logoY + 9.5, {
      maxWidth: contentWidth,
      maxLines: 1,
    });
  }

  pdf.setDrawColor(0, 26, 51);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_LEFT, 39, PAGE_WIDTH - PAGE_RIGHT, 39);
};

interface ContractPdfPiece {
  text: string;
  bold: boolean;
  accent: boolean;
  attention: boolean;
  width: number;
}

interface ContractPdfWord {
  pieces: ContractPdfPiece[];
  width: number;
}

interface ContractPdfLine {
  words: ContractPdfWord[];
  paragraphEnd: boolean;
  attention: boolean;
}

interface ContractPdfBodyLayout {
  lines: ContractPdfLine[];
  fontSize: number;
  spaceWidth: number;
  lineHeight: number;
  height: number;
}

const CONTRACT_BODY_FONT_SIZE = 10.5;
const CONTRACT_BODY_LINE_HEIGHT_FACTOR = 1.7;
const CONTRACT_V3_BODY_FONT_SIZE = 8.5;
const CONTRACT_V3_BODY_LINE_HEIGHT_FACTOR = 1.22;
const CONTRACT_BODY_NORMAL_COLOR = [30, 41, 59] as const;
const CONTRACT_BODY_ACCENT_COLOR = [237, 28, 78] as const;
const CONTRACT_BODY_ATTENTION_COLOR = [255, 245, 247] as const;
const CONTRACT_BODY_MIN_SPACE_WIDTH = 1.2;

const getContractBodyTypography = (presentationMode: ContractPresentationMode) => (
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

const getContractPdfSpaceWidth = (
  pdf: jsPDF,
  presentationMode: ContractPresentationMode,
) => presentationMode === "V3"
  ? Math.max(pdf.getTextWidth(" "), CONTRACT_BODY_MIN_SPACE_WIDTH)
  : pdf.getTextWidth(" ");

const setContractPdfPieceStyle = (
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

const contractRunsToPdfWords = (
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

const layoutContractSemanticBody = (
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

const drawContractSemanticBody = (
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

const assertContractPageFits = (
  pdf: jsPDF,
  page: ContractVisualPage,
  visual: ContractVisualDocument,
  presentationMode: ContractPresentationMode,
  isFirstPage: boolean,
  hasClosing: boolean,
  hasQr: boolean,
) => {
  const showTitle = presentationMode === "LEGACY" || isFirstPage;
  const bodyStart = getContractBodyStart(
    pdf,
    page.title,
    presentationMode,
    showTitle,
  );
  let bodyHeight: number;
  if (presentationMode !== "LEGACY") {
    bodyHeight = layoutContractSemanticBody(
      pdf,
      page.body,
      visual,
      presentationMode,
    ).height;
  } else {
    pdf.setFont("times", "normal");
    pdf.setFontSize(CONTRACT_BODY_FONT_SIZE);
    const bodyLines = pdf.splitTextToSize(
      normalizeCanonicalPdfText(page.body),
      PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
    ) as string[];
    bodyHeight = Math.max(bodyLines.length, 1) * CONTRACT_BODY_FONT_SIZE
      * 0.352778 * CONTRACT_BODY_LINE_HEIGHT_FACTOR;
  }
  const footerHeight = getClosingHeight(
    pdf,
    normalizeCanonicalPdfText(page.footer),
    hasQr,
  );
  const footerAvailable = PAGE_HEIGHT - PAGE_BOTTOM - CLOSING_TOP - 3;
  const bodyLimit = hasClosing ? CLOSING_TOP - 5 : PAGE_HEIGHT - PAGE_BOTTOM;

  if (
    bodyStart + bodyHeight > bodyLimit ||
    (hasClosing && footerHeight > footerAvailable)
  ) {
    throw new Error(
      "Uma página canônica do contrato ultrapassa a área segura do PDF. Revise a paginação no servidor antes de emitir.",
    );
  }
};

const drawContractPageNumber = (
  pdf: jsPDF,
  currentPage: number,
  totalPages: number,
) => {
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(7);
  drawCanonicalPdfText(
    pdf,
    `Página ${currentPage} de ${totalPages}`,
    PAGE_WIDTH / 2,
    PAGE_NUMBER_Y,
    {
      align: "center",
      maxWidth: PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
      maxLines: 1,
    },
  );
};

const drawContractPage = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  page: ContractVisualPage,
  visual: ContractVisualDocument,
  document: ContratoAlunoPreparedDocument,
  qr: CanonicalPdfImage | null,
  logo: CanonicalPdfImage | null,
  watermarkAsset: CanonicalPdfImage | null,
  isFirstPage: boolean,
  isFinalPage: boolean,
  currentPage: number,
  totalPages: number,
) => {
  const presentationMode = resolveContractPresentationMode(
    visual.presentationVersion,
  );
  const sectionHeader = normalizeContractSectionHeader(page.header, [
    visual.institution.name,
    visual.institution.legalName,
  ]);
  const hasClosing = isFinalPage &&
    Boolean(normalizeCanonicalPdfText(page.footer) || visual.qr.enabled);
  assertContractPageFits(
    pdf,
    page,
    visual,
    presentationMode,
    isFirstPage,
    hasClosing,
    hasClosing && visual.qr.enabled,
  );
  const showDocumentTitle = presentationMode === "LEGACY" || isFirstPage;
  const bodyStart = getContractBodyStart(
    pdf,
    page.title,
    presentationMode,
    showDocumentTitle,
  );
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");

  if (presentationMode !== "LEGACY") {
    drawContractWatermark(
      pdf,
      GState,
      visual.watermark,
      watermarkAsset,
      `contrato-fundo-${document.emissionId}`,
    );
    drawCanonicalInstitutionalHeader(pdf, visual.institution, logo, {
      orientation: "portrait",
      alias: "contrato-logo-institucional",
    });
    if (sectionHeader && isFirstPage && presentationMode !== "V3") {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0, 26, 51);
      pdf.setFontSize(6.2);
      drawCanonicalPdfText(pdf, sectionHeader, PAGE_WIDTH / 2, 60, {
        align: "center",
        maxWidth: PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
        maxLines: 1,
      });
    }
  } else {
    drawContractWatermarkLegacy(
      pdf,
      GState,
      visual.watermark,
      watermarkAsset,
    );
    drawContractInstitutionalHeaderLegacy(pdf, page, visual, logo);
  }
  const shouldDrawAccent = presentationMode !== "V3"
    && (presentationMode === "LEGACY" || isFirstPage);
  if (shouldDrawAccent) {
    pdf.setDrawColor(237, 28, 78);
    pdf.setLineWidth(0.8);
    const accentY = presentationMode !== "LEGACY" ? 65 : 45;
    pdf.line(PAGE_WIDTH / 2 - 10, accentY, PAGE_WIDTH / 2 + 10, accentY);
  }
  if (showDocumentTitle) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 26, 51);
    const titleSize = presentationMode !== "LEGACY"
      ? V2_CONTRACT_TITLE_SIZE
      : LEGACY_CONTRACT_TITLE_SIZE;
    const titleTop = presentationMode !== "LEGACY"
      ? V2_CONTRACT_TITLE_TOP
      : LEGACY_CONTRACT_TITLE_TOP;
    pdf.setFontSize(titleSize);
    drawCanonicalPdfText(pdf, page.title, PAGE_WIDTH / 2, titleTop, {
      align: "center",
      maxWidth: PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
      maxLines: 2,
      lineHeight: CONTRACT_TITLE_LINE_HEIGHT,
    });
  }

  if (presentationMode !== "LEGACY") {
    drawContractSemanticBody(
      pdf,
      layoutContractSemanticBody(pdf, page.body, visual, presentationMode),
      bodyStart,
    );
  } else {
    pdf.setFont("times", "normal");
    pdf.setTextColor(...CONTRACT_BODY_NORMAL_COLOR);
    pdf.setFontSize(CONTRACT_BODY_FONT_SIZE);
    const bodyLines = pdf.splitTextToSize(
      normalizeCanonicalPdfText(page.body),
      PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
    ) as string[];
    pdf.text(bodyLines, PAGE_LEFT, bodyStart, {
      baseline: "top",
      lineHeightFactor: CONTRACT_BODY_LINE_HEIGHT_FACTOR,
    });
  }

  drawContractPageNumber(pdf, currentPage, totalPages);

  if (!hasClosing) return;

  drawContractClosing(pdf, page.footer, visual.qr.enabled);

  if (visual.qr.enabled) {
    if (!qr || !document.validationCode) {
      throw new Error(
        "O contrato exige QR Code, mas a imagem de validação não foi preparada.",
      );
    }
    const qrX = PAGE_WIDTH - PAGE_RIGHT - QR_SIZE - 1.5;
    const qrY = CLOSING_TOP + 2;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(
      qrX - 1.5,
      qrY - 1.5,
      QR_SIZE + 3,
      QR_SIZE + 10,
      1.5,
      1.5,
      "FD",
    );
    pdf.addImage(
      qr.dataUrl,
      qr.format,
      qrX,
      qrY,
      QR_SIZE,
      QR_SIZE,
      `contrato-qr-${document.emissionId}`,
      "FAST",
    );
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(5.7);
    drawCanonicalPdfText(
      pdf,
      visual.qr.label,
      qrX + QR_SIZE / 2,
      qrY + QR_SIZE + 0.9,
      {
        align: "center",
        maxWidth: QR_SIZE + 2,
        maxLines: 1,
      },
    );
    pdf.setTextColor(29, 78, 216);
    pdf.setFontSize(5.8);
    drawCanonicalPdfText(
      pdf,
      document.validationCode,
      qrX + QR_SIZE / 2,
      qrY + QR_SIZE + 3.4,
      {
        align: "center",
        maxWidth: QR_SIZE + 2,
        maxLines: 1,
      },
    );
    if (visual.qr.validityLabel) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(5.4);
      drawCanonicalPdfText(
        pdf,
        `Validade: ${visual.qr.validityLabel}`,
        qrX + QR_SIZE / 2,
        qrY + QR_SIZE + 5.8,
        {
          align: "center",
          maxWidth: QR_SIZE + 2,
          maxLines: 1,
        },
      );
    }
  }
};

/**
 * Gera o arquivo oficial diretamente com jsPDF. O conteúdo e a paginação já
 * vieram prontos do RPC; o browser só desenha objetos PDF nativos.
 */
export const createContratosAlunoPdf = async (
  documents: readonly ContratoAlunoPreparedDocument[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> => {
  if (!documents.length) {
    throw new Error("Nenhum contrato foi preparado para gerar o PDF.");
  }

  const visuals = documents.map(readContractVisualDocument);
  const qrAssets = await Promise.all(documents.map(async (document, index) => {
    if (!visuals[index].qr.enabled) return null;
    if (!document.validationCode) {
      throw new Error(
        "O contrato exige código de validação para gerar o QR Code.",
      );
    }
    return createCanonicalPdfQr(document.validationCode);
  }));
  const [logoAssets, watermarkAssets] = await Promise.all([
    Promise.all(visuals.map((visual) => (
      resolveCanonicalPdfPhoto(visual.institution.logoUrl)
    ))),
    Promise.all(visuals.map((visual) => (
      resolveCanonicalPdfPhoto(visual.watermark.imageUrl)
    ))),
  ]);
  const { jsPDF, GState } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  pdf.setProperties({
    title: documents.length > 1
      ? "Contratos de aluno - lote"
      : documents[0].title,
    subject: "Contrato institucional emitido pela Secretaria",
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });

  let pageIndex = 0;
  documents.forEach((document, documentIndex) => {
    const visual = visuals[documentIndex];
    visual.pages.forEach((page, visualPageIndex) => {
      if (pageIndex > 0) pdf.addPage("a4", "portrait");
      drawContractPage(
        pdf,
        GState as unknown as PdfGStateConstructor,
        page,
        visual,
        document,
        qrAssets[documentIndex],
        logoAssets[documentIndex],
        watermarkAssets[documentIndex],
        visualPageIndex === 0,
        visualPageIndex === visual.pages.length - 1,
        visualPageIndex + 1,
        visual.pages.length,
      );
      pageIndex += 1;
    });
    options.onProgress?.({
      current: documentIndex + 1,
      total: documents.length,
    });
  });

  return {
    blob: pdf.output("blob"),
    fileName: documents.length > 1
      ? `contratos-aluno-lote-${documents.length}.pdf`
      : `contrato-aluno-${documents[0].emissionId}.pdf`,
  };
};
