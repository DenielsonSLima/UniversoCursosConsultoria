import { supabase } from '../../../../../lib/supabase';
import { parseTransferHistory, parseTransferPreview, parseTransferResult, type TransferIntent } from './transfer-finance.contract';

export const transferFinanceKeys = {
  history: (turmaId: string) => ['transfer-finance-history', turmaId] as const,
};
export const transferFinanceService = {
  async preview(input: Pick<TransferIntent, 'matriculaId' | 'tipo' | 'dataTransferencia' | 'turmaDestinoId'>) {
    const { data, error } = await supabase.rpc('preview_transferencia_financeira', {
      p_matricula_id: input.matriculaId, p_tipo: input.tipo,
      p_data_transferencia: input.dataTransferencia, p_turma_destino_id: input.turmaDestinoId || null,
    });
    if (error) throw error;
    return parseTransferPreview(data);
  },
  async confirm(input: TransferIntent & { requestId: string; fingerprint: string }) {
    const { data, error } = await supabase.rpc('transferir_matricula_com_revisao_financeira', {
      p_request_id: input.requestId, p_expected_fingerprint: input.fingerprint,
      p_matricula_id: input.matriculaId, p_tipo: input.tipo, p_motivo: input.motivo,
      p_data_transferencia: input.dataTransferencia, p_turma_destino_id: input.turmaDestinoId || null,
      p_instituicao_destino: input.instituicaoDestino || null, p_observacao: input.observacao || null,
    });
    if (error) throw error;
    return parseTransferResult(data);
  },
  async history(turmaId: string) {
    const { data, error } = await supabase.rpc('get_transferencias_financeiras_turma', { p_turma_id: turmaId });
    if (error) throw error;
    return parseTransferHistory(data);
  },
};
