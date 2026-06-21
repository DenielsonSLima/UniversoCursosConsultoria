import { supabase } from '../../../lib/supabase';
import {
  IssueDocumentInput,
  IssuedDocumentValidation,
} from './document-validation.types';

interface IssueDocumentRpcRow {
  codigo: string;
  documento: IssuedDocumentValidation['type'];
  emitido_em: string;
  ultima_emissao_em: string;
  validade_ate: string | null;
  quantidade_emissoes: number;
  reutilizado: boolean;
}

export const documentValidationService = {
  async issue(input: IssueDocumentInput): Promise<IssuedDocumentValidation> {
    const { data, error } = await supabase.rpc('emitir_documento_validacao', {
      p_documento: input.type,
      p_matricula_id: input.enrollmentId,
      p_periodo_referencia: input.referencePeriod || null,
      p_referencia_externa: input.sourceReference || null,
      p_validade_ate: input.expiresAt === undefined ? null : input.expiresAt,
      p_emitido_por: input.issuedBy || null,
      p_registrar_reemissao: input.registerReissue || false,
    });

    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as IssueDocumentRpcRow | null;
    if (!row?.codigo) {
      throw new Error('O banco não retornou o código da emissão documental.');
    }

    return {
      code: row.codigo,
      type: row.documento,
      issuedAt: row.emitido_em,
      lastIssuedAt: row.ultima_emissao_em,
      expiresAt: row.validade_ate,
      issueCount: row.quantidade_emissoes,
      reused: row.reutilizado,
    };
  },

  async revoke(code: string) {
    const { data, error } = await supabase.rpc('revogar_documento_validacao', {
      p_codigo: code.trim().toUpperCase(),
    });
    if (error) throw error;
    return Boolean(data);
  },
};
