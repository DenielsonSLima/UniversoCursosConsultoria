import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, 'ead-intro-video-test', 'roteiros-ead-lote');
const IMPORT_PATH = path.join(ROOT, 'scripts', 'import-ead-courses.mjs');
const CATALOG_PATH = path.join(ROOT, 'Documentos', 'Cursos EAD Novos 2026', 'catalogo-pesquisa-e-cronograma.md');
const CACHE_PATH = path.join(ROOT, 'ead-intro-video-test', 'roteiros-import-cache.json');
const SKIP_FILE = 'roteiro_intro_curso_eca-comunicacao-proximos-passos.md';

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run') || !args.has('--write');
const forceRebuild = args.has('--force');

const SOURCE_LABELS = {
  database: 'Banco de dados (ead_config)',
  definition: 'Import do projeto (new/legacy definitions)',
  catalog: 'Catálogo local',
  external: 'Pesquisa pública',
  forced: 'Fallback forçado',
};

const genericClosingTemplates = {
  agradecimento: (title) => `Agradecemos seu estudo em ${title}.`,
  atividades: 'A atividade mais importante agora é praticar os blocos na ordem: estudo, simulação curta e registro da decisão.',
  prova: 'Ao finalizar os estudos e as atividades, siga para a prova do módulo e verifique se consolidou a aplicação prática do tema.',
};

