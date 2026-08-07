const QR_IMAGE_LIMIT = 1_500_000;
const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i;
const BASE64_PATTERN = /^[a-z0-9+/]+={0,2}$/i;

const compactBase64 = (value: string) => value.replace(/\s+/g, '');

const hasSupportedImageSignature = (mime: string, payload: string) => (
  mime === 'png'
    ? payload.startsWith('iVBORw0KGgo')
    : payload.startsWith('/9j/')
);

export const normalizeEadPaymentQrImageSource = (value: unknown) => {
  const candidate = String(value ?? '').trim();
  if (!candidate || candidate.length > QR_IMAGE_LIMIT) return null;

  const dataImage = candidate.match(DATA_IMAGE_PATTERN);
  if (dataImage) {
    const mime = dataImage[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
    const payload = compactBase64(dataImage[2]);
    return BASE64_PATTERN.test(payload) && hasSupportedImageSignature(mime, payload)
      ? `data:image/${mime};base64,${payload}`
      : null;
  }

  const payload = compactBase64(candidate);
  if (!BASE64_PATTERN.test(payload)) return null;
  if (hasSupportedImageSignature('png', payload)) {
    return `data:image/png;base64,${payload}`;
  }
  if (hasSupportedImageSignature('jpeg', payload)) {
    return `data:image/jpeg;base64,${payload}`;
  }
  return null;
};
