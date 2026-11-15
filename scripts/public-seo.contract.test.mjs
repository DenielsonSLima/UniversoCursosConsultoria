import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PUBLIC_PAGES, PUBLIC_NAVIGATION_PATHS, PUBLIC_SITE_URL } from '../modules/public/seo/public-pages.ts';
import { addPublicPageHtml, clearPublicPageHtml, escapeHtml, renderPublicSitemap } from './seo/public-page-html.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.FINANCIAL_PAYMENT_JSDOM_PATH || 'jsdom');
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const generator = path.join(projectRoot, 'scripts/generate-social-share-pages.mjs');
const publicConfig = pathToFileURL(path.join(projectRoot, 'modules/public/seo/public-pages.ts')).href;
const scriptPath = '/assets/public-seo-fixture.js';
const fixtureHtml = `<!doctype html><html lang="pt-BR"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Fixture base title</title><meta name="description" content="Fixture base description">
  <meta name="robots" content="index, follow"><link rel="canonical" href="https://fixture.invalid/">
  <meta property="og:title" content="Fixture"><meta property="og:url" content="https://fixture.invalid/">
  <meta name="twitter:title" content="Fixture"><script type="module" src="${scriptPath}"></script>
</head><body><div id="root"></div></body></html>`;
const publicFilename = route => route === '/' ? 'home.html' : `${route.slice(1).replaceAll('/', '-')}.html`;
const privateFilenames = [
  'login.html', 'cadastro.html', 'primeiro-acesso.html', 'confirmacao-email.html',
  'recuperar-senha.html', 'sistema-login.html', 'gestor.html', 'professor.html',
  'aluno.html', 'validador.html', 'bio.html', 'linktree.html',
];
const dynamicFilenames = ['ead-detail.html', 'cursos-livres-detail.html', 'cursos-tecnicos-detail.html', 'especializacao-detail.html'];
const documentOf = html => new JSDOM(html).window.document;
const robotsOf = document => document.querySelector('meta[name="robots"]')?.getAttribute('content').replaceAll(' ', '');

async function createFixture(directory) {
  await mkdir(path.join(directory, 'social-share'), { recursive: true });
  await mkdir(path.join(directory, 'assets'), { recursive: true });
  await writeFile(path.join(directory, 'index.html'), fixtureHtml);
  await writeFile(path.join(directory, scriptPath.slice(1)), 'globalThis.__publicSeoFixture = true;');
  const imageSlugs = new Set([...PUBLIC_PAGES.map(page => page.imageSlug), 'login', 'cadastro', 'gestor', 'validador']);
  for (const slug of imageSlugs) await writeFile(path.join(directory, 'social-share', `${slug}.jpg`), new Uint8Array([0]));
}

function runGenerator(directory, metadataInjection) {
  const options = { cwd: projectRoot, env: { ...process.env, SOCIAL_SHARE_BASE_URL: PUBLIC_SITE_URL }, encoding: 'utf8' };
  if (!metadataInjection) return execFileSync(process.execPath, [generator, directory], options);
  const code = `import { PUBLIC_PAGES } from ${JSON.stringify(publicConfig)};
    Object.assign(PUBLIC_PAGES.find(page => page.path === '/'), ${JSON.stringify(metadataInjection)});
    process.argv = [process.execPath, ${JSON.stringify(generator)}, ${JSON.stringify(directory)}];
    await import(${JSON.stringify(pathToFileURL(generator).href)});`;
  return execFileSync(process.execPath, ['--input-type=module', '--eval', code], options);
}

function assertBootScript(document) {
  const scripts = document.querySelectorAll(`script[type="module"][src="${scriptPath}"]`);
  assert.equal(scripts.length, 1, 'a entrada React precisa permanecer no HTML gerado');
}

async function outputSnapshot(directory) {
  const files = (await readdir(path.join(directory, '_social-share'))).sort();
  const snapshot = {};
  for (const filename of [...files.map(file => `_social-share/${file}`), 'index.html', 'sitemap.xml']) {
    const content = await readFile(path.join(directory, filename), 'utf8');
    if (!filename.endsWith('.html')) { snapshot[filename] = content; continue; }
    const document = documentOf(content);
    const attributes = node => [...node.attributes].map(attribute => [attribute.name, attribute.value]).sort();
    snapshot[filename] = {
      title: document.title,
      metadata: [...document.head.querySelectorAll('meta')].map(attributes).sort(),
      links: [...document.head.querySelectorAll('link')].map(attributes).sort(),
      scripts: [...document.querySelectorAll('script')].map(node => node.outerHTML),
      body: document.body.innerHTML,
    };
  }
  return snapshot;
}

