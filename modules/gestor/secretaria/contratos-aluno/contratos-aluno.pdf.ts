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
  resolveCanonicalPdfPhoto,
  type CanonicalPdfImage,
} from '../shared/canonical-document-vector-pdf';
import { parseContratoAlunoClosingLayout } from '../../../shared/contrato-aluno/closing-layout';
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
/** Área exclusiva de encerramento: sobe as assinaturas sem invadir o corpo canônico. */
const CLOSING_TOP = 210;
const QR_SIZE = 17;
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
  institution: {
    name: string;
    cnpj: string;
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

const getClosingHeight = (pdf: jsPDF, footer: string, hasQr: boolean) => {
  const layout = parseContratoAlunoClosingLayout(footer);
  const closingWidth = hasQr ? 132 : PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;

  if (layout.fallbackText) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const lines = pdf.splitTextToSize(layout.fallbackText, closingWidth) as string[];
    return Math.max(lines.length, 1) * 8 * 0.352778 * 1.35 + 5;
  }

  let height = 4;
  if (layout.location) height += 6;
  if (layout.parties.length) height += 11;
  if (layout.witnesses.length) height += 12;
  if (layout.additionalLines.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    const lines = pdf.splitTextToSize(layout.additionalLines.join('\n'), closingWidth) as string[];
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
    pdf.setFont('helvetica', 'normal');
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
  pdf.setFont('helvetica', 'normal');
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
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.2);
        drawCanonicalPdfText(pdf, party.value, x + columnWidth / 2, lineY - 1.5, {
          align: 'center',
          maxWidth: columnWidth - 2,
          maxLines: 1,
        });
      }
      pdf.setDrawColor(71, 85, 105);
      pdf.setLineWidth(0.25);
      pdf.line(x, lineY, x + columnWidth, lineY);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(6.2);
      drawCanonicalPdfText(pdf, party.label, x + columnWidth / 2, lineY + 3.2, {
        align: 'center',
        maxWidth: columnWidth,
        maxLines: 1,
      });
    });
    cursorY = lineY + 7;
  }

  if (layout.witnesses.length) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(6.2);
    drawCanonicalPdfText(pdf, 'TESTEMUNHAS', PAGE_LEFT, cursorY, {
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
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        pdf.setFontSize(6.8);
        drawCanonicalPdfText(pdf, witness.value, x + columnWidth / 2, lineY - 1.3, {
          align: 'center',
          maxWidth: columnWidth - 2,
          maxLines: 1,
        });
      }
      pdf.setDrawColor(100, 116, 139);
      pdf.setLineWidth(0.2);
      pdf.line(x, lineY, x + columnWidth, lineY);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(148, 163, 184);
      pdf.setFontSize(5.5);
      drawCanonicalPdfText(pdf, witness.label, x + columnWidth / 2, lineY + 2.8, {
        align: 'center',
        maxWidth: columnWidth,
        maxLines: 1,
      });
    });
    cursorY = lineY + 6;
  }

  if (layout.additionalLines.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(7);
    drawCanonicalPdfText(pdf, layout.additionalLines.join('\n'), PAGE_LEFT, cursorY + 1, {
      maxWidth: closingWidth,
      maxLines: 4,
      lineHeight: 1.3,
    });
  }
};

