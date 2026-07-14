export const chunks = <T,>(items: T[], size: number): T[][] => {
  if (!items.length) return [[]];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

export const moduloNumero = (nome: string) => {
  const match = nome.match(/M[ÓO]DULO\s+([IVXLC]+)/i);
  return match?.[1] || nome;
};
