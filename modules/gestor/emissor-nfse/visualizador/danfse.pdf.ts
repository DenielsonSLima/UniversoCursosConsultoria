import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { type DanfseAssets, type DanfseDocument, danfseConsultationUrl, dpsValue, xmlValue } from './danfse.types';
import { codeLabel, danfseComplements, danfseDate, joined, stateFromMunicipality } from './danfse.presentation';
import { createDanfseLayout, DANFSE_PAGE, type DanfseLayout } from './danfse.pdf-layout';
import { drawDanfseParties } from './danfse.pdf-parties';
import { drawDanfseTaxes } from './danfse.pdf-taxes';
import { type DanfseProjection, requireDanfseProjection } from './danfse.projection';

function header(layout: DanfseLayout, document: DanfseDocument, assets: DanfseAssets) {
  const { pdf, text } = layout;
  const cityLines = layout.linesFor(`Município: ${xmlValue(document, 'xLocEmi') || '-'} - ${xmlValue(document, 'emit/enderNac/UF') || '-'}`, 137.7, 8);
  if (cityLines.length > 4) throw new Error('O nome do município excede o espaço do cabeçalho DANFSe.');
  const extraHeight = (cityLines.length - 1) * 8.8;
  layout.top += extraHeight;
  pdf.setFillColor(242, 242, 242);
  pdf.rect(8.5, 5.6693, 578.27, 34.0157 + extraHeight, 'F');
  pdf.addImage(assets.logo, 'PNG', 11.9, 10.8, 116, 23);
  text('DANFSe v2.0', 297.5, 20.77, 9, true, 'center');
  text('Documento Auxiliar da NFS-e', 297.5, 31.12, 9, true, 'center');
  cityLines.forEach((line, index) => text(line, 445.606, 18.9 + index * 8.8, 8));
  const generator = xmlValue(document, 'ambGer');
  if (generator && !/^\d{1,2}$/.test(generator)) throw new Error('Ambiente gerador inválido no XML.');
  text(`Ambiente Gerador: ${generator || '-'}`, 445.606, 26 + extraHeight, 6);
  text(`Tipo de Ambiente: ${document.environment}`, 445.606, 32.9 + extraHeight, 6);
  if (document.environment === '2') {
    layout.font(9, true);
    pdf.setTextColor(220, 0, 0);
    pdf.text('NFS-e SEM VALIDADE JURÍDICA', 297.5, 40, { align: 'center' });
    layout.top += 8;
  }
  layout.line(layout.top - 0.065);
}

function identification(layout: DanfseLayout, document: DanfseDocument) {
  const start = layout.top;
  const dps = (path: string) => dpsValue(document, path);
  const field = (label: string, value: string) => ({ label, value, identification: true });
  layout.row([{ ...field('CHAVE DE ACESSO DA NFS-e', document.accessKey), span: 3 }], 20.2241);
  layout.row([
    field('NÚMERO DA NFS-e', document.number), field('COMPETÊNCIA DA NFS-e', danfseDate(dps('dCompet'))),
    field('DATA E HORA DA EMISSÃO DA NFS-e', danfseDate(xmlValue(document, 'dhProc'))),
  ], 20.2241);
  layout.row([
    field('NÚMERO DA DPS', dps('nDPS')), field('SÉRIE DA DPS', dps('serie')),
    field('DATA E HORA DA EMISSÃO DA DPS', danfseDate(dps('dhEmi'))),
  ], 20.2241);
  layout.row([
    { ...field('EMITENTE DA NFS-e', codeLabel(dps('tpEmit'), { 1: 'Prestador', 2: 'Tomador', 3: 'Intermediário' })), shade: true },
    field('SITUAÇÃO DA NFS-e', codeLabel(xmlValue(document, 'cStat'), { 100: 'NFS-e Gerada', 107: 'NFS-e MEI' })),
    field('FINALIDADE', dps('IBSCBS/finNFSe')),
  ], 20.2241);
  const qr = QRCode.create(danfseConsultationUrl(document.accessKey), { errorCorrectionLevel: 'M' });
  const qrSize = 43.1;
  const pixel = qrSize / qr.modules.size;
  layout.pdf.setFillColor(0, 0, 0);
  for (let y = 0; y < qr.modules.size; y++) for (let x = 0; x < qr.modules.size; x++) {
    if (qr.modules.get(y, x)) layout.pdf.rect(493.4 + x * pixel, start + 6.4 + y * pixel, pixel + 0.01, pixel + 0.01, 'F');
  }
  const qrCaption = layout.linesFor('A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e', 137.7, 6);
  qrCaption.forEach((line, index) => layout.text(line, 445.606, start + 57.4 + index * 6.9, 6));
}

