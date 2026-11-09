import { assertScope } from '../services/nfse.validation';
import type { NfseScope } from '../types/nfse.types';
import type { IssuedNfseIdentity } from '../visualizador/services/nfse-issued-xml.service-core';

export type NfseDownloadFormat = 'pdf' | 'xml';
export interface NfseDownloadFile { name: string; blob: Blob }
export interface NfseDownloadProgress { completed: number; total: number; phase: 'files' | 'zip' }
export interface NfseZipWriter {
  file(name: string, bytes: Uint8Array): unknown;
  generateAsync(options: { type: 'uint8array'; compression: 'DEFLATE'; compressionOptions: { level: number } },
    progress: (metadata: { percent: number }) => void): Promise<Uint8Array>;
}
export type NfseFileReader = (scope: NfseScope, document: IssuedNfseIdentity,
  format: NfseDownloadFormat, signal: AbortSignal) => Promise<NfseDownloadFile>;
export const MAX_NFSE_ZIP_DOCUMENTS = 100;
export const MAX_NFSE_ZIP_BYTES = 50 * 1024 * 1024;

export function assertNfseDownloadSelection(scope: NfseScope, documents: readonly IssuedNfseIdentity[], format: NfseDownloadFormat) {
  assertScope(scope);
  if (format !== 'pdf' && format !== 'xml') throw new Error('Formato de download inválido.');
  if (!documents.length || documents.length > MAX_NFSE_ZIP_DOCUMENTS) {
    throw new Error(`Selecione de 1 a ${MAX_NFSE_ZIP_DOCUMENTS} notas para baixar.`);
  }
  if (new Set(documents.map(item => item.id)).size !== documents.length
    || new Set(documents.map(item => item.accessKey)).size !== documents.length
    || documents.some(item => item.status !== 'EMITIDA' || typeof item.id !== 'string' || !item.id.trim()
      || !/^\d{50}$/.test(item.accessKey ?? '') || !/^\d{1,15}$/.test(item.number ?? ''))) {
    throw new Error('A seleção contém notas sem autorização ou identificação válida. Atualize a lista.');
  }
}

/** All selected files or no ZIP; two concurrent reads and a bounded uncompressed size. */
export async function createNfseDownloadArchive(input: {
  scope: NfseScope; documents: readonly IssuedNfseIdentity[]; format: NfseDownloadFormat;
  signal: AbortSignal; readFile: NfseFileReader; createZip: () => NfseZipWriter;
  onProgress?: (progress: NfseDownloadProgress) => void; maxBytes?: number;
}): Promise<NfseDownloadFile> {
  assertNfseDownloadSelection(input.scope, input.documents, input.format);
  input.signal.throwIfAborted();
  const scope = { ...input.scope };
  const documents = input.documents.map(item => ({ ...item }));
  const zip = input.createZip();
  const controller = new AbortController();
  const abort = () => controller.abort(input.signal.reason);
  input.signal.addEventListener('abort', abort, { once: true });
  const usedNames = new Set<string>();
  let next = 0;
  let completed = 0;
  let size = 0;
  let failure: unknown;
  const worker = async () => {
    try {
      while (next < documents.length) {
        controller.signal.throwIfAborted();
        const document = documents[next++];
        const file = await input.readFile(scope, document, input.format, controller.signal);
        controller.signal.throwIfAborted();
        if (!file.name || /[\\/]/.test(file.name) || Array.from(file.name).some(char => char.charCodeAt(0) < 32) || file.name.includes('..')
          || !file.name.endsWith(`.${input.format}`) || usedNames.has(file.name)) {
          throw new Error('Nome de arquivo inválido no download.');
        }
        usedNames.add(file.name);
        size += file.blob.size;
        if (!file.blob.size || size > (input.maxBytes ?? MAX_NFSE_ZIP_BYTES)) {
          throw new Error('O lote está vazio ou ultrapassa o limite de 50 MB. Reduza a seleção.');
        }
        const bytes = new Uint8Array(await file.blob.arrayBuffer());
        controller.signal.throwIfAborted();
        zip.file(file.name, bytes);
        input.onProgress?.({ completed: ++completed, total: documents.length, phase: 'files' });
      }
    } catch (error) {
      if (failure === undefined) failure = error;
      controller.abort();
      throw error;
    }
  };
  try {
    await Promise.allSettled(Array.from({ length: Math.min(2, documents.length) }, worker));
    input.signal.throwIfAborted();
    if (failure !== undefined) throw failure;
    controller.signal.throwIfAborted();
    input.onProgress?.({ completed, total: documents.length, phase: 'zip' });
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      () => controller.signal.throwIfAborted());
    controller.signal.throwIfAborted();
    return { name: `NFS-e-${scope.environment}-${scope.month}-${input.format.toUpperCase()}.zip`,
      blob: new Blob([new Uint8Array(bytes)], { type: 'application/zip' }) };
  } finally { input.signal.removeEventListener('abort', abort); }
}
