import { readFile } from 'node:fs/promises';
import path from 'node:path';

const SITE_URL = (process.env.SOCIAL_SHARE_BASE_URL || 'https://universocc.com.br').replace(/\/+$/, '');

const TEMPLATES = {
  'ead-detail': {
    filename: 'ead-detail.html',
    pathPrefix: '/ead/',
  },
  'cursos-livres-detail': {
    filename: 'cursos-livres-detail.html',
    pathPrefix: '/cursos-livres/',
  },
  'cursos-tecnicos-detail': {
    filename: 'cursos-tecnicos-detail.html',
    pathPrefix: '/cursos-tecnicos/',
  },
  'especializacao-detail': {
    filename: 'especializacao-detail.html',
    pathPrefix: '/especializacao/',
  },
};

const TECHNICAL_NURSING_SOCIAL = {
  pathPrefix: '/cursos-tecnicos/tecnico-em-enfermagem/',
  title: 'Técnico em Enfermagem | Universo Cursos e Consultoria',
  description: 'Transforme cuidado em profissão. Conheça a nova turma de Técnico em Enfermagem em Japoatã e fale com a nossa secretaria.',
  image: `${SITE_URL}/social-share/tecnico-enfermagem-2026.jpg`,
};

const firstQueryValue = (value) => Array.isArray(value) ? value[0] : value;

const escapeHtmlAttribute = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const injectRequestedUrl = (html, requestedUrl) => {
  const safeUrl = escapeHtmlAttribute(requestedUrl);
  const tags = [
    `<meta property="og:url" content="${safeUrl}">`,
    `<link rel="canonical" href="${safeUrl}">`,
  ].join('\n    ');

  if (!html.includes('</head>')) {
    throw new Error('O template social não possui a tag </head>.');
  }

  return html.replace('</head>', `    ${tags}\n</head>`);
};

const replaceMetaContent = (html, attribute, key, content) => {
  const safeContent = escapeHtmlAttribute(content);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapedKey}["'])[^>]*>`, 'i');
  const tag = `<meta ${attribute}="${key}" content="${safeContent}">`;
  return pattern.test(html) ? html.replace(pattern, tag) : html;
};

const applySocialOverride = (html, metadata) => {
  let nextHtml = html.replace(
    /<title\b[^>]*>[\s\S]*?<\/title>/i,
    `<title>${escapeHtmlAttribute(metadata.title)}</title>`,
  );
  nextHtml = replaceMetaContent(nextHtml, 'name', 'description', metadata.description);
  nextHtml = replaceMetaContent(nextHtml, 'property', 'og:title', metadata.title);
  nextHtml = replaceMetaContent(nextHtml, 'property', 'og:description', metadata.description);
  nextHtml = replaceMetaContent(nextHtml, 'property', 'og:image', metadata.image);
  nextHtml = replaceMetaContent(nextHtml, 'property', 'og:image:secure_url', metadata.image);
  nextHtml = replaceMetaContent(nextHtml, 'property', 'og:image:alt', metadata.title);
  nextHtml = replaceMetaContent(nextHtml, 'name', 'twitter:title', metadata.title);
  nextHtml = replaceMetaContent(nextHtml, 'name', 'twitter:description', metadata.description);
  nextHtml = replaceMetaContent(nextHtml, 'name', 'twitter:image', metadata.image);
  nextHtml = replaceMetaContent(nextHtml, 'name', 'twitter:image:alt', metadata.title);
  return nextHtml;
};

export default async function socialPreview(request, response) {
  const templateName = firstQueryValue(request.query?.template);
  const requestedPathValue = firstQueryValue(request.query?.path);
  const template = Object.hasOwn(TEMPLATES, templateName)
    ? TEMPLATES[templateName]
    : null;

  if (!template || typeof requestedPathValue !== 'string') {
    response.status(400).send('Prévia social inválida.');
    return;
  }

  const requestedPath = `/${requestedPathValue.replace(/^\/+/, '')}`;
  if (!requestedPath.startsWith(template.pathPrefix) || requestedPath.includes('..')) {
    response.status(400).send('Caminho de prévia social inválido.');
    return;
  }

  try {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      '_social-share',
      template.filename,
    );
    const templateHtml = await readFile(templatePath, 'utf8');
    const canonicalUrl = `${SITE_URL}${requestedPath}`;
    const socialHtml = templateName === 'cursos-tecnicos-detail'
      && requestedPath.startsWith(TECHNICAL_NURSING_SOCIAL.pathPrefix)
      ? applySocialOverride(templateHtml, TECHNICAL_NURSING_SOCIAL)
      : templateHtml;
    const html = injectRequestedUrl(socialHtml, canonicalUrl);

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    response.status(200).send(html);
  } catch (error) {
    console.error('[social-preview] Falha ao montar a prévia dinâmica.', error);
    response.status(500).send('Não foi possível montar a prévia social.');
  }
}
