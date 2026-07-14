export const getFileExtension = (file: File, fallback: string) => {
  const fromName = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';

  if (fromName) return fromName;

  const fromType = file.type.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromType === 'jpeg') return 'jpg';

  return fromType || fallback;
};

export const errorMessage = (error: any, fallback: string) => {
  const message = String(
    error?.message ||
    error?.error_description ||
    error?.details ||
    error?.hint ||
    error ||
    ''
  ).trim();

  return message ? `${fallback}: ${message}` : fallback;
};
