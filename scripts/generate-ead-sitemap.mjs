import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const siteBaseUrl = 'https://universocc.com.br';
const staticPages = [
  '/',
  '/ead',
  '/ensino-superior',
  '/cursos-tecnicos',
  '/cursos-livres',
  '/especializacao',
  '/contato',
  '/faq',
];

const envFiles = [path.join(rootDir, '.env.local'), path.join(rootDir, '.env')];
const env = {};

for (const filePath of envFiles) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !(match[1] in env)) {
        env[match[1]] = match[2];
      }
    }
  } catch (err) {
    // Arquivo de ambiente opcional; segue sem interromper.
  }
}

const supabaseUrl = env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.REACT_APP_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis SUPABASE ausentes: REACT_APP_SUPABASE_URL/VITE_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY.');
}

function slugifyCourseName(name) {
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
}

function buildEadCoursePath(id, name) {
  return `/ead/${slugifyCourseName(name)}/${id}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const url = `${supabaseUrl}/rest/v1/cursos?select=id,nome&modalidade=eq.EAD&status=eq.ativo&publicar_site=eq.true&order=nome.asc`;
const response = await fetch(url, {
  headers: {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  },
});

if (!response.ok) {
  const text = await response.text();
  throw new Error(`Erro ao buscar cursos EAD: HTTP ${response.status} ${response.statusText}: ${text}`);
}

const data = await response.json();

const now = new Date().toISOString().split('T')[0];
const allUrls = [
  ...staticPages.map((urlPath) => `<url><loc>${siteBaseUrl}${escapeXml(urlPath)}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
  ...((data || []).map((curso) => {
    const path = buildEadCoursePath(curso.id, curso.nome);
    return `<url><loc>${siteBaseUrl}${escapeXml(path)}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
  })),
];

const sitemap = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  ${allUrls.join('\n  ')}\n</urlset>\n`;

writeFileSync(sitemapPath, sitemap, 'utf8');
console.log(`Sitemap atualizado com ${data?.length || 0} cursos em: ${sitemapPath}`);
