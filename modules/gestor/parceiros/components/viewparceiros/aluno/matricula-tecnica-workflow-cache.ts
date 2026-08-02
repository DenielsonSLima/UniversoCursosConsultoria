import type { QueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../../../gestao/tecnicos/detalhes/academic-lifecycle.keys';
import type { MatriculaTecnicaPendenteDocumento } from '../../../documentos-aluno.service';
import { matriculaTecnicaWorkflowKeys } from '../../../../../shared/documentos-aluno/documentos-aluno.query-keys';

export const reconcileMatriculaTecnicaWorkflowCache = async (
  queryClient: QueryClient,
  alunoId: string,
  snapshot: MatriculaTecnicaPendenteDocumento,
) => {
  queryClient.setQueryData<MatriculaTecnicaPendenteDocumento[]>(
    matriculaTecnicaWorkflowKeys.aluno(alunoId),
    (current = []) => {
      const exists = current.some(
        (candidate) => candidate.matriculaId === snapshot.matriculaId,
      );
      return exists
        ? current.map((candidate) =>
          candidate.matriculaId === snapshot.matriculaId
            ? snapshot
            : candidate)
        : [snapshot, ...current];
    },
  );

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: matriculaTecnicaWorkflowKeys.aluno(alunoId),
    }),
    queryClient.invalidateQueries({
      queryKey: matriculaTecnicaWorkflowKeys.matricula(snapshot.matriculaId),
    }),
    queryClient.invalidateQueries({
      queryKey: ['parceiro', alunoId, 'matriculas'],
    }),
    queryClient.invalidateQueries({
      queryKey: ['parceiro', alunoId, 'matricula-atual'],
    }),
    queryClient.invalidateQueries({ queryKey: ['matriculas', alunoId] }),
    queryClient.invalidateQueries({
      queryKey: ['diario-alunos', snapshot.turmaId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['diario-notas-resultados', snapshot.turmaId],
    }),
    queryClient.invalidateQueries({
      queryKey: academicLifecycleKeys.turma(snapshot.turmaId),
    }),
  ]);
};
