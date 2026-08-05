import { supabase } from '../../../lib/supabase';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { PublicPushRegistration } from '../native-app/native-app.service';

export const PUBLIC_SUPPORT_STORAGE_KEY = 'universo.public-support.access-token';
export const PUBLIC_SUPPORT_PENDING_REQUEST_KEY = 'universo.public-support.pending-request';
const PUBLIC_SUPPORT_PENDING_REQUEST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PUBLIC_SUPPORT_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_SUPPORT_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const PUBLIC_SUPPORT_ACCESS_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
let memoryPendingRequest: PublicSupportPendingRequest | null = null;

export type PublicSupportErrorKind = 'expired' | 'rate_limited' | 'request' | 'server' | 'network';

export class PublicSupportRequestError extends Error {
  readonly status: number | null;
  readonly kind: PublicSupportErrorKind;
  readonly retryable: boolean;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'PublicSupportRequestError';
    this.status = status;
    this.kind = status === 404 || status === 410
      ? 'expired'
      : status === 429
        ? 'rate_limited'
        : status !== null && status >= 400 && status < 500
          ? 'request'
          : status !== null && status >= 500
            ? 'server'
            : 'network';
    this.retryable = this.kind === 'network' || this.kind === 'rate_limited' || this.kind === 'server';
  }
}

const readLegacyValue = (key: string) => {
  if (typeof window === 'undefined') return '';
  try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
};

export const loadPublicSupportAccessToken = async () => {
  const legacyToken = readLegacyValue(PUBLIC_SUPPORT_STORAGE_KEY);
  if (!Capacitor.isNativePlatform()) return legacyToken;

  try {
    const stored = await Preferences.get({ key: PUBLIC_SUPPORT_STORAGE_KEY });
    if (stored.value) return stored.value;
    if (legacyToken) await Preferences.set({ key: PUBLIC_SUPPORT_STORAGE_KEY, value: legacyToken });
  } catch {
    // A queda para localStorage preserva instalações antigas e WebViews sem o plugin.
  }
  return legacyToken;
};

export const persistPublicSupportAccessToken = async (accessToken: string) => {
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(PUBLIC_SUPPORT_STORAGE_KEY, accessToken); } catch { /* indisponível */ }
  }
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: PUBLIC_SUPPORT_STORAGE_KEY, value: accessToken }).catch(() => undefined);
  }
};

export const clearPublicSupportAccessToken = async () => {
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(PUBLIC_SUPPORT_STORAGE_KEY); } catch { /* indisponível */ }
  }
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: PUBLIC_SUPPORT_STORAGE_KEY }).catch(() => undefined);
  }
};

export const isPublicSupportAccessExpiredError = (error: unknown) => (
  error instanceof PublicSupportRequestError && error.kind === 'expired'
);

export const createPublicSupportRequestId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const createPublicSupportAccessToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export interface PublicSupportPendingRequest {
  requestId: string;
  accessToken: string;
  fingerprint: string;
  createdAt: number;
}

const parsePendingRequest = (value: string): PublicSupportPendingRequest | null => {
  try {
    const parsed = JSON.parse(value) as Partial<PublicSupportPendingRequest>;
    if (typeof parsed.requestId !== 'string'
      || !PUBLIC_SUPPORT_REQUEST_ID_PATTERN.test(parsed.requestId)
      || typeof parsed.accessToken !== 'string'
      || !PUBLIC_SUPPORT_ACCESS_TOKEN_PATTERN.test(parsed.accessToken)
      || typeof parsed.fingerprint !== 'string'
      || !PUBLIC_SUPPORT_FINGERPRINT_PATTERN.test(parsed.fingerprint)
      || typeof parsed.createdAt !== 'number'
      || !Number.isFinite(parsed.createdAt)
      || parsed.createdAt > Date.now() + 5 * 60 * 1000
      || Date.now() - parsed.createdAt > PUBLIC_SUPPORT_PENDING_REQUEST_MAX_AGE_MS) return null;
    return parsed as PublicSupportPendingRequest;
  } catch {
    return null;
  }
};

