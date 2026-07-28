import { supabase } from '../../../lib/supabase';
import {
  IssueDocumentBatchInput,
  IssueDocumentInput,
  IssuedDocumentValidation,
  PreparedDocumentReissue,
  ReissueDocumentBatchInput,
  ReissueDocumentInput,
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

interface PrepareDocumentReissueRpcRow extends IssueDocumentRpcRow {
  politica_versao: number;
  validacao_publica: boolean;
}

interface IssueDocumentBatchRpcRow extends IssueDocumentRpcRow {
  matricula_id: string;
  ordem_solicitacao: number;
}

interface DocumentValidationSnapshotRow {
  codigo: string;
  validade_ate: string | null;
  validacao_publica: boolean;
}

const mapIssuedDocument = (
  row: IssueDocumentRpcRow,
  snapshot: DocumentValidationSnapshotRow,
): IssuedDocumentValidation => ({
  code: row.codigo,
  type: row.documento,
  issuedAt: row.emitido_em,
  lastIssuedAt: row.ultima_emissao_em,
  expiresAt: snapshot.validade_ate,
  validationPublic: snapshot.validacao_publica,
  issueCount: row.quantidade_emissoes,
  reused: row.reutilizado,
});

const loadSnapshots = async (codes: string[]) => {
  const normalizedCodes = [...new Set(
    codes.map((code) => code.trim().toUpperCase()).filter(Boolean),
  )];
  if (!normalizedCodes.length) return new Map<string, DocumentValidationSnapshotRow>();
  const { data, error } = await (supabase.rpc as any)(
    'obter_snapshots_validacao_documentos',
    { p_codigos: normalizedCodes },
  );
  if (error) throw error;
  const snapshots = (data || []) as DocumentValidationSnapshotRow[];
  if (snapshots.length !== normalizedCodes.length) {
    throw new Error('O snapshot canônico da emissão documental não foi localizado.');
  }
  return new Map(snapshots.map((snapshot) => [
    snapshot.codigo.trim().toUpperCase(),
    snapshot,
  ]));
};

export const createDocumentReissueKey = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `reissue-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const mapIssueResponse = async (
  data: unknown,
): Promise<IssuedDocumentValidation> => {
  const row = (Array.isArray(data) ? data[0] : data) as IssueDocumentRpcRow | null;
  if (!row?.codigo) {
    throw new Error('O banco não retornou o código da emissão documental.');
  }

  const snapshots = await loadSnapshots([row.codigo]);
  const snapshot = snapshots.get(row.codigo.trim().toUpperCase());
  if (!snapshot) {
    throw new Error('O snapshot canônico da emissão documental não foi localizado.');
  }
  return mapIssuedDocument(row, snapshot);
};

export const documentValidationService = {
  async issue(input: IssueDocumentInput): Promise<IssuedDocumentValidation> {
    if (input.registerReissue) {
      throw new Error(
        'Use documentValidationService.reissue com chave de idempotência explícita.',
      );
    }

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
          p_registrar_reemissao: false,
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
          p_registrar_reemissao: false,
        });

    if (error) throw error;
    return mapIssueResponse(data);
  },

  async reissue(
    input: ReissueDocumentInput,
  ): Promise<IssuedDocumentValidation> {
    if (!input.idempotencyKey.trim()) {
      throw new Error('A reemissão exige uma chave de idempotência explícita.');
    }

    const { data, error } = await (supabase.rpc as any)(
      'reemitir_documento_validacao_portal',
      {
        p_documento: input.type,
        p_matricula_id: input.enrollmentId,
        p_idempotency_key: input.idempotencyKey,
        p_periodo_referencia: input.referencePeriod || null,
        p_referencia_externa: input.sourceReference || null,
        p_emitido_por: input.issuedBy || null,
      },
    );
    if (error) throw error;
    return mapIssueResponse(data);
  },

  async prepareReissue(
    input: ReissueDocumentInput,
  ): Promise<PreparedDocumentReissue> {
    if (!input.idempotencyKey.trim()) {
      throw new Error('A preparação exige uma chave de idempotência explícita.');
    }

    const { data, error } = await (supabase.rpc as any)(
      'preparar_reemissao_documento_validacao_portal',
      {
        p_documento: input.type,
        p_matricula_id: input.enrollmentId,
        p_idempotency_key: input.idempotencyKey,
        p_periodo_referencia: input.referencePeriod || null,
        p_referencia_externa: input.sourceReference || null,
        p_emitido_por: input.issuedBy || null,
      },
    );
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as
      PrepareDocumentReissueRpcRow | null;
    if (!row?.codigo || !row.politica_versao) {
      throw new Error('O banco não retornou a preparação canônica da reemissão.');
    }

    const snapshots = await loadSnapshots([row.codigo]);
    const snapshot = snapshots.get(row.codigo.trim().toUpperCase());
    if (!snapshot) {
      throw new Error('O snapshot canônico da emissão documental não foi localizado.');
    }
    return {
      ...mapIssuedDocument(row, {
        ...snapshot,
        validade_ate: row.validade_ate,
        validacao_publica: row.validacao_publica,
      }),
      expiresAt: row.validade_ate,
      policyVersion: row.politica_versao,
    };
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
    if (input.registerReissue) {
      throw new Error(
        'Use reissueRegistrationBatch com chave de idempotência explícita.',
      );
    }

    const { data, error } = await supabase.rpc(
      'emitir_fichas_validacao_lote_portal',
      {
        p_documento: input.type,
        p_matricula_ids: input.enrollmentIds,
        p_periodo_referencia: input.referencePeriod || null,
        p_emitido_por: input.issuedBy || null,
        p_registrar_reemissao: false,
      },
    );
    if (error) throw error;

    const rows = ((data || []) as IssueDocumentBatchRpcRow[])
      .sort((a, b) => a.ordem_solicitacao - b.ordem_solicitacao);
    if (rows.length !== input.enrollmentIds.length || rows.some(row => !row.codigo)) {
      throw new Error('O banco não confirmou todas as emissões solicitadas no lote.');
    }
    const snapshots = await loadSnapshots(rows.map((row) => row.codigo));
    return rows.map((row) => mapIssuedDocument(
      row,
      snapshots.get(row.codigo.trim().toUpperCase())!,
    ));
  },

  async reissueRegistrationBatch(
    input: ReissueDocumentBatchInput,
  ): Promise<IssuedDocumentValidation[]> {
    if (
      input.type !== 'pasta_identificacao'
      && input.type !== 'ficha_matricula'
    ) {
      throw new Error('A reemissão transacional em lote é exclusiva das fichas cadastrais.');
    }
    if (!input.enrollmentIds.length) return [];
    if (!input.idempotencyKey.trim()) {
      throw new Error('A reemissão em lote exige uma chave de idempotência explícita.');
    }

    const { data, error } = await (supabase.rpc as any)(
      'reemitir_fichas_validacao_lote_portal',
      {
        p_documento: input.type,
        p_matricula_ids: input.enrollmentIds,
        p_idempotency_key: input.idempotencyKey,
        p_periodo_referencia: input.referencePeriod || null,
        p_emitido_por: input.issuedBy || null,
      },
    );
    if (error) throw error;

    const rows = ((data || []) as IssueDocumentBatchRpcRow[])
      .sort((a, b) => a.ordem_solicitacao - b.ordem_solicitacao);
    if (rows.length !== input.enrollmentIds.length || rows.some(row => !row.codigo)) {
      throw new Error('O banco não confirmou todas as emissões solicitadas no lote.');
    }
    const snapshots = await loadSnapshots(rows.map((row) => row.codigo));
    return rows.map((row) => mapIssuedDocument(
      row,
      snapshots.get(row.codigo.trim().toUpperCase())!,
    ));
  },

  async getSnapshot(code: string): Promise<{
    expiresAt: string | null;
    validationPublic: boolean;
  } | null> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return null;
    const snapshots = await loadSnapshots([normalizedCode]);
    const data = snapshots.get(normalizedCode);
    if (!data) return null;
    return {
      expiresAt: data.validade_ate,
      validationPublic: data.validacao_publica,
    };
  },

  async revoke(code: string) {
    const { data, error } = await supabase.rpc('revogar_documento_validacao_portal', {
      p_codigo: code.trim().toUpperCase(),
    });
    if (error) throw error;
    return Boolean(data);
  },
};
