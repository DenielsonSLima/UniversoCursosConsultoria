export const highlightApprovalStatus = (html: string) =>
  String(html || '').replace(
    /\s*-\s*Aprovado\b/gi,
    '<br /><br /><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#001a33;color:#ffffff;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;">APROVADO</span>',
  );

export const replacePreviewVariables = (
  text: string,
  previewData: Record<string, string>,
  extraVars: Record<string, string> = {},
  strong = false,
) => {
  if (!text) return '';
  const replaceEntries = (result: string, entries: Array<[string, string]>) => entries.reduce((current, [key, value]) => {
    const replacement = strong ? `<strong>${value}</strong>` : value;
    return current.replace(new RegExp(`{{${key}}}`, 'g'), replacement);
  }, result);
  const withPreviewData = replaceEntries(text, Object.entries(previewData));
  const parsed = replaceEntries(withPreviewData, Object.entries(extraVars));
  return strong ? highlightApprovalStatus(parsed) : parsed;
};

export const parseProgrammaticRows = (content: string) => {
  const plain = String(content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ');

  return plain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^conte[uú]do program[aá]tico:?$/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 2) return null;
      return {
        nome: parts[0],
        carga: parts[1] || '',
        status: parts.slice(2).join(' - ') || '',
      };
    })
    .filter(Boolean) as Array<{ nome: string; carga: string; status: string }>;
};
