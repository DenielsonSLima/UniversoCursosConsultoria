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
    const html = injectRequestedUrl(templateHtml, canonicalUrl);

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    response.status(200).send(html);
  } catch (error) {
    console.error('[social-preview] Falha ao montar a prévia dinâmica.', error);
    response.status(500).send('Não foi possível montar a prévia social.');
  }
}