const tagProfiles = [
  {
    key: 'eletricidade',
    tags: ['eletricidade', 'eletrica', 'eletrico', 'nr10', 'nr-10', 'instalacoes', 'instalações', 'instalação', 'protecao', 'protecao'],
    topics: [
      'fundamentos de elétrica e risco',
      'inspeção de circuito e identificação do problema',
      'medição básica e validação de sinais',
      'bloqueio, sinais e procedimento de segurança',
      'execução assistida com checklist operacional',
      'registro técnico e encerramento seguro',
    ],
    exemplos: [
      'roteiro de risco elétrico antes do início do atendimento',
      'checar equipamento, bitola e isolamento antes de energizar',
      'preencher checklist de desligamento, bloqueio e segurança',
      'validar aterramento e condições de medição com EPIs',
      'revisar sinalização e comunicação de serviço elétrico',
    ],
    erros: [
      'Trabalhar sem bloqueio e sem avaliar risco elétrico.',
      'Usar EPC/PPE em situação de alta exposição.',
      'Não registrar medições, continuidade e decisão de bloqueio.',
      'Ignorar etapa de retorno seguro e fechamento operacional.',
    ],
    correcao: [
      'Aplicar protocolo de desligamento, bloqueio e validação inicial.',
      'Registrar valores, responsável, risco e conclusão com evidência.',
      'Conferir inspeção física antes de qualquer reposicionamento.',
      'Encerrar com comunicação objetiva para responsável da área.',
    ],
  },
  {
    key: 'seguranca',
    tags: ['seguranca', 'nr10', 'nr-10', 'nr11', 'comercio', 'seguranca-operacional', 'pa carregadeira', 'retroescavadeira', 'empilhadeira', 'portaria', 'porteiro', 'vigia', 'fiscal', 'frentista'],
    topics: [
      'controle de acesso e identificação',
      'registro de ocorrência e comunicação',
      'rondas, monitoramento e prevenção',
      'atendimento a público e conflitos',
      'emergência e resposta inicial',
      'fechamento, revisão e evidência',
    ],
    exemplos: [
      'controle de acesso com validação rápida e documento',
      'registro de ocorrência com horário, local e responsável',
      'checklist de ronda com evidência de ação',
      'atendimento de conflito com contenção e postura ética',
      'protocolo de emergência e comunicação imediata',
    ],
    erros: [
      'Registrar ocorrência sem contexto e horário.',
      'Pular a etapa de checagem de risco antes da ação.',
      'Conflito com atendimento impulsivo sem protocolo.',
      'Não registrar devolutiva ao gestor ou equipe.',
    ],
    correcao: [
      'Registre contexto, risco percebido e ação executada com horário.',
      'Aplique uma checagem mínima: local, público e risco.',
      'Use roteiro de contenção e linguagem profissional.',
      'Finalize com comunicação de quem recebeu e quem executou.',
    ],
  },
  {
    key: 'transporte',
    tags: ['transporte', 'transporte-escolar', 'motorista', 'trajeto', 'passageiro'],
    topics: [
      'planejamento de rota e horário operacional',
      'check-in de veículo e inspeção básica',
      'conduta segura em trânsito e comportamento do aluno',
      'protocolos de embarque, desembarque e documentação',
      'atendimento em situações inesperadas',
      'fechamento de ocorrência e comunicação com equipe',
    ],
    exemplos: [
      'rotina de inspeção e checagem de documentação antes do início da jornada',
      'organização da embarcação e checagem de passageiro',
      'registro de rota e ponto de parada',
      'condução segura em situações variáveis',
      'acolhimento e comunicação com responsáveis e escola',
    ],
    erros: [
      'Iniciar transporte sem checklist e validação do veículo.',
      'Não registrar horário, rota e ocorrências.',
      'Comunicação tardia em situação fora da rotina.',
      'Descuidar de postura preventiva na abordagem do aluno.',
    ],
    correcao: [
      'Inicie com inspeção e conferência do veículo e documentos.',
      'Padronize registro de rota, horários e ocorrências por etapa.',
      'Comunique imediatamente o responsável e a escola em ocorrências.',
      'Aplique protocolo de segurança antes de qualquer decisão operacional.',
    ],
  },
  {
    key: 'alimentacao',
    tags: ['alimentacao', 'cozinha', 'culinaria', 'nutricao'],
    topics: [
      'boas práticas de higienização e segurança alimentar',
      'organização da rotina de produção',
      'preparo e conservação de alimentos',
      'higiene pessoal, ambiente e equipamentos',
      'controle de estoque, validade e rastreabilidade',
      'atendimento, higiene e encerramento do turno',
    ],
    exemplos: [
      'preparo de rotina com controle de matéria-prima e validade',
      'organização da estação de trabalho e fluxo operacional',
      'checagem de ingredientes, etiqueta e armazenamento',
      'registro de produção e ajuste de cardápio',
      'higienização final e preparo para próxima turma',
    ],
    erros: [
      'Pular etapa de higiene entre preparos.',
      'Confundir armazenamento e data de validade.',
      'Não controlar temperatura e conservação.',
      'Finalizar o turno sem limpeza de superfície e equipamentos.',
    ],
    correcao: [
      'Aplique rotina de higiene e validação antes de cada operação.',
      'Registre controle de insumos e validade.',
      'Confirme temperatura, acondicionamento e descarte correto.',
      'Feche o turno com conferência e limpeza detalhada.',
    ],
  },
  {
    key: 'saude',
    tags: ['saude', 'farmacia', 'radiologia', 'analises', 'veterinario', 'cuidador', 'nutricao', 'saude-animal'],
    topics: [
      'acolhimento e triagem inicial',
      'checagem de sinais e documentação básica',
      'procedimentos assistenciais sob limite técnico',
      'organização de prontuários e controle',
      'segurança, biossegurança e orientação',
      'evidência clínica e encaminhamento adequado',
    ],
    exemplos: [
      'recebimento de demanda com triagem e encaminhamento correto',
      'checagem de validade, lote, ou documentação auxiliar',
      'registros de observação e sinais de alerta',
      'higiene, biossegurança e fluxo de atendimento',
      'comunicação clara com família/equipe técnica',
    ],
    erros: [
      'Confundir limite de atuação e executar sem supervisão adequada.',
      'Não registrar observação e sinais de alerta.',
      'Não orientar procedimento de segurança simples quando necessário.',
      'Descuidar da cadeia de comunicação com responsável técnico.',
    ],
    correcao: [
      'Respeite o limite de atribuição e encaminhe para responsável técnico.',
      'Anote o que observou e o momento de cada etapa.',
      'Aplique rotinas de segurança antes de qualquer ação principal.',
      'Comunique sempre com registro de confirmação.',
    ],
  },
  {
    key: 'administracao',
    tags: ['administracao', 'rh', 'office', 'financeiro', 'estoque', 'faturamento', 'secretariado', 'bancario', 'contabilidade'],
    topics: [
      'organização de rotina e atendimento',
      'documentação e protocolo interno',
      'controle financeiro e de dados',
      'processo de atendimento e resposta',
      'rastreabilidade e indicadores',
      'fechamento de ciclo e melhoria contínua',
    ],
    exemplos: [
      'organização de documentação com validação de consistência',
      'controle de pendências em rotina por prioridade',
      'registro de atendimento e confirmação de etapa',
      'conferência de dados antes do fechamento',
      'análise de indicador e revisão do processo',
    ],
    erros: [
      'Pular conferência de documento e gerar retrabalho.',
      'Misturar informações pessoais sem padrão e data.',
      'Finalizar etapa sem rastreabilidade.',
      'Usar linguagem ambígua em comunicação interna.',
    ],
    correcao: [
      'Defina 3 campos mínimos: origem, validação e responsável.',
      'Padronize nome, data e status antes de encerrar a etapa.',
      'Use checklist de fechamento por rotina.',
      'Mantenha mensagem objetiva com evidência objetiva.',
    ],
  },
  {
    key: 'educacao',
    tags: ['educacao', 'pedagogia', 'matematica', 'enem', 'inclu', 'bncc', 'comunicacao', 'redacao', 'tecnologias', 'tecnicas'],
    topics: [
      'objetivos de aprendizagem e contexto',
      'organização de rotina pedagógica',
      'atividade prática orientada',
      'avaliação formativa e devolutiva',
      'comunicação com aluno e família',
      'revisão, adaptação e progressão',
    ],
    exemplos: [
      'explicação curta seguida de atividade guiada',
      'uso de exemplo real do cotidiano para fixação',
      'registro de resposta e revisão com pergunta-chave',
      'feedback em até 24 horas com ação prática',
      'planejamento de próximos passos por dificuldade',
    ],
    erros: [
      'Fazer explicação excessiva sem prática guiada.',
      'Não retomar erro recorrente com novo exemplo.',
      'Ignorar diversidade de ritmo dos alunos.',
      'Não validar com situação-resposta-reflexão.',
    ],
    correcao: [
      'Intercale teoria e aplicação imediatamente.',
      'Inclua um exemplo novo a cada revisão.',
      'Ajuste linguagem para clareza e acessibilidade.',
      'Finalize com mini-ação que o aluno pratica no mesmo ciclo.',
    ],
  },
  {
    key: 'vendas',
    tags: ['marketing', 'vendas', 'loja virtual', 'ecommerce', 'social', 'telemarketing', 'instagram', 'atendimento'],
    topics: [
      'definição de oferta e público',
      'comunicação de valor e necessidade',
      'funil de atendimento e conversão',
      'registro de contato e resposta',
      'métricas de resultado e ajustes',
      'pós-venda e fidelização profissional',
    ],
    exemplos: [
      'diagnóstico rápido da necessidade do cliente',
      'roteiro de resposta em até 30 segundos',
      'registro de etapa de atendimento',
      'criação de checklist de oferta e objeção',
      'pós-venda com fechamento de aprendizado',
    ],
    erros: [
      'Prometer sem comprovação para o cliente.',
      'Não registrar estágio do contato.',
      'Responder sem ouvir a necessidade real.',
      'Descuidar de privacidade e dados pessoais.',
    ],
    correcao: [
      'Padronize oferta por evidência, não por pressão.',
      'Registre contexto e próxima ação do cliente.',
      'Use perguntas de sondagem antes de apresentar solução.',
      'Aplique regras de LGPD e transparência.',
    ],
  },
  {
    key: 'estetica',
    tags: ['beleza', 'cilios', 'sobrancelha', 'manicure', 'pedicure', 'barbeiro'],
    topics: [
      'protocolo de atendimento e ambiente',
      'anamnese e preparo de cliente',
      'execução técnica por etapa',
      'higiene e biossegurança aplicada',
      'orientação de cuidados pós-atendimento',
      'agendamento, portfólio e fidelização',
    ],
    exemplos: [
      'organização do atendimento e da estação de trabalho',
      'checagem de ficha e histórico de cliente',
      'execução com técnica e higienização adequada',
      'explicação de manutenção e cuidados pós atendimento',
      'registro de retorno e agendamento',
    ],
    erros: [
      'Atender sem rotina de higiene e segurança.',
      'Não informar cuidados e limites ao cliente.',
      'Não registrar procedimento e produto usado.',
      'Ignorar contraindicações e alergias comunicadas.',
    ],
    correcao: [
      'Siga ordem fixa: preparação, execução, revisão, comunicação.',
      'Informe o que é possível e o que não deve ser feito.',
      'Documente procedimento com produto, técnica e resultado.',
      'Oriente retorno e sinais de alerta.',
    ],
  },
];

