import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const COURSE_NAMES = [
  'Almoxarifado',
  'Almoxerifado',
  'Almoxerifo',
];
const VIDEO_URL = 'https://vimeo.com/1204873679?fl=ip&fe=ec';

const ALMOXERIFADO_ACTIVITIES = [
  {
    id: 'atividade-1',
    etapaId: 'aula-1',
    titulo: 'Atividade 1: Diagnóstico de rotina no almoxarifado',
    enunciado: 'Ao organizar a rotina de almoxarifado, qual ação inicial é mais correta?',
    tipo: 'multipla_escolha',
    opcoes: [
      'Mapear processos, priorizar riscos e definir padrão de recebimento, conferência e registro.',
      'Aguardar o volume diário diminuir para começar os controles.',
      'Executar apenas conferência visual sem documentos.',
      'Registrar tudo ao final do mês sem conferência por etapa.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'atividade-2',
    etapaId: 'aula-2',
    titulo: 'Atividade 2: Conferência de recebimento',
    enunciado: 'Qual procedimento reduz falha de lote/validade no recebimento?',
    tipo: 'multipla_escolha',
    opcoes: [
      'Conferir nota, lote, validade, quantidade e registrar divergência imediata.',
      'Conferir somente quantidade para ganhar tempo.',
      'Aceitar o material e ajustar divergências depois do inventário.',
      'Registrar divergência apenas se o fornecedor reclamar.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'atividade-3',
    etapaId: 'aula-3',
    titulo: 'Atividade 3: Organização física e rastreabilidade',
    enunciado: 'Entre as práticas abaixo, qual fortalece a rastreabilidade?',
    tipo: 'multipla_escolha',
    opcoes: [
      'Endereçamento padronizado, identificação por lote e atualização de movimentações.',
      'Armazenar materiais por aparência do produto sem padrão.',
      'Reposição sem registrar saída/entrada por urgência.',
      'Evitar inventário para manter estoque “tranquilo”.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'atividade-4',
    etapaId: 'aula-4',
    titulo: 'Atividade 4: Ações corretivas em divergência',
    enunciado: 'Ao identificar divergência de estoque, qual ação é mais adequada?',
    tipo: 'multipla_escolha',
    opcoes: [
      'Registrar ocorrência, quantificar impacto e acionar responsável para investigação.',
      'Ocultar a divergência para evitar retrabalho imediato.',
      'Reajustar o sistema sem validação de suporte.',
      'Esperar nova contagem e não comunicar ninguém.',
    ],
    respostaCorreta: 0,
  },
];

const ALMOXERIFADO_QUESTIONS = [
  {
    id: 'q-1',
    pergunta: 'Qual prática inicial reduz falhas no recebimento?',
    opcoes: [
      'Conferir documento, quantidade, lote, validade e registrar divergências no ato.',
      'Conferir somente ao final da semana.',
      'Aceitar o lote e ajustar o sistema depois.',
      'Conferir apenas embalagem sem abrir para inspeção.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-2',
    pergunta: 'A curva ABC no controle de estoque é usada para:',
    opcoes: [
      'Priorizar itens conforme valor/criticidade e impacto de reposição.',
      'Substituir inventário físico por completo.',
      'Definir somente a temperatura ideal da armazenagem.',
      'Organizar a agenda da equipe de compras.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-3',
    pergunta: 'Em estoque, FIFO e FEFO significam:',
    opcoes: [
      'First In, First Out e First Expire, First Out.',
      'Full In, First Out e Fast Entry, First Out.',
      'First Item, First Order e Full Entry, Full Order.',
      'Fácil Implantação, Fácil Operação e Fiscalização.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-4',
    pergunta: 'Um item com validade próxima vence e possui risco de ruptura de linha. A atitude correta é:',
    opcoes: [
      'Priorizar giro e separação conforme validade e registrar movimento com justificativa.',
      'Deixar em estoque até novo lote para evitar desperdício.',
      'Descartar sem registro para não impactar sistema.',
      'Negar retirada para evitar controle.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-5',
    pergunta: 'Quando há divergência entre físico e sistema, o primeiro passo é:',
    opcoes: [
      'Registrar ocorrência, checar histórico e validar com responsável.',
      'Alterar o sistema para “zerar” a diferença.',
      'Esperar a próxima contagem sem acionar ninguém.',
      'Cobrar o fornecedor sem registrar evidência.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-6',
    pergunta: 'A comunicação em incidente de segurança de almoxarifado deve ser:',
    opcoes: [
      'Rápida, objetiva, registrada e com encaminhamento definido.',
      'Oral sem registro para evitar retrabalho.',
      'Apenas verbal no fim do turno.',
      'Restrita à equipe de compras.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-7',
    pergunta: 'No controle de documentos, o mais importante é:',
    opcoes: [
      'Rastreabilidade de origem, destino, responsável e data de movimentação.',
      'Armazenar documentos apenas em pasta pessoal.',
      'Salvar apenas recibos fiscais.',
      'Evitar documentação para não atrasar a operação.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-8',
    pergunta: 'Para reduzir perdas operacionais, o indicador mais útil em rotina de almoxarifado é:',
    opcoes: [
      'Giro de estoque, acurácia e taxa de divergência.',
      'Somente volume de compras.',
      'Apenas horas de atendimento por setor.',
      'Somente volume de e-mails enviados.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-9',
    pergunta: 'No dia a dia, a prioridade de armazenamento por risco e acesso deve considerar:',
    opcoes: [
      'Criticidade, rotatividade e segurança de cada item.',
      'Preferência pessoal do operador.',
      'Ordem alfabética do nome do produto apenas.',
      'Somente o maior volume físico.',
    ],
    respostaCorreta: 0,
  },
  {
    id: 'q-10',
    pergunta: 'Qual atitude melhora a consistência do inventário?',
    opcoes: [
      'Inventários cíclicos, conferências por rotina e análise de divergências.',
      'Conferência única anual sem auditoria.',
      'Registrar contagem estimada sem validação.',
      'Suspender entrada para evitar movimentações.',
    ],
    respostaCorreta: 0,
  },
];

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

function normalizeCourse(course) {
  const config = course?.ead_config || {};
  const next = { ...config };

  const conteudos = Array.isArray(next.conteudos) ? [...next.conteudos] : [];
  if (conteudos.length > 0) {
    const introIndex = conteudos.findIndex((item) => item?.id === 'aula-1');
    const targetIndex = introIndex >= 0 ? introIndex : 0;
    const current = conteudos[targetIndex] || {};
    conteudos[targetIndex] = {
      ...current,
      videoUrl: VIDEO_URL,
    };
  }
  next.conteudos = conteudos;

  next.atividades = ALMOXERIFADO_ACTIVITIES.map((atividade) => ({ ...atividade }));

  const defaultProva = {
    id: 'prova-final',
    titulo: 'Prova Final - Almoxarifado',
    notaMinima: 70,
    tempoMinutos: 60,
    questoes: ALMOXERIFADO_QUESTIONS.map((q) => ({
      ...q,
      explicacao:
        'A alternativa correta prioriza controle, segurança, rastreabilidade e procedimento correto de operação de almoxarifado.',
    })),
  };

  next.provas = [
    {
      ...(Array.isArray(next.provas) && next.provas[0] ? next.provas[0] : {}),
      ...defaultProva,
    },
  ];

  return next;
}

async function main() {
  const { baseUrl, apiKey } = readEnv();
  if (!baseUrl || !apiKey) {
    throw new Error('Configuração de ambiente incompleta. Defina a URL e a chave Supabase no .env.local/.env.');
  }

  const nameFilter = COURSE_NAMES.map((name) => `nome.ilike.*${name}*`).join(',');
  const courses = await restRequest(
    baseUrl,
    apiKey,
    `/rest/v1/cursos?modalidade=eq.EAD&or=(${nameFilter})&select=id,nome,ead_config`,
  );

  if (!Array.isArray(courses) || courses.length === 0) {
    console.log('Nenhum curso encontrado com nome semelhante a Almoxarifado.');
    return;
  }

  for (const course of courses) {
    const nextConfig = normalizeCourse(course);
    await restRequest(
      baseUrl,
      apiKey,
      `/rest/v1/cursos?id=eq.${course.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ ead_config: nextConfig }),
      },
    );

    console.log(`Atualizado: ${course.nome} (${course.id})`);
  }

  console.log('Concluído.');
}

await main();
