import { formatMatricula } from '../../../../lib/academicUtils';
import { waitForDocumentAssets } from '../../../shared/qrcode/document-assets';
import { assertPdfBlobReady } from '../shared/pdf-blob-print';
import type { EmissionLog } from './historico-emissoes.types';

export const getPreviewStudent = (emission: EmissionLog, poloInfo: any) => {
  const birthDate = emission.dados_emissao?.studentBirthDate || emission.aluno?.data_nascimento || '';
  const birthParts = birthDate.split('T')[0]?.split('-') || [];
  const expiresAt = emission.validade_ate ? new Date(emission.validade_ate) : null;

  return {
    id: emission.aluno_id,
    nome: emission.dados_emissao?.studentName || emission.aluno?.nome || '',
    cpf: emission.dados_emissao?.studentCpf || emission.aluno?.cpf_cnpj || '',
    rg: emission.aluno?.rg || '',
    nascimento: birthParts.length === 3
      ? `${birthParts[2]}/${birthParts[1]}/${birthParts[0]}`
      : birthDate,
    matricula: emission.dados_emissao?.studentMatricula
      || formatMatricula(emission.matricula_id, emission.emitido_em, emission.polo_id),
    curso: emission.dados_emissao?.courseName || '',
    instituicao: emission.dados_emissao?.institutionName || 'Universo Cursos e Consultoria',
    validade: expiresAt ? expiresAt.toLocaleDateString('pt-BR') : 'Sem vencimento',
    fotoUrl: emission.dados_emissao?.studentPhotoUrl || emission.aluno?.foto_url || null,
    validationCode: emission.codigo,
    poloRazaoSocial: poloInfo?.nome,
    poloCnpj: poloInfo?.cnpj,
    poloTelefone: poloInfo?.telefone,
  };
};

const getPdfPageNodes = (container: HTMLDivElement) => {
  const certificatePages = Array.from(
    container.querySelectorAll<HTMLElement>('[data-certificate-pdf-page="true"]')
  );
  const standardPages = Array.from(
    container.querySelectorAll<HTMLElement>('.print-page')
  );
  return {
    pageNodes: certificatePages.length ? certificatePages : standardPages,
    isLandscape: certificatePages.length > 0,
  };
};

const waitForPdfAssets = async (container: HTMLDivElement, timeoutMs = 15_000) => {
  await waitForDocumentAssets(container, timeoutMs);
};

export const createEmissionBatchPdf = async (
  totalDocuments: number,
  renderDocument: (documentIndex: number) => Promise<HTMLDivElement>,
  onProgress?: (completedDocuments: number, totalDocuments: number) => void,
): Promise<Blob> => {
  if (totalDocuments < 1) throw new Error('O lote não possui documentos para gerar.');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const captureScale = totalDocuments >= 20 ? 1.15 : 1.5;
  const imageQuality = totalDocuments >= 20 ? 0.84 : 0.92;
  let pdf: InstanceType<typeof jsPDF> | null = null;
  let addedPages = 0;

  onProgress?.(0, totalDocuments);
  for (let documentIndex = 0; documentIndex < totalDocuments; documentIndex += 1) {
    const container = await renderDocument(documentIndex);
    const { pageNodes, isLandscape } = getPdfPageNodes(container);
    if (!pageNodes.length) throw new Error('Elemento de página não localizado no lote.');
    await waitForPdfAssets(container);

    if (!pdf) {
      pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
    }

    for (const pageNode of pageNodes) {
      const canvas = await html2canvas(pageNode, {
        scale: captureScale,
        useCORS: true,
        logging: false,
        allowTaint: false,
        backgroundColor: '#ffffff',
      });
      if (addedPages > 0) {
        pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
      }
      pdf.addImage(
        canvas.toDataURL('image/jpeg', imageQuality),
        'JPEG',
        0,
        0,
        isLandscape ? 297 : 210,
        isLandscape ? 210 : 297,
        undefined,
        'FAST'
      );
      canvas.width = 0;
      canvas.height = 0;
      addedPages += 1;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    onProgress?.(documentIndex + 1, totalDocuments);
  }

  if (!pdf) throw new Error('Não foi possível iniciar o arquivo PDF do lote.');
  const blob = pdf.output('blob');
  assertPdfBlobReady(blob, 'O PDF do lote');
  return blob;
};

export const downloadEmissionPdf = async (
  container: HTMLDivElement,
  emission: EmissionLog,
  filenamePrefix = '2-via',
  filename?: string,
  onProgress?: (completedPages: number, totalPages: number) => void,
  saveFile = true,
): Promise<Blob | null> => {
  const { pageNodes, isLandscape } = getPdfPageNodes(container);
  if (!pageNodes.length) throw new Error('Elemento de página não localizado.');
  const captureScale = pageNodes.length >= 20
    ? 1.25
    : pageNodes.length >= 8
      ? 1.5
      : 2;
  const imageQuality = pageNodes.length >= 20 ? 0.86 : 0.95;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  await waitForPdfAssets(container, Math.max(15_000, pageNodes.length * 500));

  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  onProgress?.(0, pageNodes.length);
  for (const [index, pageNode] of pageNodes.entries()) {
    const canvas = await html2canvas(pageNode, {
      scale: captureScale,
      useCORS: true,
      logging: false,
      allowTaint: false,
      backgroundColor: '#ffffff',
    });
    if (index > 0) pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
    pdf.addImage(
      canvas.toDataURL('image/jpeg', imageQuality),
      'JPEG',
      0,
      0,
      isLandscape ? 297 : 210,
      isLandscape ? 210 : 297,
      undefined,
      'FAST'
    );
    canvas.width = 0;
    canvas.height = 0;
    onProgress?.(index + 1, pageNodes.length);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  if (saveFile) {
    pdf.save(filename || `${filenamePrefix}-${emission.documento}-${emission.codigo}.pdf`);
    return null;
  }
  const blob = pdf.output('blob');
  assertPdfBlobReady(blob, 'O PDF da emissão');
  return blob;
};

export const saveEmissionPdfBlob = (
  blob: Blob,
  emission: EmissionLog,
  filename = `2-via-${emission.documento}-${emission.codigo}.pdf`,
) => {
  assertPdfBlobReady(blob, 'O PDF da emissão');
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
};
