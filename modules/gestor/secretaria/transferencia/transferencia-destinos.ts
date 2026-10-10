import type { SecretariaTurmaResumo } from '../shared/secretaria-documentos.types';

export interface TransferenciaDestinoOption {
  id: string;
  nome: string;
  descricao: string;
  termos: string[];
}

const eligibleClasses = (turmas: SecretariaTurmaResumo[]) => turmas.filter((turma) => (
  turma.modalidade === 'TECNICO' && turma.status === 'EM_ANDAMENTO' && Boolean(turma.cursoId)
));

export const transferenciaCursoOptions = (turmas: SecretariaTurmaResumo[]): TransferenciaDestinoOption[] => {
  const courses = new Map<string, { nome: string; count: number }>();
  eligibleClasses(turmas).forEach((turma) => {
    const course = courses.get(turma.cursoId);
    courses.set(turma.cursoId, { nome: turma.cursoNome, count: (course?.count || 0) + 1 });
  });
  return [...courses].map(([id, course]) => ({
    id, nome: course.nome, descricao: `${course.count} ${course.count === 1 ? 'turma em andamento' : 'turmas em andamento'}`,
    termos: [course.nome],
  })).sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
};

export const transferenciaTurmasDoCurso = (turmas: SecretariaTurmaResumo[], courseId: string) => (
  courseId ? eligibleClasses(turmas).filter((turma) => turma.cursoId === courseId) : []
);

export const transferenciaTurmaOptions = (turmas: SecretariaTurmaResumo[]): TransferenciaDestinoOption[] => (
  turmas.map((turma) => ({
    id: turma.id, nome: turma.nome,
    descricao: [turma.codigo, turma.turno].filter(Boolean).join(' · '),
    termos: [turma.nome, turma.codigo, turma.turno, turma.cursoNome],
  }))
);
