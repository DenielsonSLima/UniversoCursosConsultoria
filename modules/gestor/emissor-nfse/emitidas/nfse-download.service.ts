import { assertNfseDownloadSelection, createNfseDownloadArchive,
  type NfseDownloadFile, type NfseDownloadFormat, type NfseDownloadProgress } from './nfse-download.core';
import type { NfseScope } from '../types/nfse.types';
import type { IssuedNfseIdentity } from '../visualizador/services/nfse-issued-xml.service-core';
import { withIssuedDanfsePresentation } from '../visualizador/services/nfse-issued-presentation';
type ResolveIdentity = (document: IssuedNfseIdentity) => IssuedNfseIdentity;

export async function createNfseDownloadFile(scope: NfseScope, document: IssuedNfseIdentity,
  format: NfseDownloadFormat, signal: AbortSignal, resolveIdentity: ResolveIdentity = value => value): Promise<NfseDownloadFile> {
  document = resolveIdentity(document);
  assertNfseDownloadSelection(scope, [document], format);
  signal.throwIfAborted();
  const { readNfseIssuedArtifact } = await import('../visualizador/services/nfse-issued-xml.service');
  const artifact = await readNfseIssuedArtifact(scope, document, signal);
  if (format === 'xml') return { name: `NFS-e-${artifact.document.number}-${artifact.document.accessKey}.xml`,
    blob: new Blob([artifact.xml], { type: 'application/xml;charset=utf-8' }) };
  const { prepareIssuedDanfsePdf } = await import('../visualizador/services/nfse-issued-pdf.service');
  const current = resolveIdentity(document);
  assertNfseDownloadSelection(scope, [current], format);
  return { name: `DANFSe-${artifact.document.accessKey}.pdf`,
    blob: await prepareIssuedDanfsePdf(scope, withIssuedDanfsePresentation(artifact.document, current), signal) };
}

export async function createNfseZip(scope: NfseScope, documents: IssuedNfseIdentity[], format: NfseDownloadFormat,
  signal: AbortSignal, onProgress: (progress: NfseDownloadProgress) => void, resolveIdentity?: ResolveIdentity) {
  assertNfseDownloadSelection(scope, documents, format);
  const { default: JSZip } = await import('jszip');
  return createNfseDownloadArchive({ scope, documents, format, signal, onProgress,
    createZip: () => new JSZip(), readFile: (s, document, f, aborted) => createNfseDownloadFile(s, document, f, aborted, resolveIdentity) });
}

/** Allow Safari to consume the download before releasing its temporary URL. */
export function downloadNfseFile(file: NfseDownloadFile, signal: AbortSignal) {
  signal.throwIfAborted();
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
