export function dateDbToBr(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');

  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  return dateStr;
}

export function dateBrToDb(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  const parts = dateStr.split('/');

  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  return null;
}
