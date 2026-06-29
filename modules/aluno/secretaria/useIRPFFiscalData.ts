import { useQuery } from '@tanstack/react-query';
import { alunoSecretariaKeys, alunoSecretariaService } from './secretaria-aluno.service';
import { AlunoSecretariaIrpfPagamento } from './secretaria-aluno.types';

export const useIRPFFiscalData = (
  alunoId: string,
  ano: number,
  turmaId?: string | null,
  enabled = true,
) => useQuery<AlunoSecretariaIrpfPagamento[]>({
  queryKey: [...alunoSecretariaKeys.aluno(alunoId), 'irpf', ano, turmaId || null],
  queryFn: () => alunoSecretariaService.getPagamentosIrpf(alunoId, String(ano), turmaId),
  enabled,
});
