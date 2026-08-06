export const NATIVE_AUDIO_CAPTURE_ACCEPT = [
  'audio/*',
  '.m4a',
  '.mp4',
  '.mp3',
  '.mpeg',
  '.wav',
  '.ogg',
  '.oga',
  '.webm',
].join(',');

const supportedMimeTypes = new Set([
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);

const canonicalMimeAliases = new Map([
  ['audio/m4a', 'audio/mp4'],
  ['audio/x-m4a', 'audio/mp4'],
  ['audio/mp3', 'audio/mpeg'],
  ['audio/x-mp3', 'audio/mpeg'],
  ['audio/x-wav', 'audio/wav'],
  ['audio/vnd.wave', 'audio/wav'],
  ['audio/x-pn-wav', 'audio/wav'],
]);

const mimeTypeByExtension = new Map([
  ['m4a', 'audio/mp4'],
  ['mp4', 'audio/mp4'],
  ['mp3', 'audio/mpeg'],
  ['mpeg', 'audio/mpeg'],
  ['ogg', 'audio/ogg'],
  ['oga', 'audio/ogg'],
  ['wav', 'audio/wav'],
  ['webm', 'audio/webm'],
]);

const preferredExtensionByMimeType = new Map([
  ['audio/mp4', 'm4a'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/webm', 'webm'],
]);

const getExtension = (name: string) => {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

const getCanonicalMimeType = (file: File) => {
  const declaredType = file.type.trim().toLowerCase().split(';')[0];
  const aliasedType = canonicalMimeAliases.get(declaredType) || declaredType;
  if (supportedMimeTypes.has(aliasedType)) return aliasedType;

  // Algumas WebViews devolvem o arquivo nativo sem MIME. Só inferimos pelo nome
  // quando o tipo está ausente ou é o valor genérico do seletor de arquivos.
  if (declaredType && declaredType !== 'application/octet-stream') return null;
  return mimeTypeByExtension.get(getExtension(file.name)) || null;
};

const withCompatibleName = (name: string, mimeType: string) => {
  const currentExtension = getExtension(name);
  if (currentExtension && mimeTypeByExtension.get(currentExtension) === mimeType) return name;

  const preferredExtension = preferredExtensionByMimeType.get(mimeType);
  if (!preferredExtension) return name;
  const trimmedName = name.trim();
  const extensionIndex = trimmedName.lastIndexOf('.');
  const baseName = (extensionIndex > 0 ? trimmedName.slice(0, extensionIndex) : trimmedName)
    || 'mensagem-de-voz';
  return `${baseName}.${preferredExtension}`;
};

/**
 * Normaliza apenas aliases que representam o mesmo contêiner de áudio aceito
 * pelo backend. Formatos diferentes, como AMR/3GP, não são renomeados de forma
 * enganosa: o chamador pode recusá-los e orientar uma nova captura.
 */
export const normalizeCompatibleAudioFile = (file: File): File | null => {
  const mimeType = getCanonicalMimeType(file);
  if (!mimeType) return null;

  const name = withCompatibleName(file.name, mimeType);
  if (file.type.toLowerCase() === mimeType && file.name === name) return file;

  return new File([file], name, {
    type: mimeType,
    lastModified: file.lastModified,
  });
};

export const validateCapturedAudioFile = (
  file: File,
  maxBytes: number,
): { file: File | null; error: string | null } => {
  if (file.size <= 0) {
    return { file: null, error: 'O áudio selecionado está vazio.' };
  }
  if (file.size > maxBytes) {
    return { file: null, error: `O áudio deve ter no máximo ${Math.floor(maxBytes / (1024 * 1024))} MB.` };
  }

  const normalizedFile = normalizeCompatibleAudioFile(file);
  if (!normalizedFile) {
    return {
      file: null,
      error: 'Formato de áudio não aceito. Grave ou selecione um arquivo M4A, MP3, WAV, OGG ou WebM.',
    };
  }
  return { file: normalizedFile, error: null };
};
