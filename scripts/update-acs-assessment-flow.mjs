import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const COURSE_NAME = 'Agente Comunitário de Saúde';

const ACS_FINAL_QUESTIONS = [
  {
    id: 'acs-final-q1',
    pergunta: 'Na atuação do Agente Comunitário de Saúde, qual é a principal função da territorialização?',
    opcoes: [
      'Conhecer famílias, riscos e recursos do território para orientar prioridades de cuidado.',
      'Substituir o atendimento clínico realizado na unidade de saúde.',
      'Organizar apenas a agenda interna da equipe administrativa.',
      'Definir diagnóstico médico durante a visita domiciliar.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q2',
    pergunta: 'Durante uma visita domiciliar, o ACS identifica uma gestante com dor de cabeça intensa e inchaço importante. Qual conduta é mais adequada?',
    opcoes: [
      'Registrar a situação, orientar a família e comunicar a equipe para avaliação prioritária.',
      'Aguardar a próxima visita de rotina para verificar se os sintomas continuam.',
      'Prescrever medicamento para alívio imediato dos sintomas.',
      'Informar que esses sinais são sempre normais no final da gestação.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q3',
    pergunta: 'O que diferencia promoção da saúde de prevenção de doenças no trabalho comunitário?',
    opcoes: [
      'Promoção fortalece condições de vida; prevenção reduz riscos e evita agravos.',
      'Promoção é feita somente por médicos; prevenção é feita somente por ACS.',
      'Promoção acontece apenas no hospital; prevenção acontece apenas em escolas.',
      'Promoção e prevenção são termos sem diferença prática.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q4',
    pergunta: 'Ao lidar com informação sensível de uma família, qual atitude preserva o vínculo e a ética profissional?',
    opcoes: [
      'Manter sigilo e compartilhar com a equipe apenas quando necessário para o cuidado.',
      'Comentar com vizinhos próximos para buscar ajuda informal.',
      'Enviar a informação em grupos abertos da comunidade.',
      'Registrar apenas o que for conveniente para evitar encaminhamentos.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q5',
    pergunta: 'Qual informação torna um encaminhamento do ACS mais útil para a equipe da UBS?',
    opcoes: [
      'Usuário, motivo, sinais observados, orientação realizada e grau de urgência percebido.',
      'Opinião pessoal sobre a família sem descrever a situação observada.',
      'Apenas o endereço da residência, sem contexto de saúde.',
      'Relato genérico de que existe um problema no território.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q6',
    pergunta: 'Em uma campanha de vacinação com baixa adesão, qual ação do ACS ajuda a reduzir resistência da comunidade?',
    opcoes: [
      'Escutar dúvidas, orientar com linguagem simples e reforçar o fluxo correto da unidade.',
      'Criticar publicamente quem não compareceu à vacinação.',
      'Suspender visitas até que a comunidade procure espontaneamente a UBS.',
      'Garantir proteção absoluta sem explicar riscos, benefícios e orientações.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q7',
    pergunta: 'Qual situação exige comunicação rápida à equipe de saúde?',
    opcoes: [
      'Idoso com falta de ar, fraqueza súbita e piora importante do estado geral.',
      'Família que deseja confirmar o horário regular de funcionamento da unidade.',
      'Usuário que pede orientação sobre local de vacinação sem sintomas.',
      'Morador que pergunta sobre atualização de cadastro sem queixa de saúde.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q8',
    pergunta: 'Por que o registro correto é essencial no acompanhamento das famílias?',
    opcoes: [
      'Porque dá continuidade ao cuidado e permite que a equipe acompanhe evolução e prioridades.',
      'Porque substitui a necessidade de comunicação com a equipe.',
      'Porque serve apenas para comprovar presença do ACS no território.',
      'Porque deve conter somente informações positivas.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q9',
    pergunta: 'Qual postura fortalece o vínculo do ACS com a comunidade?',
    opcoes: [
      'Escuta respeitosa, linguagem acessível, presença regular e compromisso com o retorno.',
      'Prometer soluções imediatas para qualquer demanda apresentada.',
      'Evitar explicar limites de atuação para não gerar frustração.',
      'Atender somente famílias que procuram a UBS espontaneamente.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'acs-final-q10',
    pergunta: 'No trabalho da Estratégia Saúde da Família, como o ACS deve se posicionar diante de demandas complexas?',
    opcoes: [
      'Como elo entre território e equipe, observando, orientando, registrando e acompanhando fluxos.',
      'Como substituto da equipe multiprofissional em decisões clínicas.',
      'Como responsável por resolver sozinho todos os problemas sociais.',
      'Como agente que apenas entrega recados sem acompanhar continuidade.',
    ],
    respostaCorreta: 0,
  },
];

const ACS_AULA_5_ACTIVITY = {
  id: 'atividade-5',
  etapaId: 'aula-5',
  titulo: 'Atividade 5: Práticas, Estudos de Caso e Avaliação',
  enunciado: 'Em um estudo de caso, qual atitude demonstra melhor capacidade de decisão do ACS?',
  tipo: 'multipla_escolha',
  opcoes: [
    'Identificar sinais de risco, registrar o caso, orientar a família e acionar o fluxo da equipe.',
    'Resolver a situação sozinho para evitar demora no atendimento.',
    'Ignorar sinais de alerta quando a família parecer tranquila.',
    'Compartilhar o caso com pessoas da comunidade antes de comunicar a UBS.',
  ],
  respostaCorreta: 0,
};

function readEnv() {
  const env = {};
  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(process.cwd(), file);
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
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

function updateConfig(config) {
  const next = { ...(config || {}) };

  next.regras = {
    ...(next.regras || {}),
    intervaloReprovacaoHoras: 1,
  };

  const atividades = Array.isArray(next.atividades) ? [...next.atividades] : [];
  const activityIndex = atividades.findIndex((item) => item?.id === ACS_AULA_5_ACTIVITY.id || item?.etapaId === 'aula-5');
  if (activityIndex >= 0) {
    atividades[activityIndex] = { ...atividades[activityIndex], ...ACS_AULA_5_ACTIVITY };
  } else {
    atividades.push(ACS_AULA_5_ACTIVITY);
  }
  next.atividades = atividades;

  const provas = Array.isArray(next.provas) ? [...next.provas] : [];
  const firstProva = {
    ...(provas[0] || {}),
    id: provas[0]?.id || 'prova-final',
    titulo: provas[0]?.titulo || 'Prova Final - Agente Comunitário de Saúde',
    notaMinima: provas[0]?.notaMinima || 70,
    intervaloReprovacaoHoras: 1,
    questoes: ACS_FINAL_QUESTIONS,
  };
  provas[0] = firstProva;
  next.provas = provas;

  return next;
}

async function main() {
  const { baseUrl, apiKey } = readEnv();
  if (!baseUrl || !apiKey) {
    throw new Error('Configuração de ambiente incompleta. Defina a URL e a chave Supabase no .env.local/.env.');
  }

  const courses = await restRequest(
    baseUrl,
    apiKey,
    `/rest/v1/cursos?modalidade=eq.EAD&nome=eq.${encodeURIComponent(COURSE_NAME)}&select=id,nome,ead_config`,
  );

  if (!Array.isArray(courses) || courses.length === 0) {
    console.log('Nenhum curso encontrado com nome:', COURSE_NAME);
    return;
  }

  for (const course of courses) {
    const nextConfig = updateConfig(course.ead_config);

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