const readContractVisualDocument = (document: ContratoAlunoPreparedDocument): ContractVisualDocument => {
  const rendered = document.renderPayload?.rendered;
  if (!rendered?.pages.length) {
    throw new Error('O contrato não possui páginas canônicas suficientes para gerar o PDF.');
  }

  const snapshot = canonicalAsRecord(document.renderPayload?.snapshot);
  const validation = canonicalAsRecord(snapshot.validacao || snapshot.validacao_documento);
  const institution = canonicalAsRecord(snapshot.instituicao || snapshot.institution);
  return {
    pages: rendered.pages.map((page) => ({
      header: canonicalText(page.header),
      title: canonicalText(page.title),
      body: canonicalText(page.body),
      footer: canonicalText(page.footer),
    })),
    institution: {
      name: canonicalText(institution.nome, institution.name),
      cnpj: canonicalText(institution.cnpj, institution.taxId),
      logoUrl: canonicalText(institution.logoUrl, institution.logo_url) || null,
    },
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

const drawContractInstitutionalHeader = (
  pdf: jsPDF,
  page: ContractVisualPage,
  visual: ContractVisualDocument,
  logo: CanonicalPdfImage | null,
) => {
  const name = canonicalText(page.header, visual.institution.name, 'UNIVERSO CURSOS E CONSULTORIA');
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
      'contrato-logo-institucional',
      'FAST',
    );
  } else {
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(logoX, logoY, logoSize, logoSize, 1.5, 1.5, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 26, 51);
    pdf.setFontSize(8);
    drawCanonicalPdfText(pdf, 'U', logoX + logoSize / 2, logoY + logoSize / 2, {
      align: 'center',
      maxWidth: logoSize - 2,
      maxLines: 1,
    });
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(10);
  drawCanonicalPdfText(pdf, name, contentX, logoY + 2, {
    maxWidth: contentWidth,
    maxLines: 2,
    lineHeight: 1.1,
  });
  if (visual.institution.cnpj) {
    pdf.setFont('helvetica', 'normal');
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

const assertContractPageFits = (
  pdf: jsPDF,
  page: ContractVisualPage,
  hasClosing: boolean,
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
  const footerHeight = getClosingHeight(pdf, normalizeCanonicalPdfText(page.footer), hasQr);
  const footerAvailable = PAGE_HEIGHT - PAGE_BOTTOM - CLOSING_TOP - 3;
  const bodyLimit = hasClosing ? CLOSING_TOP - 5 : PAGE_HEIGHT - PAGE_BOTTOM;

  if (bodyStart + bodyHeight > bodyLimit || (hasClosing && footerHeight > footerAvailable)) {
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
  logo: CanonicalPdfImage | null,
  isFinalPage: boolean,
) => {
  const hasClosing = isFinalPage && Boolean(normalizeCanonicalPdfText(page.footer) || visual.qr.enabled);
  assertContractPageFits(pdf, page, hasClosing, hasClosing && visual.qr.enabled);
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

  drawContractInstitutionalHeader(pdf, page, visual, logo);
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
  });

  if (!hasClosing) return;

  drawContractClosing(pdf, page.footer, visual.qr.enabled);

  if (visual.qr.enabled) {
    if (!qr || !document.validationCode) {
      throw new Error('O contrato exige QR Code, mas a imagem de validação não foi preparada.');
    }
    const qrX = PAGE_WIDTH - PAGE_RIGHT - QR_SIZE - 1.5;
    const qrY = CLOSING_TOP + 2;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(qrX - 1.5, qrY - 1.5, QR_SIZE + 3, QR_SIZE + 10, 1.5, 1.5, 'FD');
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
    drawCanonicalPdfText(pdf, visual.qr.label, qrX + QR_SIZE / 2, qrY + QR_SIZE + 0.9, {
      align: 'center',
      maxWidth: QR_SIZE + 2,
      maxLines: 1,
    });
    pdf.setTextColor(29, 78, 216);
    pdf.setFontSize(5.8);
    drawCanonicalPdfText(pdf, document.validationCode, qrX + QR_SIZE / 2, qrY + QR_SIZE + 3.4, {
      align: 'center',
      maxWidth: QR_SIZE + 2,
      maxLines: 1,
    });
    if (visual.qr.validityLabel) {
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(5.4);
      drawCanonicalPdfText(pdf, `Validade: ${visual.qr.validityLabel}`, qrX + QR_SIZE / 2, qrY + QR_SIZE + 5.8, {
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
  const logoAssets = await Promise.all(visuals.map((visual) => (
    resolveCanonicalPdfPhoto(visual.institution.logoUrl)
  )));
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
    visual.pages.forEach((page, visualPageIndex) => {
      if (pageIndex > 0) pdf.addPage('a4', 'portrait');
      drawContractPage(
        pdf,
        GState as unknown as PdfGStateConstructor,
        page,
        visual,
        document,
        qrAssets[documentIndex],
        logoAssets[documentIndex],
        visualPageIndex === visual.pages.length - 1,
      );
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
