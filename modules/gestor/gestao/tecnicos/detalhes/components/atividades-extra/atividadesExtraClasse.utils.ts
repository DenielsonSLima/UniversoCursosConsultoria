export const createAtividadeFormInitialState = (disciplinaId = '') => ({
  disciplinaId,
  titulo: '',
  tema: '',
  horas: '',
  prazoEntrega: '',
  texto: '',
  videoUrl: '',
  perguntas: '',
});

export const formatAtividadeDate = (value?: string | null) => {
  if (!value) return 'Prazo não definido';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Prazo não definido';
  return date.toLocaleDateString('pt-BR');
};

export const formatAtividadeHoras = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0';
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
};

export const parsePerguntas = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((pergunta) => ({ pergunta }));

export const getRespostaAnswers = (resposta: any) => {
  const answers = resposta?.respostas;
  return Array.isArray(answers) ? answers : [];
};

export const normalizeAtividadeErrorMessage = (message: string) =>
  message
    .replace('Carga horaria', 'Carga horária')
    .replace('carga horaria', 'carga horária')
    .replace('titulo', 'título');
