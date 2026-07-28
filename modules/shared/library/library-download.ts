export interface LibraryDownloadFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface LibraryDownloadDocument {
  id: string;
  folderId: string | null;
  name: string;
  url: string;
  fileType?: string;
  sizeBytes?: number | null;
}

interface DownloadLibrarySelectionOptions {
  selectedFolderIds: string[];
  selectedDocumentIds: string[];
  folders: LibraryDownloadFolder[];
  documents: LibraryDownloadDocument[];
  archiveName?: string;
  onProgress?: (message: string) => void;
}

const sanitizePathPart = (value: string, fallback: string) => {
  const sanitized = `${value || ''}`
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');

  return sanitized || fallback;
};

const DOWNLOADABLE_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov'
]);

const FALLBACK_EXTENSION_BY_TYPE: Record<string, string> = {
  PDF: 'pdf',
  DOC: 'docx',
  XLS: 'xlsx',
  PPT: 'pptx',
  IMG: 'jpg',
  VIDEO: 'mp4'
};

const getKnownExtension = (value: string) => {
  const match = value.toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match && DOWNLOADABLE_EXTENSIONS.has(match[1]) ? match[1] : '';
};

const getUrlExtension = (url: string) => {
  try {
    const lastPathPart = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return getKnownExtension(lastPathPart);
  } catch {
    return '';
  }
};

const resolveDownloadFileName = (document: LibraryDownloadDocument, fallback: string) => {
  const safeName = sanitizePathPart(document.name, fallback);
  if (getKnownExtension(safeName)) return safeName;

  const extension = getUrlExtension(document.url) ||
    FALLBACK_EXTENSION_BY_TYPE[`${document.fileType || ''}`.toUpperCase()] ||
    '';

  return extension ? `${safeName}.${extension}` : safeName;
};