export const loadPublicSupportPendingRequest = async () => {
  const legacyValue = readLegacyValue(PUBLIC_SUPPORT_PENDING_REQUEST_KEY);
  let nativeValue = '';
  if (Capacitor.isNativePlatform()) {
    try {
      const stored = await Preferences.get({ key: PUBLIC_SUPPORT_PENDING_REQUEST_KEY });
      nativeValue = stored.value || '';
      if (!stored.value && legacyValue) {
        await Preferences.set({ key: PUBLIC_SUPPORT_PENDING_REQUEST_KEY, value: legacyValue });
      }
    } catch {
      // A queda para localStorage mantém a recuperação disponível no WebView.
    }
  }
  const pending = [
    parsePendingRequest(nativeValue),
    parsePendingRequest(legacyValue),
    memoryPendingRequest,
  ]
    .filter((candidate): candidate is PublicSupportPendingRequest => Boolean(candidate))
    .sort((left, right) => right.createdAt - left.createdAt)[0] || null;
  memoryPendingRequest = pending;
  return pending;
};

export const persistPublicSupportPendingRequest = async (pending: PublicSupportPendingRequest) => {
  memoryPendingRequest = pending;
  const value = JSON.stringify(pending);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(PUBLIC_SUPPORT_PENDING_REQUEST_KEY, value); } catch { /* indisponível */ }
  }
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: PUBLIC_SUPPORT_PENDING_REQUEST_KEY, value }).catch(() => undefined);
  }
};

export const clearPublicSupportPendingRequest = async () => {
  memoryPendingRequest = null;
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(PUBLIC_SUPPORT_PENDING_REQUEST_KEY); } catch { /* indisponível */ }
  }
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: PUBLIC_SUPPORT_PENDING_REQUEST_KEY }).catch(() => undefined);
  }
};

export const createPublicSupportRequestFingerprint = async (input: Record<string, unknown>) => {
  const canonical = JSON.stringify(
    Object.entries(input)
      .filter(([key]) => !['turnstileToken', 'requestId', 'notifyReply'].includes(key))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const getPublicSupportRealtimeTopic = async (accessToken: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
  const accessHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `public-support:${accessHash}`;
};

export interface PublicSupportBootstrap {
  polos: Array<{ id: string; nome: string; cidade: string; estado: string; is_matriz: boolean }>;
  configs: Array<Record<string, any>>;
  flow: Record<string, any> | null;
}

export interface PublicSupportHistory {
  chat: {
    id: string;
    remetente_nome: string;
    status: 'pendente' | 'solucionada';
    assunto: string;
    protocolo: string;
    created_at: string;
  };
  messages: Array<{
    id: string;
    remetente_nome: string;
    remetente_tipo: 'aluno' | 'gestor' | 'sistema';
    conteudo: string;
    anexo_path?: string | null;
    anexo_url?: string | null;
    created_at: string;
  }>;
}

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
  reader.onload = () => {
    const result = String(reader.result || '');
    const separator = result.indexOf(',');
    if (separator < 0) {
      reject(new Error('O arquivo selecionado é inválido.'));
      return;
    }
    resolve(result.slice(separator + 1));
  };
  reader.readAsDataURL(file);
});

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('public-student-support', { body });
  if (error) {
    const response = error.context && typeof error.context.clone === 'function' ? error.context.clone() : error.context;
    const payload = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
    const status = response && typeof response.status === 'number' ? response.status : null;
    throw new PublicSupportRequestError(
      payload?.error || error.message || 'Não foi possível concluir o atendimento.',
      status,
    );
  }
  if (data?.error) throw new PublicSupportRequestError(data.error, null);
  return data as T;
};

export const publicSupportService = {
  bootstrap: () => invoke<PublicSupportBootstrap>({ action: 'bootstrap' }),
  createTicket: (input: Record<string, unknown>) => invoke<{ chat: PublicSupportHistory['chat']; accessToken: string; averageResponseMinutes: number }>({
    action: 'create-ticket',
    ...input,
    challengeContext: Capacitor.isNativePlatform() ? 'native' : 'web',
  }),
  history: (accessToken: string) => invoke<PublicSupportHistory>({ action: 'history', accessToken }),
  registerPush: (accessToken: string, registration: PublicPushRegistration) => invoke<{ registered: boolean }>({
    action: 'register-push',
    accessToken,
    ...registration,
  }),
  sendMessage: (accessToken: string, message: string) => invoke<PublicSupportHistory>({ action: 'send-message', accessToken, message }),
  sendAttachment: async (accessToken: string, file: File) => invoke<PublicSupportHistory>({
    action: 'send-attachment',
    accessToken,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    fileBase64: await fileToBase64(file),
  }),
};
