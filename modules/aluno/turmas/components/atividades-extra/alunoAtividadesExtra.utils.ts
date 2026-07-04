import {
  AtividadeExtraClasse,
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
  pergunta: { pergunta?: string } | string,
  index: number,
) => (typeof pergunta === 'string' ? pergunta : pergunta?.pergunta || `Pergunta ${index + 1}`);

export const normalizeAlunoAtividadeSubmitError = (err: unknown) => {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('corrigida') || message.includes('Preencha')) return message;
  return 'Não consegui enviar essa atividade agora. Revise sua resposta e tente novamente.';
};
