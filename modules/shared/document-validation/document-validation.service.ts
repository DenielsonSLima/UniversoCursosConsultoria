import { supabase } from '../../../lib/supabase';
import {
  IssueDocumentBatchInput,
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

interface IssueDocumentBatchRpcRow extends IssueDocumentRpcRow {
  matricula_id: string;
  ordem_solicitacao: number;
}

const mapIssuedDocument = (row: IssueDocumentRpcRow): IssuedDocumentValidation => ({
  code: row.codigo,
  type: row.documento,
  issuedAt: row.emitido_em,
  lastIssuedAt: row.ultima_emissao_em,
  expiresAt: row.validade_ate,
  issueCount: row.quantidade_emissoes,
  reused: row.reutilizado,
});

export const documentValidationService = {
  async issue(input: IssueDocumentInput): Promise<IssuedDocumentValidation> {
    const isRegistrationDocument = (
      input.type === 'pasta_identificacao'
      || input.type === 'ficha_matricula'
    );
    const { data, error } = isRegistrationDocument
      ? await supabase.rpc('emitir_ficha_validacao_portal', {
          p_documento: input.type,
          p_matricula_id: input.enrollmentId,
          p_periodo_referencia: input.referencePeriod || null,
          p_emitido_por: input.issuedBy || null,
          p_registrar_reemissao: input.registerReissue || false,
          // A função relê e congela os dados no banco. O navegador não envia snapshot.
          p_dados_emissao: {},
        })
      : await supabase.rpc('emitir_documento_validacao_portal', {
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

    return mapIssuedDocument(row);
  },

  async issueRegistrationBatch(
    input: IssueDocumentBatchInput,
  ): Promise<IssuedDocumentValidation[]> {
    if (
      input.type !== 'pasta_identificacao'
      && input.type !== 'ficha_matricula'
    ) {
      throw new Error('A emissão transacional em lote é exclusiva das fichas cadastrais.');
    }
    if (!input.enrollmentIds.length) return [];

    const { data, error } = await supabase.rpc('emitir_fichas_validacao_lote_portal', {
      p_documento: input.type,
      p_matricula_ids: input.enrollmentIds,
      p_periodo_referencia: input.referencePeriod || null,
      p_emitido_por: input.issuedBy || null,
      p_registrar_reemissao: input.registerReissue || false,
    });
    if (error) throw error;

    const rows = ((data || []) as IssueDocumentBatchRpcRow[])
      .sort((a, b) => a.ordem_solicitacao - b.ordem_solicitacao);
    if (rows.length !== input.enrollmentIds.length || rows.some(row => !row.codigo)) {
      throw new Error('O banco não confirmou todas as emissões solicitadas no lote.');
    }
    return rows.map(mapIssuedDocument);
  },

  async revoke(code: string) {
    const { data, error } = await supabase.rpc('revogar_documento_validacao_portal', {
      p_codigo: code.trim().toUpperCase(),
    });
    if (error) throw error;
    return Boolean(data);
  },
};
