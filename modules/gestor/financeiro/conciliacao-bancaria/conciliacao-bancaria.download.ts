const BANESE_REMESSA_FILE_NAME_PATTERN =
  /^COB\.240\.\d{6}\.\d{8}\.\d{5}\.\d{5}\.REM$/;

type SignedDownloadResponse = Pick<Response, 'ok' | 'status' | 'blob'>;
type SignedDownloadFetch = (
  input: string,
  init: RequestInit,
) => Promise<SignedDownloadResponse>;

interface DownloadAnchor {
  href: string;
  download: string;
  rel: string;
  style: { display: string };
  click: () => void;
  remove: () => void;
}

export interface BaneseRemittanceDownloadRuntime {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (objectUrl: string) => void;
  createAnchor: () => DownloadAnchor;
  appendAnchor: (anchor: DownloadAnchor) => void;
  defer: (callback: () => void) => void;
}

const browserDownloadRuntime: BaneseRemittanceDownloadRuntime = {
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (objectUrl) => URL.revokeObjectURL(objectUrl),
  createAnchor: () => document.createElement('a'),
  appendAnchor: (anchor) => document.body.appendChild(
    anchor as unknown as ReturnType<typeof document.createElement>,
  ),
  defer: (callback) => { window.setTimeout(callback, 0); },
};

export const assertBaneseRemittanceFileName = (fileName: string) => {
  if (!BANESE_REMESSA_FILE_NAME_PATTERN.test(fileName)) {
    throw new Error('A API Banese retornou um nome de remessa inválido. Gere o arquivo novamente.');
  }
  return fileName;
};

export const fetchBaneseRemittanceBlob = async (
  input: {
    signedUrl: string;
    fileName: string;
    expiresIn: number;
  },
  fetchImplementation: SignedDownloadFetch = globalThis.fetch,
) => {
  assertBaneseRemittanceFileName(input.fileName);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.signedUrl);
  } catch {
    throw new Error('A API CNAB240 Banese não retornou um link de download válido.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('O download da remessa deve usar um link HTTPS assinado.');
  }
  if (!Number.isFinite(input.expiresIn) || input.expiresIn <= 0 || input.expiresIn > 60) {
    throw new Error('A API CNAB240 Banese não confirmou a validade segura do link assinado.');
  }

  let response: SignedDownloadResponse;
  try {
    response = await fetchImplementation(parsedUrl.toString(), {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Não foi possível baixar a remessa privada. Solicite um novo link e tente novamente.');
  }

  if (!response.ok) {
    throw new Error(`Não foi possível baixar a remessa privada (HTTP ${response.status}). Solicite um novo link e tente novamente.`);
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    throw new Error('O arquivo de remessa recebido não pôde ser lido. Tente novamente.');
  }
  if (blob.size <= 0) {
    throw new Error('O Banese retornou um arquivo de remessa vazio. Gere a remessa novamente.');
  }
  return blob;
};

export const triggerBaneseRemittanceDownload = (
  blob: Blob,
  fileName: string,
  runtime: BaneseRemittanceDownloadRuntime = browserDownloadRuntime,
) => {
  const safeFileName = assertBaneseRemittanceFileName(fileName);
  const objectUrl = runtime.createObjectUrl(blob);
  let anchor: DownloadAnchor | null = null;

  try {
    anchor = runtime.createAnchor();
    anchor.href = objectUrl;
    anchor.download = safeFileName;
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    runtime.appendAnchor(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    runtime.defer(() => runtime.revokeObjectUrl(objectUrl));
  }
};
