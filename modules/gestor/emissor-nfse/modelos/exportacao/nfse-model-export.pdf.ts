import { jsPDF, GState } from 'jspdf';
import { drawCanonicalInstitutionalHeader, normalizeCanonicalInstitutionalHeader } from '../../../secretaria/shared/canonical-institutional-header-pdf';
import { normalizeCanonicalPdfText, drawCanonicalPdfWatermark, type CanonicalPdfImage } from '../../../secretaria/shared/canonical-document-vector-pdf.core';
import type { NfseModelExportReport } from './nfse-model-export.projection';
import type { NfseModelReportRow } from './nfse-model-export.rows';

const left = 20, width = 170, bottom = 276, lineHeight = 3.9;
const columns = [{ x: left, width: 59 }, { x: left + 59, width: 83 }, { x: left + 142, width: 28 }];
export interface NfseModelReportAssets { isHeadquarters: boolean; logo: CanonicalPdfImage | null;
  watermark: { image: CanonicalPdfImage; opacity?: number; scale?: number; rotate?: boolean } | null }

/** Native text/geometry only. Preview and download receive this exact Blob. */
export function createNfseModelExportPdf(report: NfseModelExportReport, assets?: NfseModelReportAssets): { blob: Blob; fileName: string } {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
  pdf.setProperties({ title: `Pré-modelo NFS-e - ${report.modelName}`, subject: 'Relatório de configuração para revisão contábil',
    author: report.issuer.legalName || report.issuer.name || 'Universo Cursos e Consultoria', creator: 'Portal Universo' });
  const address = report.issuer.address;
  const header = normalizeCanonicalInstitutionalHeader({ name: report.issuer.name || report.issuer.legalName,
    cnpj: report.issuer.cnpj, address: address.street, number: address.number, complement: address.complement,
    neighborhood: address.district, city: address.city, state: address.state, postalCode: address.postalCode,
    phone: report.issuer.phone, email: report.issuer.email, isHeadquarters: assets?.isHeadquarters });
  let y = 0, page = 0, stripe = 0;
  const text = (value: string, x: number, top: number, size = 8.2, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size);
    pdf.text(normalizeCanonicalPdfText(value), x, top, { baseline: 'top' });
  };
  function newPage() {
    const firstPage = page++ === 0;
    if (!firstPage) pdf.addPage();
    if (assets?.watermark) drawCanonicalPdfWatermark(pdf, GState as unknown as new (parameters: { opacity: number }) => unknown,
      { enabled: true, image: assets.watermark.image, imageUrl: null, label: null, opacity: assets.watermark.opacity ?? null,
        scale: assets.watermark.scale, rotate: assets.watermark.rotate }, { x: 0, y: 0, width: 210, height: 297, textSize: 24 });
    // Only the shared compositor renders institutional identity. Continuations carry report metadata.
    const layout = firstPage ? drawCanonicalInstitutionalHeader(pdf, header, assets?.logo || null, { meta: { title: 'Revisão contábil', label: 'Pré-modelo', value: `v${report.version} - ${report.environment}` } }) : null;
    y = layout ? Math.max(59, layout.contentTop + 3) : 20;
    pdf.setTextColor(18, 43, 66); text('Relatório de configuração do pré-modelo', left, y, 13, true); y += 8;
    pdf.setTextColor(83, 101, 121); pdf.setFontSize(8.5);
    const modelLines = pdf.splitTextToSize(normalizeCanonicalPdfText(`${report.modelName} - v${report.version} - ${report.environment}`), width) as string[];
    modelLines.forEach(line => { text(line, left, y, 8.5); y += 4; }); y += 3;
    text('Este relatório descreve regras e parâmetros. Não é uma NFS-e.', left, y, 8); y += 10;
  }
  function section(title: string, continuation = false) {
    if (y > bottom - 24) newPage();
    pdf.setFillColor(237, 242, 250); pdf.rect(left, y, width, 8, 'F');
    pdf.setTextColor(24, 51, 75); text(`${title}${continuation ? ' (continuação)' : ''}`, left + 2, y + 2, 9.5, true); y += 10;
    pdf.setTextColor(83, 101, 121);
    ['Campo', 'Valor / estratégia', 'Origem'].forEach((label, index) => text(label, columns[index].x + 2, y, 7.5, true));
    y += 6;
  }
  function drawRow(row: NfseModelReportRow, title: string) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.2);
    const cells = [row.label, row.value, row.origin].map((value, index) =>
      pdf.splitTextToSize(normalizeCanonicalPdfText(value), columns[index].width - 5) as string[]);
    const totalLines = Math.max(1, ...cells.map(lines => lines.length));
    // Keep ordinary rows together; only content taller than a fresh page splits.
    const fullHeight = totalLines * lineHeight + 6;
    if (fullHeight > bottom - y && fullHeight <= bottom - 76) { newPage(); section(title, true); }
    let offset = 0;
    while (offset < totalLines) {
      if (bottom - y < 14) { newPage(); section(title, true); }
      const count = Math.min(totalLines - offset, Math.max(1, Math.floor((bottom - y - 6) / lineHeight)));
      const height = count * lineHeight + 6;
      pdf.setFillColor(stripe % 2 ? 255 : 248, stripe % 2 ? 255 : 250, stripe % 2 ? 255 : 252);
      pdf.rect(left, y, width, height, 'F');
      cells.forEach((lines, column) => {
        pdf.setTextColor(...(column === 1 ? [24, 51, 75] : [83, 101, 121]) as [number, number, number]);
        lines.slice(offset, offset + count).forEach((line, index) => text(line, columns[column].x + 2, y + 3 + index * lineHeight));
      });
      pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.15); pdf.line(left, y + height, left + width, y + height);
      y += height; offset += count;
      if (offset < totalLines) { newPage(); section(title, true); }
    }
    stripe++;
  }
  newPage();
  report.sections.forEach(group => {
    section(group.title); group.rows.forEach(row => drawRow(row, group.title)); y += 7;
  });
  const pages = pdf.getNumberOfPages();
  for (let index = 1; index <= pages; index++) {
    pdf.setPage(index); pdf.setDrawColor(226, 232, 240); pdf.line(left, 282, left + width, 282);
    pdf.setTextColor(100, 116, 139); text(`Pré-modelo ${report.modelId.slice(0, 8)} - v${report.version} - ${report.environment}`, left, 285, 7);
    text(`Página ${index} de ${pages}`, 165, 285, 7);
  }
  const name = report.modelName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
  return { blob: pdf.output('blob'), fileName: `pre-modelo-nfse-${name || report.modelId.slice(0, 8)}-v${report.version}.pdf` };
}

/** Resolve only institutional assets for the already-authorized report unit, never from model text. */
export async function prepareNfseModelExportPdf(report: NfseModelExportReport) {
  const [{ polosService }, { resolveCanonicalPdfPhoto }] = await Promise.all([
    import('../../../configuracoes/polos/polos.service'), import('../../../secretaria/shared/canonical-document-vector-pdf'),
  ]);
  const polo = await polosService.getById(report.issuer.poloId);
  if (!polo || polo.id !== report.issuer.poloId || typeof polo.is_matriz !== 'boolean') throw new Error('Não foi possível conferir os dados institucionais da unidade.');
  const [logo, watermark] = await Promise.all([resolveCanonicalPdfPhoto(polo.logoUrl), resolveCanonicalPdfPhoto(polo.watermark_url)]);
  if ((polo.logoUrl && !logo) || (polo.watermark_url && !watermark)) throw new Error('Não foi possível carregar os recursos institucionais configurados.');
  return createNfseModelExportPdf(report, { isHeadquarters: polo.is_matriz, logo, watermark: watermark ? {
    image: watermark, opacity: polo.watermark_opacity, scale: polo.watermark_scale, rotate: polo.watermark_rotate,
  } : null });
}
