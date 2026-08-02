import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const SOURCE_HTML_PATH = path.join(DIST_DIR, 'index.html');
const OUTPUT_DIR = path.join(DIST_DIR, '_social-share');
const SITE_URL = (process.env.SOCIAL_SHARE_BASE_URL || 'https://universocc.com.br').replace(/\/+$/, '');

const publicRoute = (route, slug, title, description, options = {}) => ({
  route,
  slug,
  title,
  description,
  robots: 'index, follow',
  ...options,
});

const privateRoute = (route, slug, title, description, options = {}) => ({
  route,
  slug,
  title,
  description,
  robots: 'noindex, nofollow',
  ...options,
});

const ROUTES = [
  publicRoute(
    '/',
    'home',
    'Universo Cursos e Consultoria | Educação que transforma',
    'Cursos técnicos, EAD, cursos livres, especializações e ensino superior com atendimento próximo e formação de qualidade.',
    { imageSlug: 'home-v2' },
  ),
  publicRoute(
    '/ead',
    'ead',
    'Cursos EAD | Universo Cursos e Consultoria',
    'Estude onde estiver com cursos EAD acessíveis, flexíveis e voltados ao seu desenvolvimento profissional.',
    { imageSlug: 'ead-v2' },
  ),
  publicRoute(
    '/ead',
    'ead',
    'Curso EAD | Universo Cursos e Consultoria',
    'Conheça esta formação EAD da Universo Cursos e estude onde estiver, com flexibilidade e foco profissional.',
    { outputFile: 'ead-detail.html', omitUrlMetadata: true, imageSlug: 'ead-v2' },
  ),
  publicRoute(
    '/cursos-livres',
    'cursos-livres',
    'Cursos Livres | Universo Cursos e Consultoria',
    'Capacitações práticas e de curta duração para desenvolver habilidades e abrir novas oportunidades profissionais.',
  ),
  publicRoute(
    '/cursos-livres',
    'cursos-livres',
    'Curso Livre | Universo Cursos e Consultoria',
    'Conheça esta capacitação prática da Universo Cursos e desenvolva novas habilidades para o mercado.',
    { outputFile: 'cursos-livres-detail.html', omitUrlMetadata: true },
  ),
  publicRoute(
    '/cursos-tecnicos',
    'cursos-tecnicos',
    'Cursos Técnicos | Universo Cursos e Consultoria',
    'Formação técnica de qualidade para você conquistar novas oportunidades e avançar no mercado de trabalho.',
  ),
  publicRoute(
    '/cursos-tecnicos',
    'cursos-tecnicos',
    'Curso Técnico | Universo Cursos e Consultoria',
    'Conheça esta formação técnica da Universo Cursos, preparada para novas oportunidades no mercado de trabalho.',
    { outputFile: 'cursos-tecnicos-detail.html', omitUrlMetadata: true },
  ),
  publicRoute(
    '/especializacao',
    'especializacao',
    'Especializações | Universo Cursos e Consultoria',
    'Aprofunde seus conhecimentos com especializações profissionais nas áreas de saúde, educação e gestão.',
    { imageSlug: 'especializacao-v2' },
  ),
  publicRoute(
    '/especializacao',
    'especializacao',
    'Especialização Técnica | Universo Cursos e Consultoria',
    'Conheça esta especialização da Universo Cursos e aprofunde competências para avançar profissionalmente.',
    { outputFile: 'especializacao-detail.html', omitUrlMetadata: true, imageSlug: 'especializacao-v2' },
  ),
  publicRoute(
    '/ensino-superior',
    'ensino-superior',
    'Ensino Superior | Universo Cursos e Consultoria',
    'Graduações, licenciaturas e cursos superiores de tecnologia para transformar seu futuro profissional.',
  ),
  privateRoute(
    '/login',
    'login',
    'Portal do Aluno | Universo Cursos e Consultoria',
    'Entre no Portal do Aluno para acessar seus cursos, matrículas, pagamentos e documentos acadêmicos.',
  ),
  privateRoute(
    '/cadastro',
    'cadastro',
    'Crie seu cadastro | Universo Cursos e Consultoria',
    'Crie seu cadastro de aluno para fazer sua matrícula, acompanhar pagamentos e acessar seus cursos.',
  ),
  privateRoute(
    '/primeiro-acesso',
    'cadastro',
    'Primeiro acesso | Universo Cursos e Consultoria',
    'Conclua seu cadastro e prepare seu acesso ao Portal do Aluno da Universo Cursos e Consultoria.',
  ),
  privateRoute(
    '/confirmacao-email',
    'cadastro',
    'Confirmação de e-mail | Universo Cursos e Consultoria',
    'Confirme seu e-mail para continuar seu acesso aos serviços da Universo Cursos e Consultoria.',
  ),
  privateRoute(
    '/recuperar-senha',
    'login',
    'Recuperar senha | Universo Cursos e Consultoria',
    'Recupere com segurança o acesso à sua conta da Universo Cursos e Consultoria.',
  ),
  privateRoute(
    '/sistema/login',
    'gestor',
    'Acesso ao Sistema | Universo Cursos e Consultoria',
    'Área segura de acesso ao sistema acadêmico da Universo Cursos e Consultoria.',
  ),
  privateRoute(
    '/gestor',
    'gestor',
    'Portal do Gestor | Universo Cursos e Consultoria',
    'Área restrita para gestão acadêmica e administrativa da Universo Cursos e Consultoria.',
  ),
  privateRoute(
    '/professor',
    'gestor',
    'Portal do Professor | Universo Cursos e Consultoria',
    'Área exclusiva para professores acompanharem turmas, atividades e comunicação acadêmica.',
  ),
  privateRoute(
    '/aluno',
    'login',
    'Área do Aluno | Universo Cursos e Consultoria',
    'Área exclusiva para acompanhar cursos, materiais, avaliações e informações acadêmicas.',
    { alunoPwa: true },
  ),
  publicRoute(
    '/localizacao',
    'localizacao',
    'Onde estamos | Universo Cursos e Consultoria',
    'Encontre a Universo Cursos e Consultoria e fale com a unidade mais próxima de você.',
  ),
  publicRoute(
    '/contato',
    'localizacao',
    'Contato e localização | Universo Cursos e Consultoria',
    'Entre em contato, consulte nossos endereços e conheça as opções de atendimento da Universo Cursos e Consultoria.',
  ),
  publicRoute(
    '/polos',
    'polos',
    'Nossos polos | Universo Cursos e Consultoria',
    'Conheça os polos da Universo Cursos e Consultoria em Japoatã, Aquidabã e Porto da Folha, Sergipe.',
  ),
  publicRoute(
    '/links',
    'links',
    'Links oficiais | Universo Cursos e Consultoria',
    'Acesse em um só lugar os cursos, canais de atendimento e páginas oficiais da Universo Cursos e Consultoria.',
  ),
  publicRoute(
    '/bio',
    'links',
    'Links oficiais | Universo Cursos e Consultoria',
    'Acesse em um só lugar os cursos, canais de atendimento e páginas oficiais da Universo Cursos e Consultoria.',
    { robots: 'noindex, follow', canonicalPath: '/links' },
  ),
  publicRoute(
    '/linktree',
    'links',
    'Links oficiais | Universo Cursos e Consultoria',
    'Acesse em um só lugar os cursos, canais de atendimento e páginas oficiais da Universo Cursos e Consultoria.',
    { robots: 'noindex, follow', canonicalPath: '/links' },
  ),
  privateRoute(
    '/validador',
    'validador',
    'Validador de documentos | Universo Cursos e Consultoria',
    'Consulte a autenticidade de certificados e documentos acadêmicos emitidos pela Universo Cursos e Consultoria.',
    { robots: 'noindex, follow' },
  ),
];

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const insertBeforeHeadEnd = (html, tag) => {
  if (!html.includes('</head>')) {
    throw new Error('O arquivo dist/index.html não possui a tag </head>.');
  }
  return html.replace('</head>', `    ${tag}\n</head>`);
};

