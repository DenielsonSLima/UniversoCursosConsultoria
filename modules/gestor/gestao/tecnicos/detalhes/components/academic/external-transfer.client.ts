import {
  requireExternalTransferPreview, requireExternalTransferResult,
  type ExternalTransferFinancialPlan, type ExternalTransferInput,
} from './external-transfer.contract';

type Rpc = (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

export const createExternalTransferClient = (rpc: Rpc) => ({
  async preview(alunoId: string, turmaDestinoId: string, financeiro: ExternalTransferFinancialPlan | null = null) {
    const { data, error } = await rpc('preview_recebimento_transferencia_tecnica_secure', {
      p_aluno_id: alunoId, p_turma_destino_id: turmaDestinoId, p_financeiro: financeiro,
    });
    if (error) throw error;
    return requireExternalTransferPreview(data);
  },
  async receive(input: ExternalTransferInput) {
    const { data, error } = await rpc('receber_transferencia_tecnica_planejada_secure', {
      p_request_id: input.requestId,
      p_aluno_id: input.alunoId,
      p_turma_destino_id: input.turmaDestinoId,
      p_instituicao_origem: input.instituicaoOrigem,
      p_curso_origem: input.cursoOrigem,
      p_motivo: input.motivo,
      p_observacao: input.observacao,
      p_data_transferencia: input.dataTransferencia,
      p_aproveitamentos: input.aproveitamentos,
      p_financeiro: input.financeiro,
      p_expected_regra_fingerprint: input.expectedRegraFingerprint,
    });
    if (error) throw error;
    return requireExternalTransferResult(data, input.requestId);
  },
});
