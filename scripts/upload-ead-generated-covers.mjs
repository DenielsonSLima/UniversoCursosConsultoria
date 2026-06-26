import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, 'Documentos/Cursos EAD Novos 2026/capas-fotograficas-manifest.json');
const storageBucket = 'documentos';
const storagePrefix = 'course-covers/ead';
const uploadStamp = `ai-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;

function readEnv() {
  const env = {};
  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(rootDir, file);
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }

  return {
    url: env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL,
    key:
      env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_SERVICE_ROLE_KEY ||
      env.REACT_APP_SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY,
  };
}

async function restRequest(baseUrl, apiKey, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname}: ${response.status} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function uploadCover(baseUrl, apiKey, slug, coverBuffer) {
  const uploadPath = `/${storageBucket}/${storagePrefix}/${slug}.webp`;
  const response = await fetch(`${baseUrl}/storage/v1/object${uploadPath}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'x-upsert': 'true',
    },
    body: coverBuffer,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Upload ${slug}: ${response.status} ${text}`);
  }

  return `${baseUrl}/storage/v1/object/public${uploadPath}?v=${uploadStamp}`;
}

async function main() {
  const { url: baseUrl, key: apiKey } = readEnv();
  if (!baseUrl || !apiKey) {
    throw new Error('Configure REACT_APP_SUPABASE_URL/VITE_SUPABASE_URL e a chave do Supabase no .env.local.');
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let uploaded = 0;
  let patched = 0;

  for (const cover of manifest.covers) {
    const coverPath = path.join(rootDir, cover.localPath);
    if (!existsSync(coverPath)) {
      throw new Error(`Capa local nao encontrada: ${cover.localPath}`);
    }

    const imagemUrl = await uploadCover(baseUrl, apiKey, cover.slug, readFileSync(coverPath));
    await restRequest(
      baseUrl,
      apiKey,
      `/rest/v1/cursos?modalidade=eq.EAD&nome=eq.${encodeURIComponent(cover.nome)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ imagem_url: imagemUrl }),
      },
    );

    cover.imagemUrl = imagemUrl;
    uploaded += 1;
    patched += 1;
    console.log(`OK ${uploaded}/58 ${cover.nome}`);
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.uploadStamp = uploadStamp;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ uploaded, patched, uploadStamp }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
