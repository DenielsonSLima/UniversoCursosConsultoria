export const normalizeBaneseEdi7Code = (value: string) =>
  value.replace(/\D/g, '').slice(0, 6);

export const isValidBaneseEdi7Code = (value: string) => /^\d{6}$/.test(value);

