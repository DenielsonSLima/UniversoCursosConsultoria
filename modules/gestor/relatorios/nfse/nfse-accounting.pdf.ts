import { jsPDF, GState } from 'jspdf';
import { drawCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';
import { drawCanonicalPdfWatermark, normalizeCanonicalPdfText, truncatePdfText } from '../../secretaria/shared/canonical-document-vector-pdf.core';
import type { NfseIssuedExportAssets } from '../../emissor-nfse/exportacao/interno/nfse-issued-export.types';
import { formatNfseIssuedReportAmount as money } from '../../emissor-nfse/exportacao/interno/nfse-issued-export.types';
import { parseNfseAccountingReport, type NfseAccountingReport, type NfseAccountingRow } from './nfse-accounting.types';

const LEFT = 20, WIDTH = 257;
const widths = [25, 19, 80, 30, 30, 34, 39];
const labels = [ ['EMISSÃO', 'COMPETÊNCIA'], ['Nº NFS-e', 'ORIGEM'], ['PARCEIRO / TOMADOR', 'CHAVE DE ACESSO'],
  ['DATA DO SERVIÇO', 'CPF/CNPJ'], ['TRIBUTAÇÃO NAC.', 'DOCUMENTO (CONT.)'], ['ITEM NBS', 'POLO'], ['VALOR DO SERVIÇO', 'ISS / RETENÇÃO'] ];
const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Não informada';
const emission = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio' }).format(new Date(value));
const document = (value: string | null) => {
  if (!value) return 'Não informado';
  if (/^\d{11}$/.test(value)) return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (/^\d{14}$/.test(value)) return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
};
const retention = (value: string | null) => value === '1' ? 'não retido' : value === '2' || value === '3' ? 'retido' : 'retenção n/i';

export function createNfseAccountingPdf(report: NfseAccountingReport, assets: NfseIssuedExportAssets) {
  parseNfseAccountingReport(report, report.scope);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true, putOnlyUsedFonts: true });
  const title = report.mode === 'GERAL' ? 'NFS-e emitidas · Consolidado' : 'NFS-e emitidas · Por polo';
  const environment = report.scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação';
  pdf.setProperties({ title, author: assets.institution.name, subject: 'Relatório contábil de notas fiscais ativas', creator: 'Portal Universo' });
  const line = (value: string, x: number, y: number, width: number,
    opts: { bold?: boolean; size?: number; gray?: boolean; white?: boolean; right?: boolean; exact?: boolean } = {}) => {
    pdf.setCharSpace(0); pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal'); pdf.setFontSize(opts.size || 7.8);
    const text = normalizeCanonicalPdfText(value).replace(/\s+/g, ' ').trim();
    if (opts.exact && pdf.getTextWidth(text) > width) {
      pdf.setFontSize(Math.max(5.8, (opts.size || 7.8) * width / pdf.getTextWidth(text)));
      if (pdf.getTextWidth(text) > width + 0.05) throw new Error('Dado fiscal extenso demais para o relatório.');
    }
    pdf.setTextColor(...(opts.white ? [255, 255, 255] : opts.gray ? [100, 116, 139] : [24, 51, 75]) as [number, number, number]);
    pdf.text(opts.exact ? text : truncatePdfText(pdf, text, width, 1)[0] || '', x, y, { baseline: 'top', align: opts.right ? 'right' : 'left' });
  };
  let pageCount = 0;
  const page = (summary = false) => {
    if (pageCount++) pdf.addPage('a4', 'landscape');
    if (assets.watermark) drawCanonicalPdfWatermark(pdf, GState as unknown as new (p: { opacity: number }) => unknown,
      assets.watermark, { x: 0, y: 0, width: 297, height: 210, textSize: 24 });
    const header = drawCanonicalInstitutionalHeader(pdf, assets.institution, assets.logo, { orientation: 'landscape',
      alias: 'nfse-accounting-logo', meta: { eyebrow: 'Central de Relatórios', title: 'Notas fiscais emitidas',
        label: report.mode === 'GERAL' ? 'Consolidado da matriz' : 'Relatório por polo', value: environment } });
    let y = header.contentTop + 3;
    line(`${date(report.dateFrom)} a ${date(report.dateTo)} · Emissão fiscal · ${report.totalItems} nota(s)`, LEFT, y, 180, { bold: true, size: 8.2 });
    line(summary ? 'RESUMO CONTÁBIL' : 'RELAÇÃO DE NOTAS ATIVAS', LEFT + WIDTH, y, 70, { right: true, size: 7, gray: true });
    y += 6;
    if (!summary) {
      line('Duas linhas por nota · Valores e códigos do XML autorizado · Canceladas confirmadas não incluídas', LEFT, y, WIDTH, { gray: true, size: 6.8 }); y += 6;
      pdf.setFillColor(24, 51, 75); pdf.rect(LEFT, y, WIDTH, 12, 'F');
      let x = LEFT;
      labels.forEach((l, i) => { line(l[0], x + 2, y + 2, widths[i] - 4, { size: 6.1, bold: true, white: true });
        // CPF/CNPJ uses the combined service/code column on the second physical line.
        if (i !== 4) line(l[1], x + 2, y + 7, (i === 3 ? widths[3] + widths[4] : widths[i]) - 4, { size: 5.8, white: true }); x += widths[i]; });
      y += 12;
    }
    return y;
  };
  const row = (r: NfseAccountingRow, index: number, y: number) => {
    pdf.setFillColor(...(index % 2 ? [239, 245, 250] : [255, 255, 255]) as [number, number, number]);
    pdf.rect(LEFT, y, WIDTH, 12, 'F');
    const values = [emission(r.emittedAt), r.number, r.recipientName || 'Tomador não informado', date(r.serviceDate),
      r.nationalServiceCode || 'Não informado', r.nbsCode || 'Não informado', money(r.amount)];
    let x = LEFT;
    values.forEach((value, i) => { const right = i === 6;
      line(value, right ? x + widths[i] - 2 : x + 2, y + 2, widths[i] - 4,
        { bold: true, size: 7.5, right, exact: i !== 2 }); x += widths[i]; });
    line(date(r.competenceDate), 22, y + 7, 21, { size: 6.3, gray: true });
    line(r.origin === 'ALUNO' ? 'Aluno' : r.origin === 'SERVICO' ? 'Serviço' : 'Não inf.', 47, y + 7, 15, { size: 6.3, gray: true });
    line(r.accessKey, 66, y + 7, 76, { size: 6.3, exact: true, gray: true });
    line(document(r.recipientDocument), 146, y + 7, 56, { size: 6.3, exact: true, gray: true });
    line(r.poloName, 206, y + 7, 30, { size: 6.3, gray: true });
    line(`${r.issAmount === null ? 'ISS n/i' : money(r.issAmount)} · ${retention(r.issRetention)}`, 275, y + 7, 35,
      { size: 6.3, exact: true, gray: true, right: true });
    pdf.setDrawColor(218, 227, 235); pdf.setLineWidth(0.15); pdf.line(LEFT, y + 12, LEFT + WIDTH, y + 12);
  };
  const note = (y: number) => {
    line('Valor do serviço = bruto. ISS é informativo e não é deduzido deste total. “n/i” = não informado.', LEFT, y, WIDTH, { size: 6.6, gray: true });
    line('A data do serviço vem do snapshot da emissão; competência e tributos vêm do XML. Documento interno, não substitui a NFS-e.', LEFT, y + 4, WIDTH, { size: 6.5, gray: true });
  };
  const detailPages = report.pages.length ? report.pages : [[]];
  detailPages.forEach((rows, pageIndex) => {
    let y = page(); rows.forEach((r, index) => { row(r, pageIndex * 8 + index, y); y += 12; });
    if (!rows.length) { line('Nenhuma NFS-e emitida no período selecionado.', LEFT + 2, y + 6, WIDTH - 4, { bold: true }); y += 16; }
    note(y + 5);
  });
  const summaries = report.summaryPages.length ? report.summaryPages : [[]];
  summaries.forEach((items, index) => {
    let y = page(true);
    line(report.mode === 'GERAL' ? report.unitsDescription : report.byPolo[0].poloName, LEFT, y, WIDTH, { gray: true, size: 7.2 }); y += 7;
    pdf.setFillColor(24, 51, 75); pdf.rect(LEFT, y, WIDTH, 8, 'F');
    line('AGRUPAMENTO', LEFT + 3, y + 2.4, 52, { white: true, bold: true, size: 6.8 });
    line('CÓDIGO / UNIDADE', LEFT + 61, y + 2.4, 130, { white: true, bold: true, size: 6.8 });
    line('NOTAS', LEFT + 209, y + 2.4, 15, { white: true, right: true, bold: true, size: 6.8 });
    line('VALOR DOS SERVIÇOS', LEFT + WIDTH - 3, y + 2.4, 41, { white: true, right: true, bold: true, size: 6.8 }); y += 8;
    items.forEach((item, i) => {
      pdf.setFillColor(...(i % 2 ? [239, 245, 250] : [255, 255, 255]) as [number, number, number]); pdf.rect(LEFT, y, WIDTH, 7, 'F');
      line(item.kind === 'CODE' ? 'Tributação nacional' : item.kind === 'NBS' ? 'Item NBS' : 'Polo', LEFT + 3, y + 2, 54, { size: 7.4 });
      line(item.kind !== 'POLO' ? item.code || 'Não informado' : item.poloName, LEFT + 61, y + 2, 125, { bold: true, size: 7.4 });
      line(String(item.count), LEFT + 209, y + 2, 15, { right: true, size: 7.4, exact: true });
      line(money(item.amount), LEFT + WIDTH - 3, y + 2, 41, { right: true, bold: true, size: 7.4, exact: true }); y += 7;
    });
    if (index === summaries.length - 1) {
      y += 4; pdf.setFillColor(224, 237, 247); pdf.roundedRect(LEFT, y, WIDTH, 12, 1, 1, 'F');
      line('TOTAL GERAL DO PERÍODO', LEFT + 3, y + 4, 170, { bold: true, size: 8.5 });
      line(money(report.totalAmount), LEFT + WIDTH - 3, y + 3.5, 70, { right: true, bold: true, size: 11, exact: true }); y += 16;
      line('Os resumos por tributação, NBS e polo representam as mesmas notas; não devem ser somados entre si.', LEFT, y, WIDTH, { gray: true, size: 6.5 });
      if (report.totalAmount === null) line('Há valores desconhecidos. O total não foi convertido em zero nem calculado parcialmente.', LEFT, y + 4, WIDTH, { gray: true, size: 6.5 });
    }
  });
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p); pdf.setDrawColor(218, 227, 235); pdf.line(LEFT, 194, LEFT + WIDTH, 194);
    line(`Relatório interno · ${environment} · Gerado em ${emission(report.generatedAt)}`, LEFT, 197, 200, { size: 6.3, gray: true });
    line(`Página ${p} de ${pageCount}`, LEFT + WIDTH, 197, 45, { right: true, size: 6.3, gray: true });
  }
  return { blob: pdf.output('blob'), fileName: `nfse-contabil-${report.mode.toLowerCase()}-${report.dateFrom}-a-${report.dateTo}.pdf` };
}
