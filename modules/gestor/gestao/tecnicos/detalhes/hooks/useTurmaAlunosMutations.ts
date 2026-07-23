import { useCallback } from 'react';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { AcademicMovementType, academicLifecycleService } from '../academic-lifecycle.service';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { turmaAsaasService } from '../asaas';
import type { GatewayPaymentMethod } from '../../../../../asaas/asaas.service';
import { gestaoQueryKeys } from '../../../gestao.query-keys';

type MutationSuccess<TData, TVariables> = NonNullable<UseMutationOptions<TData, Error, TVariables>['onSuccess']>;
type MutationError<TVariables> = NonNullable<UseMutationOptions<unknown, Error, TVariables>['onError']>;

export interface EnrollInput {
  alunoId: string;
  valorMatricula: number;
  valorParcela: number;
  valorRematricula: number;
  descontoPontualidade: number;
  jurosAtraso: number;
  multaAtraso: number;
  dataVencimentoMatricula: string;
  diaVencimento: number;
  financeiro_herdado?: boolean;
  gerar_cobranca_inicial?: boolean;
  gerar_cobranca_futura?: boolean | null;
  sincronizar_asaas?: boolean | null;
  paymentMethod: GatewayPaymentMethod | null;
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

export interface ReturnInput {
  matriculaOrigemId: string;
  turmaDestinoId: string;
  motivo: string;
  observacao?: string;
}

export const useTurmaAcademicInvalidation = (turmaId: string) => {
  const queryClient = useQueryClient();

  return useCallback(async (extraTurmaId?: string) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.summaries() }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') }),
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
  onSuccess: MutationSuccess<Awaited<ReturnType<typeof turmaAsaasService.matricularAlunoComCobranca>>, EnrollInput>,
  onError: MutationError<EnrollInput>,
) => useMutation({
  mutationFn: (input: EnrollInput) => turmaAsaasService.matricularAlunoComCobranca({
    turmaId,
    ...input,
  }),
  onSuccess,
  onError,
});

export const useRemoveEnrollmentMutation = (
  onSuccess: MutationSuccess<Awaited<ReturnType<typeof academicLifecycleService.removerMatricula>>, string>,
  onError: MutationError<string>,
) => useMutation({
  mutationFn: (matriculaId: string) => academicLifecycleService.removerMatricula(matriculaId),
  onSuccess,
  onError,
});

export const useMovementMutation = (
  onSuccess: MutationSuccess<Awaited<ReturnType<typeof academicLifecycleService.movimentar>>, MovementInput>,
  onError: MutationError<MovementInput>,
) => useMutation({
  mutationFn: (input: MovementInput) => academicLifecycleService.movimentar({
    matriculaId: input.matriculaId,
    tipo: input.tipo,
    motivo: input.motivo,
    observacao: input.observacao,
    dataRetornoPrevista: input.dataRetornoPrevista,
  }),
  onSuccess,
  onError,
});

export const useTransferMutation = (
  onSuccess: MutationSuccess<Awaited<ReturnType<typeof academicLifecycleService.transferir>>, TransferInput>,
  onError: MutationError<TransferInput>,
) => useMutation({
  mutationFn: (input: TransferInput) => academicLifecycleService.transferir({
    matriculaId: input.matriculaId,
    tipo: input.tipo,
    motivo: input.motivo,
    turmaDestinoId: input.tipo === 'EXTERNA_ENVIADA' ? undefined : input.turmaDestinoId,
    instituicaoDestino: input.tipo === 'EXTERNA_ENVIADA' ? input.instituicaoDestino : undefined,
    observacao: input.observacao,
  }),
  onSuccess,
  onError,
});

export const useReturnEnrollmentMutation = (
  onSuccess: MutationSuccess<Awaited<ReturnType<typeof academicLifecycleService.retornarEmNovaTurma>>, ReturnInput>,
  onError: MutationError<ReturnInput>,
) => useMutation({
  mutationFn: (input: ReturnInput) => academicLifecycleService.retornarEmNovaTurma(input),
  onSuccess,
  onError,
});
