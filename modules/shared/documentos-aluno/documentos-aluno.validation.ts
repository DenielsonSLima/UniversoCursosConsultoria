import {
  DOCUMENTO_ALUNO_MAX_ARQUIVOS_POR_ITEM,
  DOCUMENTO_ALUNO_MAX_PDF_UNICO_BYTES,
  DOCUMENTO_ALUNO_MAX_SEPARADO_BYTES,
  DOCUMENTO_ALUNO_MIME_TYPES,
} from './documentos-aluno.constants';
import type {
  DocumentoAlunoMapeamentoPagina,
  DocumentoAlunoModoEnvio,
} from './documentos-aluno.types';

const formatMegabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export const validarArquivosDocumentoAluno = (
  files: File[],
  modo: DocumentoAlunoModoEnvio,
) => {
  if (!files.length) throw new Error('Selecione ao menos um arquivo.');

  if (modo === 'pdf_unico' && files.length !== 1) {
    throw new Error('O envio consolidado aceita um único arquivo PDF.');
  }

  if (modo === 'separado' && files.length > DOCUMENTO_ALUNO_MAX_ARQUIVOS_POR_ITEM) {
    throw new Error(`Envie no máximo ${DOCUMENTO_ALUNO_MAX_ARQUIVOS_POR_ITEM} arquivos por documento.`);
  }

  const maxBytes = modo === 'pdf_unico'
    ? DOCUMENTO_ALUNO_MAX_PDF_UNICO_BYTES
    : DOCUMENTO_ALUNO_MAX_SEPARADO_BYTES;

  for (const file of files) {
    if (!DOCUMENTO_ALUNO_MIME_TYPES.has(file.type)) {
      throw new Error(`O arquivo "${file.name}" deve ser PDF, JPG, PNG ou WEBP.`);
    }
    if (modo === 'pdf_unico' && file.type !== 'application/pdf') {
      throw new Error('O envio consolidado deve ser um arquivo PDF.');
    }
    if (file.size <= 0 || file.size > maxBytes) {
      throw new Error(`O arquivo "${file.name}" deve ter no máximo ${formatMegabytes(maxBytes)}.`);
    }
  }
};

export const validarMapeamentosDocumentoAluno = (
  mappings: DocumentoAlunoMapeamentoPagina[],
  totalPaginas?: number | null,
) => {
  if (!mappings.length) throw new Error('Mapeie ao menos um documento do PDF.');

  const documentos = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping.documentoId) throw new Error('Selecione o documento correspondente.');
    if (documentos.has(mapping.documentoId)) {
      throw new Error('Cada documento deve aparecer apenas uma vez no mapeamento.');
    }
    documentos.add(mapping.documentoId);

    if (!Number.isInteger(mapping.paginaInicial) || mapping.paginaInicial < 1) {
      throw new Error('A página inicial deve ser um número maior que zero.');
    }
    if (!Number.isInteger(mapping.paginaFinal) || mapping.paginaFinal < mapping.paginaInicial) {
      throw new Error('A página final deve ser igual ou posterior à página inicial.');
    }
    if (totalPaginas && mapping.paginaFinal > totalPaginas) {
      throw new Error(`O intervalo informado ultrapassa as ${totalPaginas} páginas do PDF.`);
    }
  }
};
