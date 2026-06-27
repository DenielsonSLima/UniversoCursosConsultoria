import { useQuery } from '@tanstack/react-query';
import { eadTurmaKeys } from '../ead-turma.keys';
import { eadTurmaService } from '../ead-turma.service';

export const useTurmaEadResumo = (turmaId: string) => useQuery({
  queryKey: eadTurmaKeys.resumo(turmaId),
  queryFn: () => eadTurmaService.getResumo(turmaId),
});

export const useTurmaEadAlunos = (turmaId: string) => useQuery({
  queryKey: eadTurmaKeys.alunos(turmaId),
  queryFn: () => eadTurmaService.getAlunos(turmaId),
});

export const useTurmaEadAlunosDisponiveis = (
  turmaId: string,
  search: string,
  enabled: boolean,
) => useQuery({
  queryKey: eadTurmaKeys.alunosDisponiveis(turmaId, search),
  queryFn: () => eadTurmaService.getAlunosDisponiveis(turmaId, search),
  enabled,
});

export const useTurmaEadPagamentos = (turmaId: string) => useQuery({
  queryKey: eadTurmaKeys.pagamentos(turmaId),
  queryFn: () => eadTurmaService.getPagamentos(turmaId),
});