const normalizedTagProfiles = tagProfiles.map((profile) => ({
  ...profile,
  normalizedTags: (profile.tags || []).map((tag) => normalize(tag)),
}));
const sourceTagAliases = {
  seguranca: ['portaria'],
  seg: ['portaria'],
  atendimento: ['atendimento'],
  administracao: ['administracao'],
  servicos: ['atendimento'],
};

function normalizeSourceNotes(sourceNotes = {}) {
  const map = new Map();
  for (const [key, value] of Object.entries(sourceNotes)) {
    if (!key || !value) continue;
    const normalizedKey = normalize(key);
    map.set(normalizedKey, value);
  }
  return map;
}

function resolveResearchNotesFromTags(tags = [], sourceNotes = {}) {
  const normalizedSource = normalizeSourceNotes(sourceNotes);
  const notes = [];
  const normalizedTags = (tags || []).map((tag) => normalize(tag)).filter(Boolean);
  for (const tag of normalizedTags) {
    const direct = normalizedSource.get(tag);
    if (direct) notes.push(direct);
    const aliases = sourceTagAliases[tag] || [];
    for (const alias of aliases) {
      const aliasValue = normalizedSource.get(normalize(alias));
      if (aliasValue) notes.push(aliasValue);
    }
  }
  return [...new Set(notes.map((note) => String(note).trim()).filter(Boolean))];
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function readTextSafe(file) {
  return fs.readFileSync(file, 'utf8');
}

function readJsonSafe(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = readTextSafe(file);
    return raw.trim() ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeIfNeeded(file, content) {
  if (isDryRun) return;
  fs.writeFileSync(file, content, 'utf8');
}

function extractBalanced(text, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let stringChar = null;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (escape) {
      escape = false;
      continue;
    }
    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === stringChar) inString = false;
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }
  return null;
}

function extractJsExpression(content, constName, openChar, closeChar) {
  const start = content.indexOf(`const ${constName}`);
  if (start === -1) return null;
  const open = content.indexOf(openChar, start);
  if (open === -1) return null;
  return extractBalanced(content, open, openChar, closeChar);
}

function parseJsExpression(expr) {
  if (!expr) return null;
  try {
    return vm.runInNewContext(`(${expr})`);
  } catch {
    return null;
  }
}

function parseImportDefinitions() {
  const content = readTextSafe(IMPORT_PATH);
  const legacyExpr = extractJsExpression(content, 'legacyCourseDefinitions', '[', ']');
  const newExpr = extractJsExpression(content, 'newCourseDefinitions', '[', ']');
  const sourceExpr = extractJsExpression(content, 'sourceNotes', '{', '}');
  const legacy = Array.isArray(parseJsExpression(legacyExpr)) ? parseJsExpression(legacyExpr) : [];
  const fresh = Array.isArray(parseJsExpression(newExpr)) ? parseJsExpression(newExpr) : [];
  const sourceNotes = parseJsExpression(sourceExpr) || {};

  const merged = [...legacy, ...fresh];
  const map = new Map();
  for (const course of merged) {
    if (!course?.title) continue;
    const tags = Array.isArray(course.tags) ? course.tags : [];
    const inferredNotes = resolveResearchNotesFromTags(tags, sourceNotes);
    map.set(normalize(course.title), {
      title: course.title,
      area: course.area || 'Geral',
      lessonTopics: Array.isArray(course.lessonTopics) ? course.lessonTopics : [],
      researchNotes: Array.isArray(course.researchNotes)
        ? course.researchNotes
        : inferredNotes,
      tags,
      hours: course.hours,
      price: course.price,
    });
  }

  return { courseMap: map, sourceNotes };
}

