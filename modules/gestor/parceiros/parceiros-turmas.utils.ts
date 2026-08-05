export type AlunoModalidadeFilter = 'EAD' | 'LIVRE' | 'ESPECIALIZACAO' | 'TECNICO';

export interface ParceirosTurmaOption {
  id: string;
  nome?: string;
  codigo?: string;
  cursoNome?: string;
  modalidade?: string;
}

const normalizeModalidade = (modalidade?: string) => (
  String(modalidade || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
);

export const filterTurmasByModalidades = (
  turmas: ParceirosTurmaOption[],
  modalidades: AlunoModalidadeFilter[],
) => {
  if (modalidades.length === 0) return turmas;

  const modalidadesSelecionadas = new Set(modalidades.map(normalizeModalidade));
  return turmas.filter((turma) => modalidadesSelecionadas.has(normalizeModalidade(turma.modalidade)));
};
