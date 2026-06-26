export const EAD_SITE_URL = 'https://universocc.com.br';

export const slugifyCourseName = (name: string): string => {
  const normalized = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'curso-ead';
};

export const buildEadCoursePath = (courseId: string, courseName?: string): string => {
  const slug = slugifyCourseName(courseName || '');
  return `/ead/${slug}/${courseId}`;
};
