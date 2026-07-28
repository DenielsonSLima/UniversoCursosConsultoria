import type { LocalQrCodeOptions } from './local-qrcode';

export interface QrCodeState {
  requestKey: string;
  dataUrl: string;
  error: string;
  loading: boolean;
}

export interface LocalQrCodeAssetState extends QrCodeState {
  ready: boolean;
}

export const isValidLocalQrCodeDataUrl = (value: string) => {
  const prefix = 'data:image/png;base64,';
  if (!value.startsWith(prefix)) return false;
  const payload = value.slice(prefix.length);
  if (
    payload.length < 16
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)
  ) {
    return false;
  }

  try {
    const header = globalThis.atob(payload.slice(0, 12));
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    return pngSignature.every(
      (byte, index) => header.charCodeAt(index) === byte,
    );
  } catch {
    return false;
  }
};

export const getLocalQrCodeRequestKey = (
  value: string,
  options: LocalQrCodeOptions = {},
) => JSON.stringify([
  String(value ?? ''),
  options.size ?? null,
  options.margin ?? null,
  options.errorCorrectionLevel ?? null,
]);

export const resolveLocalQrCodeAssetState = (
  requestKey: string,
  state: QrCodeState,
): LocalQrCodeAssetState => {
  if (state.requestKey !== requestKey) {
    return {
      requestKey,
      dataUrl: '',
      error: '',
      loading: true,
      ready: false,
    };
  }

  const hasValidDataUrl = isValidLocalQrCodeDataUrl(state.dataUrl);
  const error = state.error || (
    !state.loading && !hasValidDataUrl
      ? 'A geração do QR Code retornou uma imagem inválida.'
      : ''
  );

  return {
    ...state,
    dataUrl: hasValidDataUrl ? state.dataUrl : '',
    error,
    ready: !state.loading && !error && hasValidDataUrl,
  };
};