test('gerador real produz páginas públicas legíveis sem JavaScript e isola os shells', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'universo-public-seo-'));
  try {
    await createFixture(temporary);
    const stdout = runGenerator(temporary);
    assert.match(stdout, /30 páginas geradas/);
    const output = path.join(temporary, '_social-share');
    assert.equal((await readdir(output)).filter(filename => filename.endsWith('.html')).length, 31, '30 rotas e um shell neutro');

    await t.test('cada rota pública contém heading, texto, navegação e metadados únicos do manifesto', async () => {
      for (const page of PUBLIC_PAGES) {
        const html = await readFile(path.join(output, publicFilename(page.path)), 'utf8');
        const document = documentOf(html);
        const root = document.querySelector('#root');
        assert.ok(root, page.path);
        assert.equal(root.querySelectorAll('#public-page-preview').length, 1, page.path);
        assert.equal(root.querySelectorAll('h1').length, 1, page.path);
        assert.equal(root.querySelector('h1').textContent, page.heading, page.path);
        assert.equal(root.querySelector('main > p').textContent, page.description, page.path);
        assert.ok(!root.querySelector('noscript'), 'o conteúdo legível deve servir a todos os visitantes');
        assert.ok(!root.querySelector('[hidden], [aria-hidden="true"]'), 'o snapshot não pode ficar oculto');
        assert.deepEqual([...root.querySelectorAll('nav a')].map(link => link.getAttribute('href')), [...PUBLIC_NAVIGATION_PATHS], page.path);
        assert.equal(document.querySelectorAll('title').length, 1);
        assert.equal(document.title, page.title);
        assert.equal(robotsOf(document), 'index,follow');
        assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
        const canonical = `${PUBLIC_SITE_URL}${page.canonicalPath || page.path}`;
        assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), canonical);
        for (const [attribute, key, expected] of [
          ['name', 'description', page.description], ['property', 'og:title', page.title],
          ['property', 'og:description', page.description], ['property', 'og:url', canonical],
          ['name', 'twitter:title', page.title], ['name', 'twitter:description', page.description],
        ]) {
          const nodes = document.querySelectorAll(`meta[${attribute}="${key}"]`);
          assert.equal(nodes.length, 1, `${page.path}: ${key}`);
          assert.equal(nodes[0].getAttribute('content'), expected, `${page.path}: ${key}`);
        }
        assert.match(html, /<div id="root">\s*<!-- public-page:start -->/);
        assert.match(html, /<!-- public-page:end -->\s*<\/div>/);
        assertBootScript(document);
      }
      const indexHtml = await readFile(path.join(temporary, 'index.html'), 'utf8');
      assert.equal(indexHtml, await readFile(path.join(output, 'home.html'), 'utf8'));
      const home = documentOf(indexHtml);
      assert.ok(home.querySelector('#root #quem-somos h2'));
      assert.ok(home.querySelector('#root #consultoria a[href="/contato"]'));
    });

    await t.test('páginas privadas, aliases noindex e detalhes dinâmicos recebem root vazio', async () => {
      for (const filename of [...privateFilenames, ...dynamicFilenames, 'app-shell.html']) {
        const html = await readFile(path.join(output, filename), 'utf8');
        const document = documentOf(html);
        assert.equal(document.querySelector('#root').innerHTML.trim(), '', filename);
        assert.equal(document.querySelector('#public-page-preview'), null, filename);
        assert.ok(!html.includes('<!-- public-page:start -->'), filename);
        assertBootScript(document);
        if (privateFilenames.includes(filename)) assert.match(robotsOf(document), /^noindex,/);
        if (dynamicFilenames.includes(filename)) {
          assert.equal(document.querySelector('link[rel="canonical"]'), null, filename);
          assert.equal(document.querySelector('meta[property="og:url"]'), null, filename);
        }
      }
      const shell = documentOf(await readFile(path.join(output, 'app-shell.html'), 'utf8'));
      assert.equal(robotsOf(shell), 'noindex,follow');
      assert.equal(shell.querySelector('link[rel="canonical"]'), null);
    });

    await t.test('sitemap contém exatamente as 13 URLs canônicas públicas, sem datas inventadas', async () => {
      const xml = await readFile(path.join(temporary, 'sitemap.xml'), 'utf8');
      const document = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
      assert.equal(document.documentElement.namespaceURI, 'http://www.sitemaps.org/schemas/sitemap/0.9');
      const expected = PUBLIC_PAGES.filter(page => !page.canonicalPath).map(page => `${PUBLIC_SITE_URL}${page.path}`);
      const urls = [...document.querySelectorAll('url > loc')].map(node => node.textContent);
      assert.equal(expected.length, 13);
      assert.deepEqual(urls, expected);
      assert.equal(new Set(urls).size, urls.length);
      assert.equal(document.querySelectorAll('lastmod').length, 0);
      for (const omitted of ['/localizacao', '/login', '/gestor', '/professor', '/aluno', '/bio', '/linktree']) {
        assert.ok(!urls.includes(`${PUBLIC_SITE_URL}${omitted}`), omitted);
      }
      assert.equal(xml, renderPublicSitemap());
      assert.equal(xml, await readFile(path.join(projectRoot, 'public/sitemap.xml'), 'utf8'));
    });

    await t.test('rodar novamente preserva todos os documentos sem acumular snapshots/metadados', async () => {
      const before = await outputSnapshot(temporary);
      runGenerator(temporary);
      const after = await outputSnapshot(temporary);
      for (const filename of Object.keys(before)) assert.deepEqual(after[filename], before[filename], filename);
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('escape e renderer preservam config com HTML e sequências de replace como texto literal', async () => {
  const payload = 'Curso "A" & \'B\' <img src=x onerror="alert(1)"> $& $1 $$';
  assert.equal(escapeHtml(payload), 'Curso &quot;A&quot; &amp; &#39;B&#39; &lt;img src=x onerror=&quot;alert(1)&quot;&gt; $&amp; $1 $$');
  const html = addPublicPageHtml(fixtureHtml, { ...PUBLIC_PAGES[0], heading: payload, description: payload });
  const document = documentOf(html);
  assert.equal(document.querySelector('#root h1').textContent, payload);
  assert.equal(document.querySelector('#root main > p').textContent, payload);
  assert.equal(document.querySelectorAll('#root').length, 1);
  assert.equal(document.querySelector('#root [onerror],#root script'), null);
  assert.equal(addPublicPageHtml(html, { ...PUBLIC_PAGES[0], heading: payload, description: payload }), html);
  assert.equal(clearPublicPageHtml(html), fixtureHtml);
  assert.throws(() => addPublicPageHtml('<div id="root"><p>Existente</p></div>', PUBLIC_PAGES[0]), /root vazio/);

  const temporary = await mkdtemp(path.join(tmpdir(), 'universo-public-seo-escape-'));
  try {
    await createFixture(temporary);
    const canonicalPath = '/teste?valor="<img src=x onerror=alert(1)>&fim=$&';
    runGenerator(temporary, { heading: payload, title: payload, description: payload, canonicalPath });
    const result = documentOf(await readFile(path.join(temporary, '_social-share/home.html'), 'utf8'));
    assert.equal(result.title, payload);
    assert.equal(result.querySelector('#root h1').textContent, payload);
    assert.equal(result.querySelector('meta[name="description"]').getAttribute('content'), payload);
    assert.equal(result.querySelector('meta[property="og:title"]').getAttribute('content'), payload);
    assert.equal(result.querySelector('link[rel="canonical"]').getAttribute('href'), `${PUBLIC_SITE_URL}${canonicalPath}`);
    assert.equal(result.querySelectorAll('title').length, 1);
    assert.equal(result.querySelectorAll('link[rel="canonical"]').length, 1);
    assert.equal(result.querySelector('[onerror]'), null);
    assertBootScript(result);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Vercel encaminha todo o manifesto público e mantém detalhes e fallback separados da Home', async () => {
  const config = JSON.parse(await readFile(path.join(projectRoot, 'vercel.json'), 'utf8'));
  for (const page of PUBLIC_PAGES) {
    const exact = config.rewrites.filter(rewrite => rewrite.source === page.path);
    assert.equal(exact.length, 1, page.path);
    assert.equal(exact[0].destination, `/_social-share/${publicFilename(page.path)}`, page.path);
  }
  for (const route of ['/ead', '/cursos-livres', '/cursos-tecnicos', '/especializacao']) {
    const detail = config.rewrites.find(rewrite => rewrite.source === `${route}/:sharePath*`);
    assert.ok(detail?.destination.startsWith('/api/social-preview?template='), route);
    assert.ok(!detail.destination.includes('home.html'), route);
  }
  assert.deepEqual(config.rewrites.at(-1), { source: '/(.*)', destination: '/_social-share/app-shell.html' });
});
