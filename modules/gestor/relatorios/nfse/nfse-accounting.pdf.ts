import { jsPDF, GState } from 'jspdf';
import { drawCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';
import { drawCanonicalPdfWatermark, normalizeCanonicalPdfText, truncatePdfText } from '../../secretaria/shared/canonical-document-vector-pdf.core';
import type { NfseIssuedExportAssets } from '../../emissor-nfse/exportacao/interno/nfse-issued-export.types';
import { formatNfseIssuedReportAmount as money } from '../../emissor-nfse/exportacao/interno/nfse-issued-export.types';
import { parseNfseAccountingReport, type NfseAccountingReport, type NfseAccountingRow } from './nfse-accounting.types';

const LEFT = 20, WIDTH = 257;
const widths = [25, 19, 80, 60, 34, 39];
const labels = [ ['DATA (E / R)', 'COMPETÊNCIA'], ['Nº NFS-e', 'ORIGEM'], ['PARCEIRO / TOMADOR', 'CHAVE DE ACESSO'],
  ['DATA DO SERVIÇO', 'CPF/CNPJ'], ['ITEM NBS', ''], ['VALOR DO SERVIÇO', 'ISS / RETENÇÃO'] ];
const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Não informada';
const emission = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio' }).format(new Date(value));
const document = (value: string | null) => {
  if (!value) return 'Não informado';
  if (/^\d{11}$/.test(value)) return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (/^\d{14}$/.test(value)) return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
};
const retention = (value: string | null) => value === '1' ? 'não retido' : value === '2' || value === '3' ? 'retido' : 'retenção n/i';

export function accountingStatus(state: string): { label: string; color: [number, number, number] } {
  switch (state) {
    case 'AUTHORIZED': return { label: 'Autorizada', color: [20, 100, 65] };
    case 'CANCELLED': return { label: 'Cancelada', color: [170, 35, 45] };
    case 'REJECTED': return { label: 'Rejeitada', color: [170, 35, 45] };
    case 'BLOCKED': return { label: 'Bloqueada', color: [170, 35, 45] };
    case 'PROCESSING': return { label: 'Em processamento', color: [34, 79, 145] };
    case 'AWAITING_CONFIRMATION': return { label: 'Aguardando confirmação', color: [135, 85, 15] };
    case 'CANCELLATION_REJECTED': return { label: 'Cancelamento rejeitado', color: [135, 85, 15] };
    case 'AWAITING_ANALYSIS': return { label: 'Cancelamento em análise', color: [135, 85, 15] };
    case 'CANCELLATION_PENDING': return { label: 'Cancelamento pendente', color: [135, 85, 15] };
    default: return { label: state, color: [70, 80, 90] };
  }
}

export function createNfseAccountingPdf(report: NfseAccountingReport, assets: NfseIssuedExportAssets) {
  parseNfseAccountingReport(report, report.scope);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true, putOnlyUsedFonts: true });
  const title = report.mode === 'GERAL' ? 'NFS-e emitidas · Consolidado' : 'NFS-e emitidas · Por polo';
  const environment = report.scope.environment === 'HOMOLOGACAO' ? ' · Homologação' : '';
  const generatedAt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(report.generatedAt));
  pdf.setProperties({ title, author: assets.institution.name, subject: 'Relatório contábil de notas fiscais ativas', creator: 'Portal Universo' });
  const line = (value: string, x: number, y: number, width: number,
    opts: { bold?: boolean; size?: number; color?: [number, number, number]; gray?: boolean; white?: boolean; right?: boolean; exact?: boolean } = {}) => {
    pdf.setCharSpace(0); pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal'); pdf.setFontSize(opts.size || 7.8);
    const text = normalizeCanonicalPdfText(value).replace(/\s+/g, ' ').trim();
    if (opts.exact && pdf.getTextWidth(text) > width) {
      pdf.setFontSize(Math.max(5.8, (opts.size || 7.8) * width / pdf.getTextWidth(text)));
      if (pdf.getTextWidth(text) > width + 0.05) throw new Error('Dado fiscal extenso demais para o relatório.');
    }
    pdf.setTextColor(...(opts.color || (opts.white ? [255, 255, 255] : opts.gray ? [100, 116, 139] : [24, 51, 75])) as [number, number, number]);
    pdf.text(opts.exact ? text : truncatePdfText(pdf, text, width, 1)[0] || '', x, y, { baseline: 'top', align: opts.right ? 'right' : 'left' });
  };
  let pageCount = 0;
  const page = (summary = false) => {
    if (pageCount++) pdf.addPage('a4', 'landscape');
    if (assets.watermark) drawCanonicalPdfWatermark(pdf, GState as unknown as new (p: { opacity: number }) => unknown,
      assets.watermark, { x: 0, y: 0, width: 297, height: 210, textSize: 24 });
    const header = drawCanonicalInstitutionalHeader(pdf, assets.institution, assets.logo, { orientation: 'landscape',
      alias: 'nfse-accounting-logo', metaAppearance: 'plain', meta: { title: 'Notas fiscais emitidas' } });
    let y = header.contentTop + 3;
    line(`${summary ? '' : `${date(report.dateFrom)} a ${date(report.dateTo)} · `}${report.totalItems} registro(s) · ${report.validItems} válida(s)`, LEFT, y, 180, { bold: true, size: 8.2 });
    line(summary ? 'RESUMO CONTÁBIL' : 'NOTAS E OPERAÇÕES FISCAIS', LEFT + WIDTH, y, 70, { right: true, size: 7, gray: true });
    y += 6;
    if (!summary) {
      line('E = emissão; R = registro sem emissão · Totais: autorizadas sem cancelamento confirmado · Rascunhos não incluídos', LEFT, y, WIDTH, { gray: true, size: 6.8 }); y += 6;
      pdf.setFillColor(24, 51, 75); pdf.rect(LEFT, y, WIDTH, 12, 'F');
      let x = LEFT;
      labels.forEach((l, i) => { line(l[0], x + 2, y + 2, widths[i] - 4, { size: 6.1, bold: true, white: true });
        // CPF/CNPJ uses the combined service/code column on the second physical line.
        line(l[1], x + 2, y + 7, widths[i] - 4, { size: 5.8, white: true }); x += widths[i]; });
      y += 12;
    }
    return y;
  };
  const row = (r: NfseAccountingRow, index: number, y: number) => {
    pdf.setFillColor(...(index % 2 ? [239, 245, 250] : [255, 255, 255]) as [number, number, number]);
    pdf.rect(LEFT, y, WIDTH, 14.5, 'F');
    const values = [`${r.dateSource === 'CREATED' ? 'R' : 'E'}: ${emission(r.emittedAt)}`, r.number || 'Sem emissão', r.recipientName || 'Tomador não informado', date(r.serviceDate),
      r.nbsCode || 'Não informado', money(r.amount)];
    let x = LEFT;
    values.forEach((value, i) => { const right = i === 5;
      line(value, right ? x + widths[i] - 2 : x + 2, y + 2, widths[i] - 4,
        { bold: true, size: 7.5, right, exact: i !== 2 }); x += widths[i]; });
    line(date(r.competenceDate), 22, y + 7, 21, { size: 6.3, gray: true });
    line(r.origin === 'ALUNO' ? 'Aluno' : r.origin === 'SERVICO' ? 'Serviço' : 'Não inf.', 47, y + 7, 15, { size: 6.3, gray: true });
    line(r.accessKey || 'Sem chave fiscal · operação não emitida', 66, y + 7, 76, { size: 6.3, exact: true, gray: true });
    line(document(r.recipientDocument), 146, y + 7, 56, { size: 6.3, exact: true, gray: true });
    // Compact third line: unit identity and independently sourced operational/XML status.
    const unitIdentity = `Unidade: ${r.poloName}  ·  CNPJ: ${document(r.poloCnpj)}  ·  ${r.poloCity || 'Cidade não informada'}/${r.poloState || 'UF n/i'}`;
    line(unitIdentity, 22, y + 10.5, 184, { size: 6.2, gray: true, exact: true });
    const status = accountingStatus(r.state);
    line(`${status.label} · ${r.validForTotals ? 'Incluída no total' : 'Fora do total'}`, 275, y + 10.5, 65,
      { size: 6.2, color: status.color, bold: true, right: true, exact: true });
    line(`${r.issAmount === null ? 'ISS n/i' : money(r.issAmount)} · ${retention(r.issRetention)}`, 275, y + 7, 35,
      { size: 6.3, exact: true, gray: true, right: true });
    pdf.setDrawColor(218, 227, 235); pdf.setLineWidth(0.15); pdf.line(LEFT, y + 14.5, LEFT + WIDTH, y + 14.5);
  };
  const note = (y: number) => {
    line('Valor do serviço = bruto. ISS é informativo e não é deduzido deste total. “n/i” = não informado.', LEFT, y, WIDTH, { size: 6.6, gray: true });
    line('Tomador de operação sem emissão: cadastro no registro. Datas do serviço: snapshot; competência e tributos: XML. Documento interno.', LEFT, y + 4, WIDTH, { size: 6.5, gray: true });
  };
  const detailPages = report.pages.length ? report.pages : [[]];
  detailPages.forEach((rows, pageIndex) => {
    let y = page(); rows.forEach((r, index) => { row(r, pageIndex * 6 + index, y); y += 14.5; });
    if (!rows.length) { line('Nenhuma NFS-e emitida no período selecionado.', LEFT + 2, y + 6, WIDTH - 4, { bold: true }); y += 16; }
    note(y + 5);
  });
  report.summaryColumnPages.forEach((columns, index) => {
    let y = page(true);
    line(`TOTAL VÁLIDO DO PERÍODO · ${date(report.dateFrom)} a ${date(report.dateTo)}`, LEFT, y, 185, { bold: true, size: 8.2, exact: true });
    line(money(report.totalAmount), LEFT + WIDTH, y, 70, { right: true, bold: true, size: 10, exact: true });
    y += 8;
    if (index === 0) {
      const labels = {ISS:'ISSQN',PIS:'PIS',COFINS:'COFINS',SOCIAL:'SOCIAIS RETIDAS',IRRF:'IRRF RETIDO',CP:'PREVIDÊNCIA RETIDA',CBS:'CBS',IBS:'IBS TOTAL'};
      const cardGap=3,cardWidth=(WIDTH-cardGap*3)/4;
      report.taxIndicators.forEach((tax,i)=>{
        const x=LEFT+(i%4)*(cardWidth+cardGap),cy=y+Math.floor(i/4)*19;
        pdf.setFillColor(239,245,250);pdf.roundedRect(x,cy,cardWidth,17,1,1,'F');
        line(labels[tax.key],x+2,cy+1.2,cardWidth-4,{bold:true,size:6.1});
        const displayedAmount = tax.amount === null
          ? tax.informedCount === 0 ? 'R$ 0,00*' : 'Total pendente*'
          : money(tax.amount);
        line(displayedAmount,x+2,cy+5,cardWidth-4,{bold:true,size:7.8,exact:true});
        line(`${tax.informedCount}/${report.validItems} notas com valor · ${tax.zeroCount} zero explícito`,x+2,cy+9.2,cardWidth-4,{gray:true,size:5.7,exact:true});
        const detail=tax.key==='CBS'||tax.key==='IBS'?'Valores informados no XML':
          `Ret.: ${tax.retainedCount} · Não ret.: ${tax.notRetainedCount} · N/i: ${tax.unknownRetentionCount}`;
        line(detail,x+2,cy+12.7,cardWidth-4,{gray:true,size:5.5,exact:true});
      });
      y+=40;
    }
    const definitions = [
      { title: 'ITEM NBS', key: 'nbs' as const, last: columns.nbsLast, all: report.byNbs },
      { title: 'POR POLO', key: 'polo' as const, last: columns.poloLast, all: report.byPolo },
    ];
    const gap = 5, columnWidth = (WIDTH - gap * definitions.length) / (definitions.length + 1);
    definitions.forEach((definition, columnIndex) => {
      const x = LEFT + columnIndex * (columnWidth + gap), items = columns[definition.key];
      pdf.setFillColor(24, 51, 75); pdf.roundedRect(x, y, columnWidth, 11, 1, 1, 'F');
      line(definition.title + (index ? ' · CONT.' : ''), x + 2, y + 1.5, columnWidth - 4,
        { bold: true, white: true, size: 7 });
      line(definition.key === 'polo' ? 'UNIDADE' : 'CÓDIGO', x + 2, y + 6.5, columnWidth - 39, { white: true, size: 5.8 });
      line('NOTAS', x + columnWidth - 29, y + 6.5, 11, { white: true, right: true, size: 5.8 });
      line('VALOR', x + columnWidth - 2, y + 6.5, 25, { white: true, right: true, size: 5.8 });
      let rowY = y + 11;
      items.forEach((item, rowIndex) => {
        pdf.setFillColor(...(rowIndex % 2 ? [239, 245, 250] : [248, 250, 252]) as [number, number, number]);
        pdf.rect(x, rowY, columnWidth, 7, 'F');
        const label = 'poloName' in item ? `${item.poloCity || item.poloName} / ${item.poloState || 'UF n/i'}` : item.code || 'Não informado';
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.8); pdf.setCharSpace(0);
        const wrapped = 'poloCnpj' in item ? [truncatePdfText(pdf, label, columnWidth - 43, 1)[0], document(item.poloCnpj)] : truncatePdfText(pdf, label, columnWidth - 43, 2);
        wrapped.forEach((text, n) => line(text, x + 2, rowY + 1.3 + n * 3, columnWidth - 43, { size: 'poloCnpj' in item ? 5.8 : 6.8, exact: 'poloCnpj' in item }));
        line(String(item.count), x + columnWidth - 29, rowY + 2, 9, { right: true, size: 6.8, exact: true });
        line(money(item.amount), x + columnWidth - 2, rowY + 2, 25, { right: true, bold: true, size: 6.8, exact: true });
        rowY += 7;
      });
      if (!items.length) {
        line(index === 0 ? 'Sem registros neste agrupamento.' : 'Agrupamento concluído na página anterior.',
          x + 2, rowY + 3, columnWidth - 4, { gray: true, size: 6.1 }); rowY += 10;
      }
      if (definition.last) {
        pdf.setFillColor(224, 237, 247); pdf.rect(x, rowY + 2, columnWidth, 11, 'F');
        line('TOTAL DESTA VISÃO', x + 2, rowY + 3.5, columnWidth - 4, { bold: true, size: 6.1 });
        line(`${report.validItems} nota(s) válida(s)`, x + 2, rowY + 7.5, columnWidth - 35, { size: 6.3 });
        line(money(report.totalAmount), x + columnWidth - 2, rowY + 7, 31, { right: true, bold: true, size: 7.5, exact: true });
      } else if (items.length) {
        line('Continua na próxima página · total ao final.', x + 2, rowY + 4, columnWidth - 4, { gray: true, size: 6 });
      }
    });
    const statusX=LEFT+2*(columnWidth+gap);
    pdf.setFillColor(24,51,75);pdf.roundedRect(statusX,y,columnWidth,11,1,1,'F');
    line('SITUAÇÃO DAS NOTAS POR POLO',statusX+2,y+1.5,columnWidth-4,{bold:true,white:true,size:7});
    line('CONTAGENS · SEM SOMA DE VALORES',statusX+2,y+6.5,columnWidth-4,{white:true,size:5.7});
    columns.polo.forEach((p,i)=>{
      const state=report.byPoloStatus.find(s=>s.poloId===p.poloId)!;
      const sy=y+11+i*12;
      pdf.setFillColor(...(i%2?[239,245,250]:[248,250,252]) as [number,number,number]);pdf.rect(statusX,sy,columnWidth,12,'F');
      line(`${state.poloCity||state.poloName}/${state.poloState||'UF n/i'} · ${state.total} registro(s)`,statusX+2,sy+1,columnWidth-4,{bold:true,size:6.3});
      line(`Válidas: ${state.valid} · Canceladas: ${state.cancelled}`,statusX+2,sy+4.8,columnWidth-4,{size:6.2,exact:true});
      line(`Rej./bloq.: ${state.rejected} · Pendentes: ${state.pending} · Outras: ${state.other}`,statusX+2,sy+8.2,columnWidth-4,{gray:true,size:5.5,exact:true});
    });
    if(!columns.polo.length) line('Unidades concluídas na página anterior.',statusX+2,y+15,columnWidth-4,{gray:true,size:6});
    line('* R$ 0,00: nenhum valor informado no XML; não confirma tributo zero ou isenção. Total pendente: dados parciais, sem soma parcial.',LEFT,180,WIDTH,{gray:true,size:5.7,exact:true});
    line('Tributos informativos, não apuração. N/i não significa zero ou isenção. Sociais retidas: grupo combinado; não somar novamente PIS/COFINS retidos.',LEFT,188,WIDTH,{gray:true,size:5.7,exact:true});
    line('Situações por polo: válidas incluem cancelamento não confirmado; canceladas somente com confirmação fiscal. Faixa tributária: apenas notas válidas.',LEFT,191,WIDTH,{gray:true,size:5.7,exact:true});
    if (report.totalAmount === null) line('Há valores desconhecidos. Total indisponível; não foi calculada soma parcial.', LEFT, 184, WIDTH, { gray: true, size: 6.5 });
  });
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p); pdf.setDrawColor(218, 227, 235); pdf.line(LEFT, 194, LEFT + WIDTH, 194);
    line(`Relatório interno${environment} · Gerado em ${generatedAt} (Brasília)`, LEFT, 197, 200, { size: 6.3, gray: true });
    line(`Página ${p} de ${pageCount}`, LEFT + WIDTH, 197, 45, { right: true, size: 6.3, gray: true });
  }
  return { blob: pdf.output('blob'), fileName: `nfse-contabil-${report.mode.toLowerCase()}-${report.dateFrom}-a-${report.dateTo}.pdf` };
}

