import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const COURSE_OVERRIDES = {
  'Porteiro e Vigia': 'https://player.vimeo.com/video/1204884288?badge=0&autopause=0&player_id=0&app_id=58479',
  'Agente Comunitário de Saúde': 'https://vimeo.com/1204863403?share=copy&fl=sv&fe=ci',
  'Almoxarifado': 'https://vimeo.com/1204873679?fl=ip&fe=ec',
};
const TARGET_COURSES = Object.keys(COURSE_OVERRIDES);
const shouldDryRun = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true';

function readEnv() {
  const envFiles = ['.env.local', '.env'];
  const env = {};
  for (const file of envFiles) {
    const envPath = path.join(process.cwd(), file);
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
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

async function main() {
  const { baseUrl, apiKey } = readEnv();
  if (!baseUrl || !apiKey) {
    throw new Error('Configuração de ambiente incompleta. Defina a URL e a chave Supabase no .env.local/.env.');
  }

  for (const courseName of TARGET_COURSES) {
    const encodedName = encodeURIComponent(courseName);
    const desiredUrl = COURSE_OVERRIDES[courseName];
    const courses = await restRequest(
      baseUrl,
      apiKey,
      `/rest/v1/cursos?modalidade=eq.EAD&nome=eq.${encodedName}&select=id,nome,ead_config`,
    );

    if (!Array.isArray(courses) || courses.length === 0) {
      console.log(`Não encontrado: ${courseName}`);
      continue;
    }

    for (const course of courses) {
      const next = { ...(course.ead_config || {}) };
      const conteudos = Array.isArray(next.conteudos) ? [...next.conteudos] : [];
      const first = conteudos[0] || { id: 'aula-1' };
      const currentUrl = first.videoUrl || '';

      if (currentUrl === desiredUrl) {
        console.log(`Sem alteração (já correto): ${course.nome}`);
        continue;
      }

      const update = {
        ...next,
        conteudos: [{ ...first, videoUrl: desiredUrl }, ...conteudos.slice(1)],
      };

      if (shouldDryRun) {
        console.log(`[DRY RUN] ${course.nome}: ${currentUrl || '<vazio>'} -> ${desiredUrl}`);
        continue;
      }

      await restRequest(baseUrl, apiKey, `/rest/v1/cursos?id=eq.${course.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ ead_config: update }),
      });

      console.log(`Atualizado: ${course.nome}`);
    }
  }
}

await main();
