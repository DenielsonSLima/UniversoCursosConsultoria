import {
  AtividadeExtraClasseResposta,
  AtividadeExtraClasse,
  AtividadePergunta,
} from './alunoAtividadesExtra.types';

export const alunoAtividadesExtraQueryKey = (turmaId: string, alunoId: string) =>
  ['aluno-turma-atividades-extra', turmaId, alunoId] as const;

export const formatAlunoAtividadeDate = (value?: string | null) => {
  if (!value) return 'Prazo não definido';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Prazo não definido';
  return date.toLocaleDateString('pt-BR');
};

export const formatAlunoAtividadeHoras = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toFixed(2).replace('.00', '').replace('.', ',');
};

export const getAtividadeRespostaAtual = (atividade: AtividadeExtraClasse) => {
  const respostas = Array.isArray(atividade?.respostas) ? atividade.respostas : [];
  return respostas[0] || null;
};

export const getPerguntaTexto = (
  pergunta: AtividadePergunta,
  index: number,
) => (typeof pergunta === 'string' ? pergunta : pergunta?.pergunta || `Pergunta ${index + 1}`);

const getLocalIsoDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isAlunoAtividadePrazoEncerrado = (
  prazoEntrega?: string | null,
  now = new Date(),
) => Boolean(prazoEntrega && /^\d{4}-\d{2}-\d{2}$/.test(prazoEntrega) && prazoEntrega < getLocalIsoDate(now));

export const isAlunoAtividadeEntregaAtrasada = (
  resposta: AtividadeExtraClasseResposta | null,
  prazoEntrega?: string | null,
) => {
  if (!resposta?.created_at || !prazoEntrega || !/^\d{4}-\d{2}-\d{2}$/.test(prazoEntrega)) return false;
  const createdAt = new Date(resposta.created_at);
  if (Number.isNaN(createdAt.getTime())) return false;
  return getLocalIsoDate(createdAt) > prazoEntrega;
};

export const normalizeAlunoAtividadeHttpUrl = (
  value: string | null | undefined,
  label: string,
  httpsOnly = false,
) => {
  const trimmed = value?.trim() || '';
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} precisa ser um endereço completo, começando com http:// ou https://.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} deve usar um endereço http:// ou https://.`);
  }
  if (httpsOnly && parsed.protocol !== 'https:') {
    throw new Error(`${label} deve começar com https://.`);
  }

  return parsed.toString();
};

export const getSafeAlunoAtividadeHttpUrl = (value?: string | null, httpsOnly = false) => {
  try {
    return normalizeAlunoAtividadeHttpUrl(value, 'O link', httpsOnly);
  } catch {
    return null;
  }
};

export const normalizeAlunoAtividadeSubmitError = (err: unknown) => {
  const message = err instanceof Error ? err.message : '';
  if (
    message.includes('corrigida')
    || message.includes('prazo')
    || message.includes('Preencha')
    || message.includes('Responda')
    || message.includes('Informe')
    || message.includes('endereço')
    || message.includes('https://')
  ) return message;
  return 'Não consegui enviar essa atividade agora. Revise sua resposta e tente novamente.';
};
