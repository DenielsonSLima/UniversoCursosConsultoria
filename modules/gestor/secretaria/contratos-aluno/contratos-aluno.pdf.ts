import type { jsPDF } from 'jspdf';

import {
  canonicalAsRecord,
  canonicalText,
} from '../shared/canonical-document-render.utils';
import {
  createCanonicalPdfQr,
  drawCanonicalPdfText,
  drawCanonicalPdfWatermark,
  normalizeCanonicalPdfText,
  type CanonicalPdfImage,
} from '../shared/canonical-document-vector-pdf';
import type {
  CanonicalDocumentPdfBuildOptions,
  CanonicalDocumentPdfResult,
} from '../shared/canonical-document-pdf.types';
import type { ContratoAlunoPreparedDocument } from './types/contratos-aluno.types';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_LEFT = 18;
const PAGE_RIGHT = 18;
const PAGE_TOP = 15;
const PAGE_BOTTOM = 16;
const BODY_START = 60;
const FOOTER_TOP = 249;
const QR_SIZE = 21;
const CONTRACT_TITLE_TOP = 47.5;
const CONTRACT_TITLE_SIZE = 15;
const CONTRACT_TITLE_LINE_HEIGHT = 1.12;

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

interface ContractVisualPage {
  header: string;
  title: string;
  body: string;
  footer: string;
}

interface ContractVisualDocument {
  pages: ContractVisualPage[];
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
  };
}

/** Mantém o corpo abaixo de um título canônico que ocupe até duas linhas. */
const getContractBodyStart = (pdf: jsPDF, title: string) => {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(CONTRACT_TITLE_SIZE);
  const titleLines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(title),
    PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
  ) as string[];
  const visibleTitleLines = Math.min(Math.max(titleLines.length, 1), 2);
  const titleHeight = visibleTitleLines * CONTRACT_TITLE_SIZE * 0.352778 * CONTRACT_TITLE_LINE_HEIGHT;
  return Math.max(BODY_START, CONTRACT_TITLE_TOP + titleHeight + 3);
};

const readContractVisualDocument = (document: ContratoAlunoPreparedDocument): ContractVisualDocument => {
  const rendered = document.renderPayload?.rendered;
  if (!rendered?.pages.length) {
    throw new Error('O contrato não possui páginas canônicas suficientes para gerar o PDF.');
  }

  const snapshot = canonicalAsRecord(document.renderPayload?.snapshot);
  const validation = canonicalAsRecord(snapshot.validacao || snapshot.validacao_documento);
  return {
    pages: rendered.pages.map((page) => ({
      header: canonicalText(page.header),
      title: canonicalText(page.title),
      body: canonicalText(page.body),
      footer: canonicalText(page.footer),
    })),
    qr: {
      enabled: rendered.qr?.enabled === true,
      label: canonicalText(rendered.qr?.label, 'Validar documento'),
      validityLabel: canonicalText(rendered.qr?.validityLabel, validation.validadeExibicao),
    },
    watermark: {
      enabled: rendered.watermark?.enabled === true,
      imageUrl: rendered.watermark?.imageUrl || null,
      label: rendered.watermark?.label || null,
      opacity: rendered.watermark?.opacity ?? null,
    },
  };
};

const assertContractPageFits = (
  pdf: jsPDF,
  page: ContractVisualPage,
  hasQr: boolean,
) => {
  const bodyStart = getContractBodyStart(pdf, page.title);
  pdf.setFont('times', 'normal');
  pdf.setFontSize(10.5);
  const bodyLines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(page.body),
    PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
  ) as string[];
  const bodyHeight = Math.max(bodyLines.length, 1) * 10.5 * 0.352778 * 1.7;
  const footerWidth = hasQr ? 132 : PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const footerLines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(page.footer),
    footerWidth,
  ) as string[];
  const footerHeight = Math.max(footerLines.length, 1) * 8 * 0.352778 * 1.35;
  const footerAvailable = PAGE_HEIGHT - PAGE_BOTTOM - FOOTER_TOP - 3;

  if (bodyStart + bodyHeight > FOOTER_TOP - 5 || footerHeight > footerAvailable) {
    throw new Error('Uma página canônica do contrato ultrapassa a área segura do PDF. Revise a paginação no servidor antes de emitir.');
  }
};

