const getOrigin = () =>
  typeof window === 'undefined' ? '' : window.location.origin;

export const getDocumentValidationUrl = (code: string) =>
  `${getOrigin()}/validador?code=${encodeURIComponent(code)}`;

export const getDocumentValidationQrUrl = (code: string, size = 150) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    getDocumentValidationUrl(code)
  )}`;
