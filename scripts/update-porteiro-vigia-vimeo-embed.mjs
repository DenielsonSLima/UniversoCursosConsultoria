import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const COURSE_NAME = 'Porteiro e Vigia';
const VIDEO_URL = 'https://player.vimeo.com/video/1204884288?badge=0&autopause=0&player_id=0&app_id=58479';

function readEnv() {
  const envFiles = ['.env.local', '.env'];
  const env = {};

  for (const file of envFiles) {
    const filePath = path.join(process.cwd(), file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }

  return {
    baseUrl: env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL,
    apiKey:
      env.SUPABASE_SERVICE_ROLE_KEY ||
      env.REACT_APP_SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY,
  };
}

async function restRequest(baseUrl, apiKey, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${endpoint}: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function withIntroVideo(config) {
  const next = { ...(config || {}) };
  const conteudos = Array.isArray(next.conteudos) ? [...next.conteudos] : [];

  if (!conteudos.length) {
    return { value: next, changed: false };
  }

  const introIndex = conteudos.findIndex((item) => item?.id === 'aula-1');
  const targetIndex = introIndex >= 0 ? introIndex : 0;

  let changed = false;
  const nextConteudos = conteudos.map((item, index) => {
    if (!item || typeof item !== 'object') return item;
    if (index !== targetIndex) return item;

    if (item.videoUrl === VIDEO_URL) return item;

    changed = true;
    return {
      ...item,
      videoUrl: VIDEO_URL,
    };
  });

  if (!changed) {
    return { value: next, changed: false };
  }

  return { value: { ...next, conteudos: nextConteudos }, changed: true };
}

async function main() {
  const { baseUrl, apiKey } = readEnv();
  if (!baseUrl || !apiKey) {
    throw new Error('Configuração de ambiente incompleta. Defina a URL e a chave Supabase no .env.local/.env.');
  }

  const encodedName = encodeURIComponent(COURSE_NAME);
  const courses = await restRequest(
    baseUrl,
    apiKey,
    `/rest/v1/cursos?modalidade=eq.EAD&nome=eq.${encodedName}&select=id,nome,ead_config`,
  );

  if (!Array.isArray(courses) || courses.length === 0) {
    console.log('Nenhum curso encontrado com nome:', COURSE_NAME);
    return;
  }

  for (const course of courses) {
    const { value: nextConfig, changed } = withIntroVideo(course.ead_config);
    if (!changed) {
      console.log(`Sem alteração (vídeo já presente): ${course.nome}`);
      continue;
    }

    await restRequest(baseUrl, apiKey, `/rest/v1/cursos?id=eq.${course.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ead_config: nextConfig }),
    });

    console.log(`Atualizado: ${course.nome} (${course.id})`);
  }

  console.log('Concluído.');
}

await main();
