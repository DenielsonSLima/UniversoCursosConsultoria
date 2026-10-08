import type { jsPDF } from 'jspdf';
import {
  drawCanonicalPdfText, normalizeCanonicalPdfText, type CanonicalPdfImage,
} from '../../shared/canonical-document-vector-pdf';
import { drawCanonicalInstitutionalHeader } from '../../shared/canonical-institutional-header-pdf';
import { normalizeContractSectionHeader } from '../../../../shared/contrato-aluno/section-header';
import type { ContratoAlunoPreparedDocument } from '../types/contratos-aluno.types';
import {
  PAGE_WIDTH, PAGE_HEIGHT, PAGE_LEFT, PAGE_RIGHT, PAGE_BOTTOM, PAGE_NUMBER_Y,
  CLOSING_TOP, LEGACY_CONTRACT_TITLE_SIZE, LEGACY_CONTRACT_TITLE_TOP,
  V2_CONTRACT_TITLE_SIZE, V2_CONTRACT_TITLE_TOP, CONTRACT_TITLE_LINE_HEIGHT,
  resolveContractPresentationMode, type ContractVisualDocument,
  type ContractVisualPage, type PdfGStateConstructor, type ContractPresentationMode,
} from './model';
import {
  getContractBodyStart, layoutContractSemanticBody, drawContractSemanticBody,
  CONTRACT_BODY_FONT_SIZE, CONTRACT_BODY_LINE_HEIGHT_FACTOR, CONTRACT_BODY_NORMAL_COLOR,
} from './body';
import {
  drawContractWatermark, drawContractWatermarkLegacy, drawContractInstitutionalHeaderLegacy,
} from './assets';
import { getClosingHeight, drawContractClosing, drawContractQr } from './closing';

export const assertContractPageFits = (
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
    visual.closingPositions,
  );
  const footerAvailable = PAGE_HEIGHT - PAGE_BOTTOM - CLOSING_TOP;
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

export const drawContractPageNumber = (
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

export const drawContractPage = (
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

  drawContractClosing(pdf, page.footer, visual.qr.enabled, visual.closingPositions);

  drawContractQr(pdf, visual, document, qr);
};
