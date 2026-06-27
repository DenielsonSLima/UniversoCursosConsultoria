import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AcademicMovementType, academicLifecycleService } from '../academic-lifecycle.service';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { turmaAsaasService } from '../turma-asaas.service';

export interface EnrollInput {
  alunoId: string;
  valorMatricula: number;
  valorParcela: number;
  valorRematricula: number;
  dataVencimentoMatricula: string;
  diaVencimento: number;
}

export interface MovementInput {
  matriculaId: string;
  tipo: AcademicMovementType;
  motivo: string;
  observacao?: string;
  dataRetornoPrevista?: string;
}

export interface TransferInput {
  matriculaId: string;
  tipo: 'INTERNA_TURMA' | 'INTERNA_POLO' | 'EXTERNA_ENVIADA';
  motivo: string;
  turmaDestinoId?: string;
  instituicaoDestino?: string;
  observacao?: string;
}

export const useTurmaAcademicInvalidation = (turmaId: string) => {
  const queryClient = useQueryClient();

  return useCallback(async (extraTurmaId?: string) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: ['gestao-kpis'] }),
      queryClient.invalidateQueries({ queryKey: ['diario-alunos', turmaId] }),
      queryClient.invalidateQueries({ queryKey: ['turma-financeiro', turmaId] }),
      queryClient.invalidateQueries({ queryKey: ['financeiro-tecnico-recebiveis'] }),
      queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] }),
    ];

    if (extraTurmaId) {
      invalidations.push(queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(extraTurmaId) }));
    }

    await Promise.all(invalidations);
  }, [queryClient, turmaId]);
};

export const useEnrollStudentMutation = (
  turmaId: string,
  responsavelId: string | null,
  onSuccess: (result: Awaited<ReturnType<typeof turmaAsaasService.matricularAlunoComCobranca>>) => void | Promise<void>,
  onError: (error: any) => void,
) => useMutation({
  mutationFn: (input: EnrollInput) => turmaAsaasService.matricularAlunoComCobranca({
    turmaId,
    responsavelId,
    ...input,
  }),
  onSuccess,
  onError,
});

export const useMovementMutation = (
  responsavelId: string | null,
  onSuccess: () => void | Promise<void>,
  onError: (error: any) => void,
) => useMutation({
  mutationFn: (input: MovementInput) => academicLifecycleService.movimentar({
    matriculaId: input.matriculaId,
    tipo: input.tipo,
    motivo: input.motivo,
    observacao: input.observacao,
    dataRetornoPrevista: input.dataRetornoPrevista,
    responsavelId,
  }),
  onSuccess,
  onError,
});

export const useTransferMutation = (
  responsavelId: string | null,
  onSuccess: (result: any, input: TransferInput) => void | Promise<void>,
  onError: (error: any) => void,
) => useMutation({
  mutationFn: (input: TransferInput) => academicLifecycleService.transferir({
    matriculaId: input.matriculaId,
    tipo: input.tipo,
    motivo: input.motivo,
    turmaDestinoId: input.tipo === 'EXTERNA_ENVIADA' ? undefined : input.turmaDestinoId,
    instituicaoDestino: input.tipo === 'EXTERNA_ENVIADA' ? input.instituicaoDestino : undefined,
    observacao: input.observacao,
    responsavelId,
  }),
  onSuccess,
  onError,
});
