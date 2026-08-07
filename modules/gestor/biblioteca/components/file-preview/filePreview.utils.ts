import { LibraryFileType } from '../../biblioteca.types';

export type FilePreviewKind = 'PDF' | 'DOC' | 'XLS' | 'PPT' | 'IMG' | 'VIDEO' | 'OTHER';

const EXTENSION_GROUPS: Record<FilePreviewKind, string[]> = {
  PDF: ['pdf'],
  DOC: ['doc', 'docx'],
  XLS: ['xls', 'xlsx'],
  PPT: ['ppt', 'pptx'],
  IMG: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
  VIDEO: ['mp4', 'webm', 'mov', 'm4v'],
  OTHER: []
};

export const getFileExtension = (...values: Array<string | null | undefined>) => {
  for (const rawValue of values) {
    const value = `${rawValue || ''}`.trim().split(/[?#]/)[0];
    const match = value.match(/\.([a-z0-9]+)$/i);
    if (match?.[1]) return match[1].toLowerCase();
  }

  return '';
};

export const resolvePreviewKind = (
  fileType: LibraryFileType,
  title?: string | null,
  url?: string | null
): FilePreviewKind => {
  const extension = getFileExtension(title, url);
  const extensionKind = (Object.entries(EXTENSION_GROUPS) as Array<[FilePreviewKind, string[]]>)
    .find(([, extensions]) => extensions.includes(extension))?.[0];

  return extensionKind || fileType || 'OTHER';
};

export const detectLibraryFileType = (fileName: string): LibraryFileType => {
  const extension = getFileExtension(fileName);
  const matchedKind = (Object.entries(EXTENSION_GROUPS) as Array<[FilePreviewKind, string[]]>)
    .find(([, extensions]) => extensions.includes(extension))?.[0];

  return matchedKind || 'OTHER';
};

export const isPublicHttpUrl = (value?: string | null) => {
  try {
    const url = new URL(`${value || ''}`.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const buildOfficeViewerUrl = (fileUrl: string) =>
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;

export const getFileTypeLabel = (kind: FilePreviewKind) => {
  const labels: Record<FilePreviewKind, string> = {
    PDF: 'PDF',
    DOC: 'Word',
    XLS: 'Excel',
    PPT: 'PowerPoint',
    IMG: 'Imagem',
    VIDEO: 'Vídeo',
    OTHER: 'Arquivo'
  };

  return labels[kind];
};
