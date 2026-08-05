import { formatMatricula } from '../../../../lib/academicUtils';
import {
  buildSelectablePdfBlobFromElements,
  createSelectablePdfBuilder,
  downloadPdfBlob,
  type PdfPageOrientation,
} from '../../../shared/pdf/dom-to-selectable-pdf';
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

const getPdfPageOrientation = (
  pageNode: HTMLElement,
  fallbackOrientation: PdfPageOrientation,
): PdfPageOrientation => {
  if (pageNode.matches('[data-certificate-pdf-page="true"]')) return 'landscape';
  const pageRect = pageNode.getBoundingClientRect();
  if (pageRect.width > 0 && pageRect.height > 0) {
    return pageRect.width >= pageRect.height ? 'landscape' : 'portrait';
  }
  return fallbackOrientation;
};

export const createEmissionBatchPdf = async (
  totalDocuments: number,
  renderDocument: (documentIndex: number) => Promise<HTMLDivElement>,
  onProgress?: (completedDocuments: number, totalDocuments: number) => void,
): Promise<Blob> => {
  if (totalDocuments < 1) throw new Error('O lote não possui documentos para gerar.');

  const captureScale = totalDocuments >= 20 ? 1.15 : 1.5;
  const pdfBuilder = await createSelectablePdfBuilder({
    artworkFormat: 'PNG',
    artworkScale: captureScale,
    title: 'Documentos emitidos em lote',
    subject: 'Documentos institucionais emitidos em lote',
  });

  onProgress?.(0, totalDocuments);
  for (let documentIndex = 0; documentIndex < totalDocuments; documentIndex += 1) {
    const container = await renderDocument(documentIndex);
    const { pageNodes, isLandscape } = getPdfPageNodes(container);
    if (!pageNodes.length) throw new Error('Elemento de página não localizado no lote.');
    await waitForPdfAssets(container);

    for (const pageNode of pageNodes) {
      await pdfBuilder.addPage(pageNode, {
        orientation: getPdfPageOrientation(
          pageNode,
          isLandscape ? 'landscape' : 'portrait',
        ),
        artworkFormat: 'PNG',
        artworkScale: captureScale,
      });
    }

    onProgress?.(documentIndex + 1, totalDocuments);
  }

  const blob = pdfBuilder.outputBlob();
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
  await waitForPdfAssets(container, Math.max(15_000, pageNodes.length * 500));

  onProgress?.(0, pageNodes.length);
  const blob = await buildSelectablePdfBlobFromElements(pageNodes, {
    orientation: isLandscape ? 'landscape' : 'portrait',
    artworkFormat: 'PNG',
    artworkScale: captureScale,
    title: `${emission.documento} - ${emission.codigo}`,
    subject: 'Documento institucional emitido pela Secretaria',
    onProgress,
  });
  assertPdfBlobReady(blob, 'O PDF da emissão');

  if (saveFile) {
    downloadPdfBlob(
      blob,
      filename || `${filenamePrefix}-${emission.documento}-${emission.codigo}.pdf`,
    );
    return null;
  }
  return blob;
};

export const saveEmissionPdfBlob = (
  blob: Blob,
  emission: EmissionLog,
  filename = `2-via-${emission.documento}-${emission.codigo}.pdf`,
) => {
  assertPdfBlobReady(blob, 'O PDF da emissão');
  downloadPdfBlob(blob, filename);
};