const triggerBrowserDownload = (url: string, fileName: string, revokeUrl = false) => {
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (revokeUrl) {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
};

export const downloadSingleLibraryFile = async (document: LibraryDownloadDocument) => {
  if (!/^https?:\/\//i.test(document.url)) {
    throw new Error(`O arquivo "${document.name}" não possui uma URL válida para download.`);
  }

  const response = await fetch(document.url);
  if (!response.ok) {
    throw new Error(`Não foi possível baixar "${document.name}".`);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  triggerBrowserDownload(blobUrl, resolveDownloadFileName(document, 'arquivo'), true);
};

const yieldToBrowser = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

const MAX_ZIP_FILES = 250;
const MAX_ZIP_BYTES = 250 * 1024 * 1024;

export async function downloadLibrarySelectionAsZip({
  selectedFolderIds,
  selectedDocumentIds,
  folders,
  documents,
  archiveName = 'biblioteca',
  onProgress
}: DownloadLibrarySelectionOptions) {
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const selectedFolderSet = new Set(selectedFolderIds);
  const selectedDocumentSet = new Set(selectedDocumentIds);

  const hasSelectedAncestor = (folderId: string) => {
    let current = folderMap.get(folderId)?.parentId || null;
    const visited = new Set<string>();

    while (current && !visited.has(current)) {
      if (selectedFolderSet.has(current)) return true;
      visited.add(current);
      current = folderMap.get(current)?.parentId || null;
    }

    return false;
  };

  const selectedRootFolderIds = selectedFolderIds.filter((folderId) => !hasSelectedAncestor(folderId));
  const includedFolderIds = new Set<string>();

  const includeFolderTree = (folderId: string) => {
    if (includedFolderIds.has(folderId)) return;
    includedFolderIds.add(folderId);
    folders
      .filter((folder) => folder.parentId === folderId)
      .forEach((folder) => includeFolderTree(folder.id));
  };

  selectedRootFolderIds.forEach(includeFolderTree);

  const getSelectedFolderPath = (folderId: string) => {
    const path: string[] = [];
    let current: string | null = folderId;
    const visited = new Set<string>();

    while (current && !visited.has(current)) {
      const folder = folderMap.get(current);
      if (!folder) break;
      path.unshift(sanitizePathPart(folder.name, 'Pasta'));
      if (selectedFolderSet.has(current) && !hasSelectedAncestor(current)) break;
      visited.add(current);
      current = folder.parentId;
    }

    return path.join('/');
  };

  const includedDocuments = documents.filter((document) =>
    selectedDocumentSet.has(document.id) ||
    (!!document.folderId && includedFolderIds.has(document.folderId))
  );

  if (selectedFolderIds.length === 0 && includedDocuments.length === 0) {
    throw new Error('Nenhum arquivo válido foi encontrado na seleção.');
  }

  if (includedDocuments.length > MAX_ZIP_FILES) {
    throw new Error(`Selecione no máximo ${MAX_ZIP_FILES} arquivos por download.`);
  }

  const knownTotalBytes = includedDocuments.reduce((total, document) => {
    const size = Number(document.sizeBytes);
    return total + (Number.isFinite(size) && size > 0 ? size : 0);
  }, 0);

  if (knownTotalBytes > MAX_ZIP_BYTES) {
    throw new Error('A seleção ultrapassa o limite de 250 MB por arquivo ZIP.');
  }

  onProgress?.('Preparando estrutura das pastas...');
  await yieldToBrowser();

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const usedPaths = new Set<string>();

  includedFolderIds.forEach((folderId) => {
    const folderPath = getSelectedFolderPath(folderId);
    if (folderPath) zip.folder(folderPath);
  });

  const resolveUniquePath = (path: string) => {
    if (!usedPaths.has(path)) {
      usedPaths.add(path);
      return path;
    }

    const dotIndex = path.lastIndexOf('.');
    const base = dotIndex > path.lastIndexOf('/') ? path.slice(0, dotIndex) : path;
    const extension = dotIndex > path.lastIndexOf('/') ? path.slice(dotIndex) : '';
    let suffix = 2;
    let candidate = `${base} (${suffix})${extension}`;

    while (usedPaths.has(candidate)) {
      suffix += 1;
      candidate = `${base} (${suffix})${extension}`;
    }

    usedPaths.add(candidate);
    return candidate;
  };

  let completed = 0;
  let downloadedBytes = 0;
  const pendingDocuments = [...includedDocuments];
  const workerCount = Math.min(4, pendingDocuments.length);
  const downloadController = new window.AbortController();

  const workers = Array.from({ length: workerCount }, async () => {
    while (pendingDocuments.length > 0) {
      const document = pendingDocuments.shift();
      if (!document) return;
      if (!/^https?:\/\//i.test(document.url)) {
        throw new Error(`O arquivo "${document.name}" não possui uma URL válida para download.`);
      }

      const response = await fetch(document.url, { signal: downloadController.signal });
      if (!response.ok) {
        throw new Error(`Não foi possível baixar "${document.name}".`);
      }

      const blob = await response.blob();
      downloadedBytes += blob.size;
      if (downloadedBytes > MAX_ZIP_BYTES) {
        downloadController.abort();
        throw new Error('A seleção ultrapassa o limite de 250 MB por arquivo ZIP.');
      }

      const fileName = resolveDownloadFileName(document, `arquivo-${completed + 1}`);
      const belongsToSelectedFolder = !!document.folderId && includedFolderIds.has(document.folderId);
      const folderPath = belongsToSelectedFolder && document.folderId
        ? getSelectedFolderPath(document.folderId)
        : '';
      const zipPath = resolveUniquePath(folderPath ? `${folderPath}/${fileName}` : fileName);
      zip.file(zipPath, blob);

      completed += 1;
      onProgress?.(`Baixando arquivos: ${completed} de ${includedDocuments.length}`);
      await yieldToBrowser();
    }
  });

  try {
    await Promise.all(workers);
  } catch (error) {
    downloadController.abort();
    throw error;
  }
  onProgress?.('Compactando o arquivo ZIP...');
  await yieldToBrowser();

  const archiveBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      streamFiles: true
    },
    ({ percent }) => onProgress?.(`Compactando: ${Math.round(percent)}%`)
  );

  const archiveUrl = URL.createObjectURL(archiveBlob);
  const safeArchiveName = sanitizePathPart(archiveName, 'biblioteca');
  triggerBrowserDownload(archiveUrl, `${safeArchiveName}.zip`, true);
}
