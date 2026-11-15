import { PUBLIC_PAGES, PUBLIC_NAVIGATION_PATHS, PUBLIC_SITE_URL } from '../../modules/public/seo/public-pages.ts';

export const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const snapshotPattern = /<!-- public-page:start -->[\s\S]*?<!-- public-page:end -->/g;

export const clearPublicPageHtml = html => html.replace(snapshotPattern, '');

/** Same readable snapshot for every visitor, replaced by createRoot when the app starts. */
export function addPublicPageHtml(html, page) {
  const clean = clearPublicPageHtml(html);
  const links = PUBLIC_NAVIGATION_PATHS.map(path => PUBLIC_PAGES.find(item => item.path === path))
    .map(item => `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.label)}</a></li>`).join('');
  const homeSections = page.path === '/' ? `
    <section id="quem-somos"><h2>Quem Somos</h2><p>A Universo Cursos e Consultoria atua em educação profissional e consultoria estratégica, com polos em Japoatã, Aquidabã e Porto da Folha.</p></section>
    <section id="consultoria"><h2>Serviços de Consultoria</h2><p>Soluções educacionais e técnicas para instituições públicas e privadas.</p><a href="/contato">Fale com a Universo</a></section>` : '';
  const snapshot = `<!-- public-page:start -->
    <style>
      #public-page-preview { color:#122b42; background:white; font:16px/1.65 system-ui,sans-serif; max-width:1120px; margin:auto; padding:24px; }
      #public-page-preview a { color:#1d4ed8; text-underline-offset:3px; }
      #public-page-preview header { padding-bottom:20px; border-bottom:1px solid #dbe3ed; }
      #public-page-preview nav ul { display:flex; flex-wrap:wrap; gap:10px 24px; list-style:none; padding:0; }
      #public-page-preview main { padding:32px 0; }
      #public-page-preview h1 { font-size:clamp(28px,5vw,44px); line-height:1.2; }
      #public-page-preview section { margin:28px 0; }
      #public-page-preview footer { border-top:1px solid #dbe3ed; padding-top:20px; }
    </style>
    <article id="public-page-preview">
      <header><a href="/" aria-label="Universo Cursos e Consultoria — início"><img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" width="200" height="60"></a>
        <nav aria-label="Páginas da Universo"><ul>${links}</ul></nav>
      </header>
      <main><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p>
        <section id="cursos"><h2>Conheça nossos cursos e canais de atendimento</h2><ul>${links}</ul></section>${homeSections}
      </main>
      <footer><a href="/privacidade">Privacidade</a> · <a href="/termos">Termos de Uso</a> · <a href="/cookies">Cookies</a></footer>
    </article>
    <!-- public-page:end -->`;
  if (!/<div\b[^>]*id=["']root["'][^>]*>\s*<\/div>/.test(clean)) {
    throw new Error('A página pública precisa de um root vazio para receber o conteúdo inicial.');
  }
  return clean.replace(/(<div\b[^>]*id=["']root["'][^>]*>)\s*(<\/div>)/, (_match, open, close) => `${open}${snapshot}${close}`);
}

export function renderPublicSitemap(siteUrl = PUBLIC_SITE_URL) {
  const urls = PUBLIC_PAGES.filter(page => !page.canonicalPath)
    .map(page => `  <url><loc>${escapeHtml(siteUrl)}${escapeHtml(page.path)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
