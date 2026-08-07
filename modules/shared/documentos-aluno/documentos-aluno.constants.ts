export const DOCUMENTOS_ALUNO_BUCKET = 'documentos-alunos';

export const DOCUMENTO_ALUNO_MAX_ARQUIVOS_POR_ITEM = 5;
export const DOCUMENTO_ALUNO_MAX_SEPARADO_BYTES = 10 * 1024 * 1024;
export const DOCUMENTO_ALUNO_MAX_PDF_UNICO_BYTES = 30 * 1024 * 1024;

export const DOCUMENTO_ALUNO_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const DOCUMENTO_ALUNO_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