function service(layout: DanfseLayout, document: DanfseDocument) {
  const dps = (path: string) => dpsValue(document, path);
  const national = dps('serv/cServ/cTribNac').replace(/^(\d{2})(\d{2})(\d{2})$/, '$1.$2.$3');
  const nbs = dps('serv/cServ/cNBS').replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3.$4');
  layout.line();
  layout.row([
    { label: 'SERVIÇO PRESTADO', title: true },
    { label: 'Código de Tributação Nacional/Municipal', value: joined([national, dps('serv/cServ/cTribMun')]) },
    { label: 'Código da NBS', value: nbs },
    { label: 'Local da Prestação / Sigla UF / País',
      value: joined([xmlValue(document, 'xLocPrestacao'), stateFromMunicipality(dps('serv/locPrest/cLocPrestacao')), dps('serv/locPrest/cPaisPrestacao')]) },
  ]);
  layout.paragraph(xmlValue(document, 'xTribMun') || xmlValue(document, 'xTribNac'), undefined, 13.372);
  layout.paragraph(dps('serv/cServ/xDescServ'), 'Descrição do Serviço');
}

/** A4 national layout, independent from the institutional document header. */
export function createDanfsePdf(document: DanfseDocument, assets: DanfseAssets, projection?: DanfseProjection): Blob {
  const fiscalValues = requireDanfseProjection(document, projection);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [595, 842], putOnlyUsedFonts: true, compress: true });
  pdf.addFileToVFS('DanfseSans-Regular.ttf', assets.regularFont);
  pdf.addFont('DanfseSans-Regular.ttf', 'DanfseSans', 'normal');
  pdf.addFileToVFS('DanfseSans-Bold.ttf', assets.boldFont);
  pdf.addFont('DanfseSans-Bold.ttf', 'DanfseSans', 'bold');
  pdf.setProperties({ title: `DANFSe ${document.number}`, subject: 'Representação local do XML NFS-e Nacional', creator: 'Visualizador DANFSe' });
  pdf.setLineWidth(1);
  pdf.setDrawColor(0);
  pdf.rect(5, 5, 585, 832);
  const layout = createDanfseLayout(pdf);
  header(layout, document, assets);
  identification(layout, document);
  drawDanfseParties(layout, document);
  service(layout, document);
  drawDanfseTaxes(layout, document, fiscalValues);
  layout.line();
  layout.text('INFORMAÇÕES COMPLEMENTARES', 11.9055, layout.top + 11.003, 7, true);
  layout.top += 20.2243;
  layout.paragraph(danfseComplements(document));
  const canhoto = 795.804;
  pdf.setLineWidth(0.5);
  pdf.rect(DANFSE_PAGE.left, canhoto, DANFSE_PAGE.right - DANFSE_PAGE.left + 1, 20.074);
  for (const x of [153.5709, 298.1378]) pdf.line(x, canhoto, x, canhoto + 20.074);
  layout.text('DATA CIENTIFICAÇÃO:', 12.9055, 801.9317, 6, true);
  layout.text('IDENTIFICAÇÃO E ASSINATURA', 157.4724, 801.9317, 6, true);
  layout.text('Nº NFS-e / CHAVE NFS-e', 302.0394, 801.9317, 6, true);
  layout.text(`${document.number} / ${document.accessKey}`, 302.0394, 809.6563, 7);
  return pdf.output('blob');
}