function parseCatalog() {
  const content = readTextSafe(CATALOG_PATH);
  const rows = new Map();
  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    if (line.startsWith('| Curso ')) continue;
    if (line.includes('---')) continue;

    const cols = line
      .split('|')
      .slice(1, -1)
      .map((value) => value.trim());
    if (cols.length < 5) continue;

    const [nome, area, carga, valor, observacao] = cols;
    if (!nome || normalize(nome) === 'curso') continue;

    rows.set(normalize(nome), {
      title: nome,
      area,
      carga: Number.parseInt(carga.replace(/[^0-9]/g, ''), 10) || null,
      valor: valor.replace(/[^0-9.,]/g, '').trim(),
      observacao,
    });
  }

  return rows;
}

function loadEnv() {
  const env = { ...process.env };
  for (const file of ['.env.local', '.env']) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const line of readTextSafe(full).split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }

  return {
    url: env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    key: env.REACT_APP_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function normalizeArea(area) {
  const text = normalize(area);
  if (!text) return 'EAD';
  if (/admin|rh|secretari/.test(text)) return 'Administração';
  if (/seguranca|nr10|nr-10|nr11|maquinas|portaria|vigia|frentista|transporte|fiscal/.test(text)) return 'Segurança e Operações';
  if (/saude|farmacia|radiologia|veterinario|cuidador|nutri/.test(text)) return 'Saúde';
  if (/educacao|pedagogi|matematica|redacao|recreacao|crianca|inclus/.test(text)) return 'Educação';
  if (/marketing|comunic|instagram|redes|word|excel|digitacao|tecnolog|office/.test(text)) return 'Tecnologia e Comunicação';
  if (/venda|loja|varejo|corretor|atendimento/.test(text)) return 'Comércio e Vendas';
  if (/beleza|manicure|barbeiro|cilios|sobrancelha/.test(text)) return 'Beleza';
  if (/logistica|almox|estoque|fatur|finance|bancario/.test(text)) return 'Administração e Operações';
  return area || 'EAD';
}

function readSupabaseCourse(title) {
  const { url, key } = loadEnv();
  if (!url || !key) return null;
  const endpoint = new URL('/rest/v1/cursos', url);
  endpoint.searchParams.set('select', 'nome,area,descricao,ead_config');
  endpoint.searchParams.set('modalidade', 'eq.EAD');
  endpoint.searchParams.set('nome', `ilike.*${title}*`);

  return fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  })
    .then((response) => {
      if (!response.ok) return null;
      return response.json();
    })
    .then((rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows.find((row) => normalize(row.nome) === normalize(title)) || rows[0];
    })
    .catch(() => null);
}

