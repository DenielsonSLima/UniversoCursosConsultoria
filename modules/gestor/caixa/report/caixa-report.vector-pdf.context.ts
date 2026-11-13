import type { jsPDF } from 'jspdf';
import { formatCaixaCompetencia } from '../caixa.formatters';
import { normalizeCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';
import { getCanonicalPdfInlineImage } from '../../secretaria/shared/canonical-document-vector-pdf';
import { fetchAsDataUrl, fetchLogoDataUrl, registerInterFont } from './caixa-report.vector-pdf.shared';
import type { CaixaDetailedReport } from './caixa-report.types';

export interface CaixaPdfResources {
  regularFontBuffer?: ArrayBuffer;
  mediumFontBuffer?: ArrayBuffer;
  semiBoldFontBuffer?: ArrayBuffer;
  boldFontBuffer?: ArrayBuffer;
  extraBoldFontBuffer?: ArrayBuffer;
  blackFontBuffer?: ArrayBuffer;
  logoDataUrl?: string | null;
  backgroundDataUrl?: string | null;
}

/** Both report kinds consume the same institution/landscape artwork snapshot. */
export async function prepareCaixaPdfContext(report: CaixaDetailedReport, resources?: CaixaPdfResources) {
  const { jsPDF: JsPdf } = await import('jspdf');
  const pdf: jsPDF = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: false });
  pdf.setProperties({
    title: `Prestação de contas - ${formatCaixaCompetencia(report.resumo.meta.competencia)}`,
    subject: `Relatório do Caixa - ${report.resumo.meta.escopoRotulo}`,
    author: report.institucional.nome,
    creator: 'Universo Cursos e Consultoria',
    keywords: 'caixa, prestação de contas, relatório financeiro',
  });
  await registerInterFont(pdf, {
    regular: resources?.regularFontBuffer,
    medium: resources?.mediumFontBuffer,
    semiBold: resources?.semiBoldFontBuffer,
    bold: resources?.boldFontBuffer,
    extraBold: resources?.extraBoldFontBuffer,
    black: resources?.blackFontBuffer,
  });
  const backgroundUsesFallback = !report.institucional.landscape_watermark_url;
  const fallbackArtworkUrl = typeof window === 'undefined' ? null : '/LogoUniverso.png';
  const [logo, background] = await Promise.all([
    resources?.logoDataUrl !== undefined ? Promise.resolve(resources.logoDataUrl) : fetchLogoDataUrl(report.institucional.logo_url),
    resources?.backgroundDataUrl !== undefined ? Promise.resolve(resources.backgroundDataUrl)
      : fetchAsDataUrl(report.institucional.landscape_watermark_url || fallbackArtworkUrl),
  ]);
  const institution = normalizeCanonicalInstitutionalHeader({ ...report.institucional, uf: report.institucional.estado });
  const canonicalLogo = getCanonicalPdfInlineImage(logo);
  const meta = { eyebrow: 'Caixa · uso interno', title: report.resumo.meta.escopoRotulo,
    label: 'Competência', value: formatCaixaCompetencia(report.resumo.meta.competencia) };
  return { pdf, background, backgroundUsesFallback, institution, canonicalLogo, meta };
}
