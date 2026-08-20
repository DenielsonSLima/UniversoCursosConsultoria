export type ElectronicSignatureRequestOperation =
  | 'REQUEST_DIARY_ENVELOPE'
  | 'PREPARE_DIARY_ORIGINAL'
  | 'FINALIZE_DIARY'
  | 'CREATE_ARTIFACT_DOWNLOAD_URL';

interface RequestIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface RequestIdOptions {
  storage?: RequestIdStorage | null;
  createUuid?: () => string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MEMORY_REQUEST_IDS = new Map<string, string>();
const STORAGE_PREFIX = 'universo:assinatura-eletronica:request:v1';

const resolveStorage = (): RequestIdStorage | null => {
  try {
    return typeof globalThis.sessionStorage === 'undefined'
      ? null
      : globalThis.sessionStorage;
  } catch {
    return null;
  }
};

const storageKey = (operation: ElectronicSignatureRequestOperation, scope: readonly string[]) => {
  const normalizedScope = scope.map((part) => {
    const normalized = part.trim();
    if (!normalized) throw new Error('O escopo da operação de assinatura está incompleto.');
    return encodeURIComponent(normalized);
  });
  return [STORAGE_PREFIX, operation, ...normalizedScope].join(':');
};

const safeRead = (storage: RequestIdStorage | null, key: string) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safeWrite = (storage: RequestIdStorage | null, key: string, value: string) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // O Map conserva a idempotência durante a sessão atual quando o storage é bloqueado.
  }
};

export const getOrCreateElectronicSignatureRequestId = (
  operation: ElectronicSignatureRequestOperation,
  scope: readonly string[],
  options: RequestIdOptions = {},
) => {
  const key = storageKey(operation, scope);
  const storage = options.storage === undefined ? resolveStorage() : options.storage;
  const stored = safeRead(storage, key) ?? MEMORY_REQUEST_IDS.get(key) ?? null;
  if (stored && UUID_PATTERN.test(stored)) {
    MEMORY_REQUEST_IDS.set(key, stored);
    return stored;
  }
  const createUuid = options.createUuid ?? (() => {
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Este navegador não oferece a chave segura exigida para a operação.');
    }
    return globalThis.crypto.randomUUID();
  });
  const requestId = createUuid();
  if (!UUID_PATTERN.test(requestId)) throw new Error('A chave segura gerada é inválida.');
  MEMORY_REQUEST_IDS.set(key, requestId);
  safeWrite(storage, key, requestId);
  return requestId;
};

export const clearElectronicSignatureRequestId = (
  operation: ElectronicSignatureRequestOperation,
  scope: readonly string[],
  options: Pick<RequestIdOptions, 'storage'> = {},
) => {
  const key = storageKey(operation, scope);
  const storage = options.storage === undefined ? resolveStorage() : options.storage;
  MEMORY_REQUEST_IDS.delete(key);
  try {
    storage?.removeItem(key);
  } catch {
    // A autoridade permanece no backend; falhar ao limpar apenas mantém a mesma chave idempotente.
  }
};