function splitSentences(text = '') {
  return text
    .replace(/\s+/g, ' ')
    .split(/[.!?]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTopicText(topic) {
  return String(topic || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\W+|\W+$/g, '')
    .replace(/^bloco\s+\d+[:\-]?\s*/i, '')
    .replace(/^t[áa]tica:\s*/i, '')
    .trim();
}

function sentenceCase(text) {
  const base = String(text || '').trim();
  if (!base) return '';
  return base[0].toUpperCase() + base.slice(1);
}

function buildCourseAnchors(topics, title) {
  const resolvedTopics = topics.slice(0, 8);
  const fallbackTopicHints = [
    `Fundamentos de ${title}`,
    `Prática aplicada em ${title}`,
    `Fluxo de execução em ${title}`,
    `Registros e evidências em ${title}`,
    `Revisão e melhoria contínua em ${title}`,
  ];

  return resolvedTopics.length ? resolvedTopics : fallbackTopicHints;
}

function formatPracticeLine(topic, title) {
  const cleanTopic = normalizeTopicText(topic);
  const topicLower = cleanTopic.toLowerCase();
  const titleLower = String(title).toLowerCase();
  return `Situação prática de ${topicLower || `aplicação em ${titleLower}`}, com decisão, registro e revisão ao final.`;
}

function buildCommonErrorAndFix(topic, index) {
  const cleanTopic = normalizeTopicText(topic);
  const topicLower = cleanTopic.toLowerCase();
  const erro = `Erro recorrente em ${topicLower || 'uma etapa da rotina'}: avançar sem checar critérios, registro e validação mínima.`;
  const correcao = `Correção em ${topicLower || 'cada etapa'}: valide entrada/execução/saída, registre evidência e confirme o próximo passo com alguém responsável.`;
  return {
    erro: `${erro}`,
    correcao: `${correcao}`,
  };
}

function deriveFromResearchNotes(notes) {
  const safeText = Array.isArray(notes) && notes.length ? notes.join(' ') : String(notes || '');
  const summary = safeText
    .replace(/\s+/g, ' ')
    .trim();
  if (!summary) return '';
  return `${sentenceCase(summary.split('.').slice(0, 2).join('.').trim())}`;
}

async function fetchExternalSummary(title, cache) {
  const key = normalize(title);
  const cached = cache.external?.[key];
  if (cached?.summary && cached?.source === 'external') return cached;
  const endpoints = [
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(`curso ${title}`)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) continue;
      const json = await response.json();
      const summary = String(json?.extract || '').trim();
      if (!summary) continue;
      const result = {
        source: 'external',
        sourceUrl: json?.content_urls?.desktop?.page || json?.content_urls?.mobile?.page || '',
        summary,
        fetchedAt: new Date().toISOString(),
      };
      if (!cache.external) cache.external = {};
      cache.external[key] = result;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
      return result;
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeCourseValue(value) {
  if (!value && value !== 0) return '';
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.trim();
  return String(value);
}

function extractArrayLike(source, paths) {
  for (const path of paths) {
    let current = source;
    const parts = path.split('.');
    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        current = null;
        break;
      }
      current = current[part];
    }
    if (Array.isArray(current) && current.length) return current;
  }
  return [];
}

function buildProfile(course) {
  const normalizedTitle = normalize(course.title);
  const mergedTokens = new Set();
  (course.tags || []).forEach((tag) => mergedTokens.add(normalize(tag)));
  const titleTokens = normalizedTitle.split(' ').filter(Boolean);
  titleTokens.forEach((token) => mergedTokens.add(token));
  const normalizedArea = normalize(course.area);
  const merged = normalize(`${course.area} ${course.title} ${(course.tags || []).join(' ')}`);
  const mergedTokensFromText = new Set(merged.split(' ').filter(Boolean));

  let selected = null;
  for (const profile of normalizedTagProfiles) {
    const hasTag = profile.normalizedTags.some((tag) => {
      if (!tag) return false;
      if (tag.includes(' ')) {
        return merged.includes(` ${tag} `);
      }
      return mergedTokensFromText.has(tag) || mergedTokens.has(tag);
    });
    if (hasTag) {
      selected = profile;
      break;
    }
  }

  if (!selected && titleTokens.length) {
    const titleSignal = ` ${normalizedTitle} `;
    for (const profile of normalizedTagProfiles) {
      const hasTitleMatch = profile.normalizedTags.some((tag) => {
        if (!tag) return false;
        if (tag.includes(' ')) return titleSignal.includes(` ${tag} `);
        return titleSignal.includes(` ${tag} `);
      });
      if (hasTitleMatch) {
        selected = profile;
        break;
      }
    }
  }

  if (!selected && normalizedArea) {
    for (const profile of normalizedTagProfiles) {
      const hasAreaMatch = profile.normalizedTags.some((tag) => normalizedArea.includes(tag) || normalizedArea === tag);
      if (hasAreaMatch) {
        selected = profile;
        break;
      }
    }
  }

  if (!selected) {
    selected = {
      exemplos: [],
      erros: [],
      correcao: [],
    };
  }

  const profile = selected;
  const tagHint = [...mergedTokens]
    .filter((tag) => !['ead', 'curso', 'modulo', 'cursoe'].includes(tag))
    .slice(0, 2)
    .join(', ');

  if (tagHint && normalizedTitle.length > 0) {
    return { selected: profile, tagsList: [...mergedTokens], tagHint };
  }

  return { selected: profile, tagsList: [...mergedTokens] };
}

function buildKnowledgeFromDefinition(course, catalogEntry) {
  const { selected } = buildProfile(course);
  const topics = Array.isArray(course.lessonTopics) && course.lessonTopics.length
    ? course.lessonTopics
    : (selected?.topics?.length
      ? selected.topics
      : [
          'Fundamentos da área e terminologia profissional',
          'Rotina básica do dia a dia',
          'Conceitos de responsabilidade e comunicação',
          'Qualidade, registro e revisão',
          'Situações reais e tomada de decisão',
          'Encerramento seguro da rotina',
        ]);

  const researchText = deriveFromResearchNotes(course.researchNotes);
  const fallbackResearch = catalogEntry?.observacao || '';
  const apresentacaoTema = `${researchText || fallbackResearch ? `${researchText || fallbackResearch} ` : ''}No curso ${course.title}, você aprende a aplicar o tema com método, decisões objetivas e evidência prática do começo ao fim da rotina.`;
  const topicAnchors = buildCourseAnchors(topics.map((item) => normalizeTopicText(item)), course.title);
  const practicalExamples = topicAnchors.map((topic) => formatPracticeLine(topic, course.title));

  return {
    fonte: 'definition',
    area: normalizeArea(course.area),
    apresentacaoTema,
    blocos: topicAnchors.map((topic, index) => ({
      titulo: `Bloco ${index + 1}: ${topic}`,
      aplicacao: `Você estuda ${topic.toLowerCase()} no contexto real de ${course.title}, com foco na decisão segura e comunicação profissional.`,
      exemplo: `Aplicação típica: identificar risco, agir com procedimento e registrar evidência da etapa. ${formatPracticeLine(topic, course.title)}`,
      pergunta: `Como você validaria o resultado desta etapa sem perder segurança?`,
    })),
    exemplosPraticos: Array.from(
      new Set([
        ...practicalExamples,
        `Checklist objetivo de decisão em ${course.title}.`,
        `Registro curto de evidência para revisão em ${course.title}.`,
      ]),
    ).slice(0, 8),
    errosComuns: topicAnchors.slice(0, 6).map((topic, index) => buildCommonErrorAndFix(topic, index).erro),
    correcoes: topicAnchors.slice(0, 6).map((topic, index) => buildCommonErrorAndFix(topic, index).correcao),
    encerramento: genericClosingTemplates.prova,
  };
}

function buildKnowledgeFromCatalog(title, catalogEntry) {
  const area = catalogEntry?.area ? normalizeArea(catalogEntry.area) : 'EAD';
  const profileTopics = [
    `Visão geral de ${title}`,
    `Procedimentos fundamentais de ${title}`,
    `Erros frequentes em ${title}`,
    `Prevenção e resposta em ${title}`,
    `Aplicação prática de ${title}`,
    `Revisão e melhoria em ${title}`,
  ];
  const base = catalogEntry?.observacao || `Neste curso de ${title}, a progressão é construída para ligar teoria e prática com consistência.`;
  const topics = profileTopics;

  return {
    fonte: 'catalog',
    area,
    apresentacaoTema: `${base} A estrutura foi pensada para uso em contexto profissional.`,
    blocos: topics.map((topic, index) => ({
      titulo: `Bloco ${index + 1}: ${topic}`,
      aplicacao: `No curso ${title}, este bloco organiza a prática para reduzir falha e aumentar segurança.`,
      exemplo: formatPracticeLine(topic, title),
      pergunta: 'Qual informação precisa estar registrada para validar esta etapa?',
    })),
    exemplosPraticos: topics.map((topic) => formatPracticeLine(topic, title)).slice(0, 8),
    errosComuns: topics.length
      ? topics.slice(0, 6).map((topic, index) => buildCommonErrorAndFix(topic, index).erro)
      : [
      'Confundir teoria com execução sem validação.',
      'Pular controle básico do início ao fim.',
      'Encerrar etapa sem revisar a evidência.',
      ],
    correcoes: topics.length
      ? topics.slice(0, 6).map((topic, index) => buildCommonErrorAndFix(topic, index + 1).correcao)
      : [
      'Aplicar checklist simples',
      'Registrar cada decisão tomada',
      'Revisar e fechar com evidência',
      ],
    encerramento: genericClosingTemplates.prova,
  };
}

function buildKnowledgeFromSupabase(course, title, catalogArea) {
  const config = course?.ead_config || {};
  const area = normalizeArea(course.area || catalogArea || config?.area || 'EAD');
  const temas = extractArrayLike(config, [
    'conteudos',
    'modulos',
    'modulosAula',
    'topicos',
    'topicosAula',
    'aulas',
    'ementa',
    'curriculo',
  ]).map((item) => item.titulo || item.title || item.nome || item.topico || item).filter(Boolean);

  const atividades = extractArrayLike(config, ['atividades', 'exercicios', 'tarefas', 'acoes'])
    .map((item) => item.titulo || item.enunciado || item.item || item)
    .filter(Boolean);

  const erros = extractArrayLike(config, ['errosComuns', 'erros', 'falhasComuns']).map((item) => String(item).trim()).filter(Boolean);
  const correcao = extractArrayLike(config, ['correcoes', 'correcao', 'boasPraticas']).map((item) => String(item).trim()).filter(Boolean);

  const presentation = config?.apresentacao
    || config?.pagina?.subtitulo
    || course.descricao
    || `No curso ${title}, cada aula foi desenhada para transformar teoria em decisão operacional.`;

  const topicBase = temas.length
    ? temas
    : [
        'Fundamentos técnicos',
        'Fluxo operacional da função',
        'Registro e comunicação',
        'Atuação segura em cenários reais',
        'Padronização de evidências',
        'Revisão e fechamento',
      ];

  return {
    fonte: 'database',
    area,
    apresentacaoTema: `${presentation}`,
    blocos: topicBase.slice(0, 8).map((topic, index) => ({
      titulo: `Bloco ${index + 1}: ${topic}`,
      aplicacao: `Você aplica ${topic.toLowerCase()} no contexto real de ${title}, com decisão e padronização.`,
      exemplo: (atividades[index] || `${topic.toLowerCase()} em rotina profissional.`),
      pergunta: `Qual registro comprova que esta etapa foi realizada corretamente?`,
    })),
    exemplosPraticos: atividades.length
      ? atividades.slice(0, 8).map((item) => String(item))
      : [`Planejamento e execução de atividades práticas em ${title}.`],
    errosComuns: erros.length ? erros : [
      'Pular etapa de validação antes da execução.',
      'Não documentar a decisão tomada.',
      'Deixar lacunas no protocolo de ação.',
    ],
    correcoes: correcao.length ? correcao : [
      'Adicionar validação prévia com critérios claros.',
      'Registrar evidência objetiva por etapa.',
      'Encerrar com revisão e encaminhamento.',
    ],
    encerramento: genericClosingTemplates.prova,
  };
}

function buildKnowledgeFromExternal(title, external, catalogArea) {
  const sentences = splitSentences(external?.summary || '').slice(0, 8);
  const area = normalizeArea(catalogArea);
  const topicSeed = sentences.length ? sentences : [
    `Objetivos e contexto do curso ${title}`,
    'Atividade prática orientada',
    'Boas práticas de segurança e organização',
    'Aplicação gradual em cenários reais',
    'Revisão e preparação para avaliação',
  ];

  return {
    fonte: 'external',
    area,
    apresentacaoTema: `${sentences[0] || `O curso ${title} tem aplicação profissional real.`} Este material organiza esse conhecimento em prática didática e auditável.`,
    blocos: topicSeed.slice(0, 6).map((topic, index) => ({
      titulo: `Bloco ${index + 1}: ${topic}`,
      aplicacao: `Aplique esta etapa em ${title} com decisão, comunicação e evidência.`,
      exemplo: formatPracticeLine(topic, title),
      pergunta: `Qual seria seu primeiro passo profissional em ${title}?`,
    })),
    exemplosPraticos: topicSeed.slice(0, 8).map((topic) => formatPracticeLine(topic, title)),
    errosComuns: topicSeed.length
      ? topicSeed.slice(0, 6).map((topic, index) => buildCommonErrorAndFix(topic, index).erro)
      : ['Informação genérica sem evidência.', 'Etapa incompleta.', 'Ausência de revisão.'],
    correcoes: topicSeed.length
      ? topicSeed.slice(0, 6).map((topic, index) => buildCommonErrorAndFix(topic, index + 1).correcao)
      : ['Definir critérios objetivos.', 'Registrar contexto e resultado.', 'Rever antes de encerrar.'],
    encerramento: external.sourceUrl ? `Referência: ${external.sourceUrl}. ${genericClosingTemplates.prova}` : genericClosingTemplates.prova,
  };
}

async function resolveCourseKnowledge(title, areaHint, definitionMap, catalogMap, cache) {
  const normalized = normalize(title);
  const candidate = definitionMap.get(normalized);
  const catalogEntry = catalogMap.get(normalized);
  const areaHintNormalized = areaHint || candidate?.area || catalogEntry?.area || 'EAD';

  const supabaseCourse = await readSupabaseCourse(title);
  if (supabaseCourse?.ead_config) {
    return {
      title,
      source: 'database',
      ...buildKnowledgeFromSupabase(supabaseCourse, title, areaHintNormalized),
      sourceUrl: '',
    };
  }

  if (candidate) {
    return {
      title,
      source: 'definition',
      ...buildKnowledgeFromDefinition(candidate, catalogEntry),
      sourceUrl: '',
    };
  }

  if (catalogEntry) {
    return {
      title,
      source: 'catalog',
      ...buildKnowledgeFromCatalog(title, catalogEntry),
      sourceUrl: '',
    };
  }

  const external = await fetchExternalSummary(title, cache);
  if (external?.summary) {
    return {
      title,
      source: 'external',
      sourceUrl: external.sourceUrl || '',
      ...buildKnowledgeFromExternal(title, external, areaHintNormalized),
    };
  }

  return null;
}

function buildRoteiro(knowledge) {
  const blocos = Array.isArray(knowledge.blocos) ? knowledge.blocos : [];
  const lines = [];

  lines.push('# ROTEIRO DE INTRODUÇÃO DIDÁTICA');
  lines.push(`# Curso: ${knowledge.title}`);
  lines.push(`# Área do curso: ${knowledge.area}`);
  lines.push('# Objetivo: roteiro prático, progressivo e aplicado para o começo da trilha EAD');
  lines.push('');

  lines.push('## APRESENTAÇÃO DA UNIVERSO CURSOS E CONSULTORIA');
  lines.push('Bem-vindo à Universo Cursos e Consultoria.');
  lines.push('Você está em uma trajetória profissional: aprender com contexto real, com padrão de qualidade, documentação e progresso contínuo.');
  lines.push(`Este roteiro foi elaborado para o curso **${knowledge.title}**, dentro de ${knowledge.area}.`);
  lines.push('');

  lines.push('## O QUE É ESTE TEMA DO CURSO E PARA QUE SERVE');
  lines.push(knowledge.apresentacaoTema);
  lines.push('');

  lines.push('## PROGRESSÃO DIDÁTICA DO CURSO');
  lines.push('A seguir, seguimos em blocos práticos para transformar teoria em ação com segurança e clareza.');
  lines.push('');

  for (const bloco of blocos.slice(0, 8)) {
    lines.push(`## ${bloco.titulo}`);
    lines.push(`Foco: ${bloco.aplicacao}`);
    lines.push('');
    lines.push(`Exemplo prático no curso ${knowledge.title}: ${bloco.exemplo}`);
    lines.push(`Pergunta de validação: ${bloco.pergunta}`);
    lines.push('');
  }

  if (blocos.length < 6) {
    for (let i = blocos.length + 1; i <= 6; i += 1) {
      lines.push(`## Bloco ${i}: Consolidação do método`);
      lines.push(`Foco: consolidar rotina e registros no tema ${knowledge.title}.`);
      lines.push(`Exemplo prático: simulação curta com decisão e evidência no curso ${knowledge.title}.`);
      lines.push('Pergunta de validação: O que foi registrado e qual será o próximo passo imediato?');
      lines.push('');
    }
  }

  lines.push('## ERROS COMUNS');
  for (const erro of knowledge.errosComuns.slice(0, 6)) {
    lines.push(`- Erro: ${erro}`);
  }

  lines.push('');
  lines.push('## CORREÇÕES');
  for (const correcao of knowledge.correcoes.slice(0, 6)) {
    lines.push(`- Correção: ${correcao}`);
  }

  lines.push('');
  lines.push('## ESTUDO PRÁTICO, ATIVIDADES E PROVA');
  lines.push(genericClosingTemplates.atividades);
  for (const atividade of knowledge.exemplosPraticos.slice(0, 8)) {
    lines.push(`- ${atividade}`);
  }
  lines.push('');
  lines.push(genericClosingTemplates.agradecimento(knowledge.title));
  lines.push('Faça 3 repetições de cada bloco e registre dúvidas no fim de cada estudo.');
  lines.push('Em seguida, avance para a seção de atividades e faça uma revisão antes de iniciar a prova.');
  lines.push('A prova verifica se a aplicação prática está consistente, objetiva e aplicável.');
  lines.push('');

  if (knowledge.sourceUrl) {
    lines.push(`Referência usada na montagem: ${knowledge.sourceUrl}`);
    lines.push('');
  }

  lines.push(`Fonte de origem do roteiro: ${SOURCE_LABELS[knowledge.source] || knowledge.source}.`);

  return `${lines.join('\n')}\n`;
}

function validateRoteiro(title, content) {
  const issues = [];
  const normalized = normalize(content);
  const normalizedTitle = normalize(title).split(' ');
  const strongTitleToken = normalizedTitle.filter((token) => token.length > 3);

  if (!/apresentacao da universo cursos e consultoria/.test(normalized)) {
    issues.push('Faltou seção de apresentação da Universo');
  }
  if (!/o que e este tema do curso e para que serve/.test(normalized)) {
    issues.push('Faltou seção "O que é este tema do curso e para que serve"');
  }
  const blocos = (content.match(/## bloco \d+:/gi) || []).length;
  if (blocos < 5) {
    issues.push('Menos de 5 blocos de progressão');
  }
  if (!/atividades|estudo pratico/i.test(content) || !/prova/i.test(content)) {
    issues.push('Faltou fechamento com atividades e prova');
  }

  const hasTitle = strongTitleToken.length === 0 ? true : strongTitleToken.some((token) => normalized.includes(token));
  if (!hasTitle) {
    issues.push('Texto não evidencia termo forte do curso');
  }

  return issues;
}

function extractTitleFromFile(filePath) {
  const content = readTextSafe(filePath);
  const headerLine = content.split('\n').find((line) => /^#\s*Curso:/i.test(line));
  if (headerLine) return headerLine.replace(/^#\s*Curso:\s*/i, '').trim();

  const fileName = path.basename(filePath, '.md').replace(/^roteiro_intro_/, '').replace(/-/g, ' ');
  return titleCase(fileName);
}

function extractAreaHint(filePath, title) {
  const content = readTextSafe(filePath);
  const areaLine = content.split('\n').find((line) => /^#\s*Area do curso:/i.test(line));
  if (areaLine) return areaLine.replace(/^#\s*Area do curso:\s*/i, '').trim();
  return title.includes('Educação') ? 'Educação' : 'EAD';
}

function listFiles() {
  return fs
    .readdirSync(TARGET_DIR)
    .filter((name) => name.endsWith('.md') && name !== SKIP_FILE)
    .map((name) => path.join(TARGET_DIR, name))
    .sort();
}

async function main() {
  if (!fs.existsSync(TARGET_DIR)) {
    throw new Error(`Diretório não encontrado: ${TARGET_DIR}`);
  }

  const { courseMap: definitionMap, sourceNotes } = parseImportDefinitions();
  const catalogMap = parseCatalog();
  const cache = readJsonSafe(CACHE_PATH) || {};
  if (!cache.general) cache.general = {};
  if (!cache.external) cache.external = {};
  cache.general.sourceNotesUsed = !!sourceNotes;
  cache.general.lastRun = new Date().toISOString();

  const files = listFiles();
  const expectedCount = files.length;
  if (expectedCount !== 57) {
    console.log(`ATENÇÃO: esperado 57 arquivos de lote; encontrados ${expectedCount}.`);
  }

  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  const logs = [];

  for (const file of files) {
    const title = extractTitleFromFile(file);
    const areaHint = extractAreaHint(file, title);
    const knowledge = await resolveCourseKnowledge(title, areaHint, definitionMap, catalogMap, cache.external || {});

    if (!knowledge) {
      skipped += 1;
      const warn = `Sem fonte local para o curso "${title}" (${path.basename(file)}).`;
      logs.push(`SKIP: ${warn}`);
      if (!forceRebuild) {
        continue;
      }

      const forced = buildKnowledgeFromCatalog(title, { area: areaHint, observacao: '' });
      const generated = buildRoteiro({
        title,
        source: 'forced',
        ...forced,
      });
      const issues = validateRoteiro(title, generated);
      if (issues.length > 0) {
        invalid += 1;
        logs.push(`INVALIDO forçado (fallback): ${title} -> ${issues.join(' | ')}`);
      }
      writeIfNeeded(file, generated);
      cache.general.ultimaReescrita = new Date().toISOString();
      updated += 1;
      continue;
    }

    const generated = buildRoteiro(knowledge);
    const issues = validateRoteiro(title, generated);
    if (issues.length > 0) {
      invalid += 1;
      logs.push(`INVALIDO: ${title} -> ${issues.join(' | ')}`);
      continue;
    }

    writeIfNeeded(file, generated);
    updated += 1;
    cache.general[normalize(title)] = {
      source: knowledge.source,
      area: knowledge.area,
      generatedAt: new Date().toISOString(),
      sourceUrl: knowledge.sourceUrl || '',
    };
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

  console.log(`Arquivos esperados no lote: ${expectedCount}`);
  console.log(`Gerados/reescritos: ${updated}`);
  console.log(`Pulados (sem fonte): ${skipped}`);
  console.log(`Inválidos por validação: ${invalid}`);
  if (isDryRun) {
    console.log('Modo dry-run: sem gravação. Execute com --write para persistir.');
  }
  console.log('----------------------------------------');
  if (updated + skipped + invalid !== expectedCount) {
    console.log('ATENÇÃO: total de processamento não bate com lote esperado.');
  }
  if (logs.length > 0) {
    console.log('Relatório parcial:');
    logs.slice(0, 30).forEach((log) => console.log(`- ${log}`));
    if (logs.length > 30) {
      console.log(`... e mais ${logs.length - 30} itens.`);
    }
  }
}

await main();