const drawContractPage = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  page: ContractVisualPage,
  visual: ContractVisualDocument,
  document: ContratoAlunoPreparedDocument,
  qr: CanonicalPdfImage | null,
) => {
  assertContractPageFits(pdf, page, visual.qr.enabled);
  const bodyStart = getContractBodyStart(pdf, page.title);
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
  drawCanonicalPdfWatermark(pdf, GState, visual.watermark, {
    x: 25,
    y: 62,
    width: 160,
    height: 172,
    textSize: 28,
    rotate: 35,
  });

  pdf.setDrawColor(0, 26, 51);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_LEFT, 39, PAGE_WIDTH - PAGE_RIGHT, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(10);
  drawCanonicalPdfText(pdf, page.header, PAGE_WIDTH / 2, PAGE_TOP, {
    align: 'center',
    maxWidth: PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
    maxLines: 2,
    lineHeight: 1.18,
  });
  pdf.setDrawColor(237, 28, 78);
  pdf.setLineWidth(0.8);
  pdf.line(PAGE_WIDTH / 2 - 10, 45, PAGE_WIDTH / 2 + 10, 45);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(CONTRACT_TITLE_SIZE);
  drawCanonicalPdfText(pdf, page.title, PAGE_WIDTH / 2, CONTRACT_TITLE_TOP, {
    align: 'center',
    maxWidth: PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
    maxLines: 2,
    lineHeight: CONTRACT_TITLE_LINE_HEIGHT,
  });

  pdf.setFont('times', 'normal');
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(10.5);
  const bodyLines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(page.body),
    PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
  ) as string[];
  pdf.text(bodyLines, PAGE_LEFT, bodyStart, {
    baseline: 'top',
    lineHeightFactor: 1.7,
    align: 'justify',
  });

  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.2);
  pdf.line(PAGE_LEFT, FOOTER_TOP, PAGE_WIDTH - PAGE_RIGHT, FOOTER_TOP);
  const footerWidth = visual.qr.enabled ? 132 : PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(8);
  drawCanonicalPdfText(pdf, page.footer, PAGE_LEFT, FOOTER_TOP + 3, {
    maxWidth: footerWidth,
    maxLines: 4,
    lineHeight: 1.35,
  });

  if (visual.qr.enabled) {
    if (!qr || !document.validationCode) {
      throw new Error('O contrato exige QR Code, mas a imagem de validação não foi preparada.');
    }
    const qrX = PAGE_WIDTH - PAGE_RIGHT - QR_SIZE;
    const qrY = FOOTER_TOP + 2;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(qrX - 1.5, qrY - 1.5, QR_SIZE + 3, QR_SIZE + 12, 1.5, 1.5, 'FD');
    pdf.addImage(
      qr.dataUrl,
      qr.format,
      qrX,
      qrY,
      QR_SIZE,
      QR_SIZE,
      `contrato-qr-${document.emissionId}`,
      'FAST',
    );
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(5.7);
    drawCanonicalPdfText(pdf, visual.qr.label, qrX + QR_SIZE / 2, qrY + QR_SIZE + 1.2, {
      align: 'center',
      maxWidth: QR_SIZE + 2,
      maxLines: 1,
    });
    pdf.setTextColor(29, 78, 216);
    pdf.setFontSize(5.8);
    drawCanonicalPdfText(pdf, document.validationCode, qrX + QR_SIZE / 2, qrY + QR_SIZE + 4, {
      align: 'center',
      maxWidth: QR_SIZE + 2,
      maxLines: 1,
    });
    if (visual.qr.validityLabel) {
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(5.4);
      drawCanonicalPdfText(pdf, `Validade: ${visual.qr.validityLabel}`, qrX + QR_SIZE / 2, qrY + QR_SIZE + 6.8, {
        align: 'center',
        maxWidth: QR_SIZE + 2,
        maxLines: 1,
      });
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
  if (!documents.length) throw new Error('Nenhum contrato foi preparado para gerar o PDF.');

  const visuals = documents.map(readContractVisualDocument);
  const qrAssets = await Promise.all(documents.map(async (document, index) => {
    if (!visuals[index].qr.enabled) return null;
    if (!document.validationCode) throw new Error('O contrato exige código de validação para gerar o QR Code.');
    return createCanonicalPdfQr(document.validationCode);
  }));
  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  pdf.setProperties({
    title: documents.length > 1 ? 'Contratos de aluno - lote' : documents[0].title,
    subject: 'Contrato institucional emitido pela Secretaria',
    author: 'Universo Cursos e Consultoria',
    creator: 'Universo Cursos e Consultoria',
  });

  let pageIndex = 0;
  documents.forEach((document, documentIndex) => {
    const visual = visuals[documentIndex];
    visual.pages.forEach((page) => {
      if (pageIndex > 0) pdf.addPage('a4', 'portrait');
      drawContractPage(pdf, GState as unknown as PdfGStateConstructor, page, visual, document, qrAssets[documentIndex]);
      pageIndex += 1;
    });
    options.onProgress?.({ current: documentIndex + 1, total: documents.length });
  });

  return {
    blob: pdf.output('blob'),
    fileName: documents.length > 1
      ? `contratos-aluno-lote-${documents.length}.pdf`
      : `contrato-aluno-${documents[0].emissionId}.pdf`,
  };
};
