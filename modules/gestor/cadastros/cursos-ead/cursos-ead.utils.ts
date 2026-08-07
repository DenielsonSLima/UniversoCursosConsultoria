import type { Curso, EadConfig } from '../cadastros.types';

const courseDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const coursePriceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatCursoEadUpdatedAt = (curso: Pick<Curso, 'updated_at' | 'created_at'>) => {
  const rawDate = curso.updated_at || curso.created_at;
  if (!rawDate) return 'Data não informada';

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : courseDateFormatter.format(date);
};

export const formatCursoEadPrice = (value?: number | null) => (
  value && value > 0 ? coursePriceFormatter.format(value) : 'Sem valor'
);

export const getCursoEadMetrics = (curso: Curso) => {
  const config: EadConfig = curso.ead_config || {
    cronograma: [],
    conteudos: [],
    provas: [],
    certificacao: { emitirAutomatico: true, minimoAproveitamento: 70 },
  };

  return {
    videoCount: config.videoUrl || config.conteudos?.some((content) => content.videoUrl) ? 1 : 0,
    questionsCount: config.provas?.reduce(
      (total, assessment) => total + (assessment.questoes?.length || 0),
      0,
    ) || 0,
  };
};
