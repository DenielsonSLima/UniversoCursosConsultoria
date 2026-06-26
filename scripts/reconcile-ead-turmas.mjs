import fs from 'node:fs';

const env = {};
for (const file of ['.env.local', '.env']) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
}

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  if (key === '--page-size' && value) acc.pageSize = Number(value);
  if (key === '--pause-ms' && value) acc.pauseMs = Number(value);
  if (key === '--service-role-key' && value) acc.serviceRoleKey = value;
  if (key === '--all') acc.includeDrafts = true;
  return acc;
}, { pageSize: 20, pauseMs: 200, includeDrafts: false, serviceRoleKey: null });

const supabaseUrl = env.SUPABASE_URL || env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = args.serviceRoleKey || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || env.REACT_APP_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const hasServiceKey = !!(args.serviceRoleKey || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY);

if (serviceRoleKey && !hasServiceKey) {
  console.warn('[AVISO] A chave disponível é anonima. Se houver bloqueio de permissão, use uma service role key.');
}

if (!supabaseUrl || !serviceRoleKey) {
  if (!supabaseUrl) console.error('Informe SUPABASE_URL, REACT_APP_SUPABASE_URL ou VITE_SUPABASE_URL.');
  if (!serviceRoleKey) console.error('Informe SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_KEY). Opcionalmente passe --service-role-key na chamada.');
  process.exit(1);
}

const PAGE_SIZE = Number.isFinite(args.pageSize) && args.pageSize > 0 ? Math.min(args.pageSize, 100) : 20;
const PAUSE_MS = Number.isFinite(args.pauseMs) && args.pauseMs >= 0 ? args.pauseMs : 200;
const ONLY_PUBLISHED = !args.includeDrafts;
const endpoint = `${supabaseUrl}/rest/v1`;

const defaultHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const request = async (path, init = {}) => {
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: { ...defaultHeaders, ...(init.headers || {}) },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.details || payload?.msg || JSON.stringify(payload);
    const err = new Error(message || `Request failed with status ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return payload;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toRestInList = (ids) => ids.map((id) => `"${id.replace(/"/g, '""')}"`).join(',');

const buildTurmaCode = (nome, cursoId) => {
  const base = (nome || 'CURSO')
    .substring(0, 15)
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '') || 'CURSO';
  const cleanId = String(cursoId || '').substring(0, 4).toUpperCase() || '0000';
  return `EAD-${base}-${cleanId}`;
};

const main = async () => {
  console.log('[EAD Turmas] Iniciando reconciliacao com paginação...');
  console.log(`[EAD Turmas] Tamanho da pagina: ${PAGE_SIZE} | Pause entre paginas: ${PAUSE_MS}ms | Apenas publicados: ${ONLY_PUBLISHED ? 'Sim' : 'Nao'}`);

  const polos = await request('/polos?select=id&limit=1');
  if (!Array.isArray(polos) || polos.length === 0 || !polos[0]?.id) {
    throw new Error('Nao encontrou polo para associar a turma EAD.');
  }
  const defaultPoloId = polos[0].id;
  console.log(`[EAD Turmas] Polo padrão: ${defaultPoloId}`);

  let offset = 0;
  let checkedCourses = 0;
  let missingTurmas = 0;
  let createdTurmas = 0;
  let skippedTurmas = 0;
  let errored = 0;

  while (true) {
    const publicacaoFilter = ONLY_PUBLISHED ? '&publicar_site=eq.true' : '';
    const query = `/cursos?select=id,nome&modalidade=eq.EAD${publicacaoFilter}&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const cursos = await request(query);
    if (!Array.isArray(cursos) || cursos.length === 0) break;

    checkedCourses += cursos.length;
    const cursoIds = cursos.map((curso) => curso.id);
    const turmaQuery = `/turmas?select=curso_id&curso_id=in.(${toRestInList(cursoIds)})`;
    const turmas = await request(turmaQuery);
    const cursosComTurma = new Set((turmas || []).map((row) => row.curso_id));

    const cursosSemTurma = cursos.filter((curso) => !cursosComTurma.has(curso.id));
    skippedTurmas += cursos.length - cursosSemTurma.length;
    missingTurmas += cursosSemTurma.length;

    for (const curso of cursosSemTurma) {
      const payload = {
        codigo: buildTurmaCode(curso.nome, curso.id),
        nome: `${curso.nome} - EAD Turma Unica`,
        curso_id: curso.id,
        polo_id: defaultPoloId,
        turno: 'EAD',
        status: 'EM_ANDAMENTO',
        vagas_totais: 999999,
      };

      try {
        await request('/turmas', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
          body: JSON.stringify(payload),
        });
        createdTurmas += 1;
        console.log(`+ turma criada: ${payload.codigo}`);
      } catch (err) {
        errored += 1;
        console.error(`Erro ao criar turma para ${curso.id} / ${curso.nome}: ${err.message}`);
      }
    }

    offset += PAGE_SIZE;
    if (PAUSE_MS > 0 && cursos.length === PAGE_SIZE) await sleep(PAUSE_MS);
  }

  console.log('\n[EAD Turmas] Concluido.');
  console.log(`[EAD Turmas] Cursos verificados: ${checkedCourses}`);
  console.log(`[EAD Turmas] Cursos sem turma no momento da verificacao: ${missingTurmas}`);
  console.log(`[EAD Turmas] Turmas criadas: ${createdTurmas}`);
  console.log(`[EAD Turmas] Turmas sem acao (ja existiam): ${skippedTurmas}`);
  console.log(`[EAD Turmas] Erros: ${errored}`);
};

main().catch((error) => {
  console.error('[EAD Turmas] Falha na reconciliacao:', error.message);
  process.exit(1);
});
