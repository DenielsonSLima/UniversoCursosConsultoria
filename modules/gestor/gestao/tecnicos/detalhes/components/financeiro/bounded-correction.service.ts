import { supabase } from '../../../../../../../lib/supabase';
import { parseCorrectionPreview, type CorrectionPreview } from './bounded-correction';
export const boundedCorrectionService = {
  async preview(operationId: string, matriculaId: string) {
    const { data, error } = await supabase.rpc('preview_bounded_financial_correction_secure', {
      p_operation_id: operationId, p_matricula_id: matriculaId,
    });
    if (error) throw error;
    const preview = parseCorrectionPreview(data);
    if (preview.operationId !== operationId || preview.matriculaId !== matriculaId) {
      throw new Error('A prévia pertence a outra correção. Atualize a lista.');
    }
    return preview;
  },
  async consent(preview: CorrectionPreview, requestId: string) {
    const { data, error } = await supabase.rpc('consent_bounded_financial_correction_secure', {
      p_operation_id: preview.operationId, p_matricula_id: preview.matriculaId,
      p_request_id: requestId, p_expected_fingerprint: preview.fingerprint,
    });
    if (error) throw error;
    if (data?.consented !== true || data?.requestId !== requestId || typeof data?.replayed !== 'boolean') {
      throw new Error('O servidor não confirmou seu consentimento para a correção.');
    }
  },
};
