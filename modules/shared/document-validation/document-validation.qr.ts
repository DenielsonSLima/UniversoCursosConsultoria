import {
  createLocalQrCodeDataUrl,
  type LocalQrCodeOptions,
} from '../qrcode/local-qrcode';
import { getDocumentValidationUrl } from './document-validation.url';

export const getDocumentValidationQrValue = (code: string) => {
  const normalizedCode = String(code ?? '').trim();
  return normalizedCode ? getDocumentValidationUrl(normalizedCode) : '';
};

export const createDocumentValidationQrDataUrl = (
  code: string,
  options: LocalQrCodeOptions = {},
) => {
  const value = getDocumentValidationQrValue(code);
  if (!value) {
    return Promise.reject(
      new Error('O código de validação do documento não foi informado.'),
    );
  }
  return createLocalQrCodeDataUrl(value, options);
};
