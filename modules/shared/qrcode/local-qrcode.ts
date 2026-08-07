import QRCode from 'qrcode';

export interface LocalQrCodeOptions {
  size?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

const DEFAULT_SIZE = 300;
const MIN_SIZE = 32;
const MAX_SIZE = 2048;

const normalizeSize = (size?: number) => {
  if (!Number.isFinite(size)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(Number(size))));
};

const normalizeMargin = (margin?: number) => {
  if (!Number.isFinite(margin)) return 1;
  return Math.max(0, Math.round(Number(margin)));
};

/**
 * Gera a imagem do QR integralmente no navegador/processo local.
 * Nenhum conteúdo é enviado para serviços externos.
 */
export const createLocalQrCodeDataUrl = async (
  value: string,
  options: LocalQrCodeOptions = {},
) => {
  const normalizedValue = String(value ?? '');
  if (!normalizedValue) {
    throw new Error('O conteúdo do QR Code não pode ser vazio.');
  }

  return QRCode.toDataURL(normalizedValue, {
    width: normalizeSize(options.size),
    margin: normalizeMargin(options.margin),
    errorCorrectionLevel: options.errorCorrectionLevel || 'M',
    type: 'image/png',
  });
};