const setTitle = (html, title) => {
  const tag = `<title>${escapeHtml(title)}</title>`;
  return /<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, tag)
    : insertBeforeHeadEnd(html, tag);
};

const setMeta = (html, attribute, key, content) => {
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}">`;
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapeRegExp(key)}["'])[^>]*>`, 'i');
  return pattern.test(html) ? html.replace(pattern, tag) : insertBeforeHeadEnd(html, tag);
};

const setCanonical = (html, canonicalUrl) => {
  const tag = `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`;
  const pattern = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : insertBeforeHeadEnd(html, tag);
};

const removeMeta = (html, attribute, key) => {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapeRegExp(key)}["'])[^>]*>\\s*`, 'i');
  return html.replace(pattern, '');
};

const removeCanonical = (html) => html.replace(
  /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>\s*/i,
  '',
);

const setManifest = (html, href) => {
  const tag = `<link rel="manifest" href="${escapeHtml(href)}">`;
  const pattern = /<link\b(?=[^>]*\brel=["']manifest["'])[^>]*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : insertBeforeHeadEnd(html, tag);
};

const setAppleTouchIcon = (html, href) => {
  const tag = `<link rel="apple-touch-icon" sizes="180x180" href="${escapeHtml(href)}">`;
  const pattern = /<link\b(?=[^>]*\brel=["']apple-touch-icon["'])[^>]*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : insertBeforeHeadEnd(html, tag);
};

const buildRouteHtml = (sourceHtml, metadata) => {
  const canonicalPath = metadata.canonicalPath || metadata.route;
  const canonicalUrl = `${SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const imageSlug = metadata.imageSlug || metadata.slug;
  const imageUrl = `${SITE_URL}/social-share/${imageSlug}.jpg`;
  const imageAlt = `${metadata.title} — Universo Cursos e Consultoria`;

  let html = setTitle(sourceHtml, metadata.title);
  if (metadata.alunoPwa) {
    html = setManifest(html, '/aluno/manifest.webmanifest');
    html = setAppleTouchIcon(html, '/aluno/icons/apple-touch-icon.png');
    html = setMeta(html, 'name', 'theme-color', '#001a33');
    html = setMeta(html, 'name', 'apple-mobile-web-app-capable', 'yes');
    html = setMeta(html, 'name', 'apple-mobile-web-app-status-bar-style', 'black-translucent');
    html = setMeta(html, 'name', 'apple-mobile-web-app-title', 'Universo CC');
  }
  html = setMeta(html, 'name', 'description', metadata.description);
  html = setMeta(html, 'name', 'robots', metadata.robots);

  html = setMeta(html, 'property', 'og:site_name', 'Universo Cursos e Consultoria');
  html = setMeta(html, 'property', 'og:locale', 'pt_BR');
  html = setMeta(html, 'property', 'og:type', 'website');
  html = setMeta(html, 'property', 'og:title', metadata.title);
  html = setMeta(html, 'property', 'og:description', metadata.description);
  html = setMeta(html, 'property', 'og:image', imageUrl);
  html = setMeta(html, 'property', 'og:image:secure_url', imageUrl);
  html = setMeta(html, 'property', 'og:image:type', 'image/jpeg');
  html = setMeta(html, 'property', 'og:image:width', '1200');
  html = setMeta(html, 'property', 'og:image:height', '630');
  html = setMeta(html, 'property', 'og:image:alt', imageAlt);

  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = setMeta(html, 'name', 'twitter:title', metadata.title);
  html = setMeta(html, 'name', 'twitter:description', metadata.description);
  html = setMeta(html, 'name', 'twitter:image', imageUrl);
  html = setMeta(html, 'name', 'twitter:image:alt', imageAlt);

  if (metadata.omitUrlMetadata) {
    html = removeMeta(html, 'property', 'og:url');
    return removeCanonical(html);
  }

  html = setMeta(html, 'property', 'og:url', canonicalUrl);
  return setCanonical(html, canonicalUrl);
};

const assertImageExists = async (slug) => {
  const imagePath = path.join(DIST_DIR, 'social-share', `${slug}.jpg`);
  try {
    await access(imagePath);
  } catch {
    throw new Error(`[social-share] Imagem obrigatória não encontrada em ${path.relative(PROJECT_ROOT, imagePath)}`);
  }
};

const sourceHtml = await readFile(SOURCE_HTML_PATH, 'utf8');
await mkdir(OUTPUT_DIR, { recursive: true });

for (const metadata of ROUTES) {
  const filename = metadata.outputFile || (metadata.route === '/'
    ? 'home.html'
    : `${metadata.route.slice(1).replaceAll('/', '-')}.html`);
  const outputPath = path.join(OUTPUT_DIR, filename);
  await writeFile(outputPath, buildRouteHtml(sourceHtml, metadata), 'utf8');
}

for (const imageSlug of new Set(ROUTES.map((metadata) => metadata.imageSlug || metadata.slug))) {
  await assertImageExists(imageSlug);
}

console.log(`[social-share] ${ROUTES.length} páginas geradas em ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}.`);
