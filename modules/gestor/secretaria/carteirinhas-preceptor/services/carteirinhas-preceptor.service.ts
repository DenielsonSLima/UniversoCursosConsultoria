import { supabase } from '../../../../../lib/supabase';
import { normalizeCanonicalDocumentRenderPayload } from '../../shared/canonical-document-render.utils';
import type {
  CarteirinhaPreceptorPreparationInput,
  CarteirinhaPreceptorPreparationResult,
  CarteirinhaPreceptorTarget,
  CarteirinhasPreceptorWorkspace,
} from '../types/carteirinhas-preceptor.types';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);

const text = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value.trim() : '';
};

const nullableText = (...values: unknown[]) => text(...values) || null;

const boolean = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'boolean' || item === 'true' || item === 'false');
  return value === undefined ? null : value === true || value === 'true';
};

const asList = (value: unknown, keys: string[]) => {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [] as unknown[];
};

const unwrap = (value: unknown) => {
  const record = asRecord(value);
  return record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? { ...record, ...asRecord(record.data) }
    : record;
};

const normalizeTarget = (raw: unknown): CarteirinhaPreceptorTarget => {
  const row = unwrap(raw);
  const professor = asRecord(row.professor || row.preceptor);
  const eligibility = asRecord(row.elegibilidade || row.eligibility);
  const normalizedEligibility = boolean(
    row.elegivel,
    row.eligible,
    eligibility.elegivel,
    eligibility.eligible,
  );

  return {
    professorId: text(row.professor_id, row.preceptor_id, row.partner_id, row.id, professor.id),
    professorNome: text(row.professor_nome, row.preceptor_nome, row.nome, professor.nome) || 'Professor não informado',
    cargo: nullableText(row.cargo, row.role, professor.cargo),
    areaAtuacao: nullableText(row.area_atuacao, row.area, row.especialidade, professor.area_atuacao),
    statusLabel: nullableText(row.status_label, row.status, eligibility.status_label),
    // Apenas o backend confirma se o professor está ativo e pertence ao polo solicitado.
    elegivel: normalizedEligibility === true,
    mensagemElegibilidade: nullableText(
      row.mensagem_elegibilidade,
      row.eligibility_message,
      row.motivo,
      eligibility.mensagem,
      eligibility.message,
    ),
  };
};

const normalizeTemplateInfo = (raw: unknown) => {
  const template = unwrap(raw);
  const content = asRecord(template.content || template.conteudo);
  const qr = asRecord(content.qr);

  return {
    id: nullableText(template.id, template.template_id, template.templateKey, template.template_key),
    nome: text(
      template.nome,
      template.name,
      content.nomeModelo,
      content.nome_modelo,
    ) || 'Carteirinha de preceptor',
    versao: nullableText(template.versao, template.version, template.revision, template.revisao),
    status: nullableText(template.status),
    marcaDaguaAtiva: boolean(
      template.marca_dagua_ativa,
      template.watermark_active,
      content.marcaDaguaHabilitada,
      content.marca_dagua_habilitada,
    ),
    qrCodeAtivo: boolean(template.qr_code_ativo, template.qr_enabled, qr.habilitado, qr.enabled),
  };
};

const normalizeWorkspace = (raw: unknown): CarteirinhasPreceptorWorkspace => {
  const payload = unwrap(raw);
  const template = asRecord(payload.template || payload.modelo);
  const policy = asRecord(payload.policy || payload.politica || payload.validation_policy);

  return {
    targets: asList(payload, ['targets', 'professors', 'preceptors', 'professores'])
      .map(normalizeTarget)
      .filter((target) => Boolean(target.professorId)),
    template: Object.keys(template).length ? normalizeTemplateInfo(template) : null,
    policy: Object.keys(policy).length ? {
      validadeLabel: nullableText(policy.validade_label, policy.validity_label, policy.validade),
      validacaoPublica: boolean(policy.validacao_publica, policy.public_validation),
    } : null,
    generatedAt: nullableText(payload.generated_at, payload.generatedAt),
  };
};

const normalizePreparedDocument = (raw: unknown, index: number) => {
  const row = unwrap(raw);
  const target = asRecord(row.target || row.destinatario || row.professor || row.preceptor);
  return {
    emissionId: text(row.emission_id, row.emissao_id, row.id) || `preparado-${index + 1}`,
    documentId: nullableText(row.document_id, row.documento_id),
    title: text(row.title, row.titulo, row.document_name, row.documento_nome) || 'Carteirinha de preceptor',
    targetName: text(row.target_name, row.professor_nome, row.preceptor_nome, row.nome, target.nome) || 'Professor selecionado',
    validationCode: nullableText(row.validation_code, row.codigo_validacao),
    validationUrl: nullableText(row.validation_url, row.url_validacao),
    validUntil: nullableText(row.valid_until, row.validade_ate, row.expires_at),
    fileUrl: nullableText(row.file_url, row.download_url, row.document_url, row.url_arquivo),
    statusLabel: nullableText(row.status_label, row.status),
    renderPayload: normalizeCanonicalDocumentRenderPayload(
      row.render_payload ?? row.renderPayload,
    ),
  };
};

const normalizePreparation = (raw: unknown): CarteirinhaPreceptorPreparationResult => {
  const payload = unwrap(raw);
  return {
    documents: asList(payload, ['documents', 'documentos', 'items', 'emissions'])
      .map(normalizePreparedDocument),
    message: nullableText(payload.message, payload.mensagem),
    generatedAt: nullableText(payload.generated_at, payload.generatedAt),
  };
};

export const carteirinhasPreceptorService = {
  async getWorkspace(poloId: string): Promise<CarteirinhasPreceptorWorkspace> {
    const { data, error } = await supabase.rpc('get_secretaria_carteirinhas_preceptor_workspace_secure', {
      p_polo_id: poloId,
    });
    if (error) throw error;
    return normalizeWorkspace(Array.isArray(data) ? data[0] : data);
  },

  async prepararEmissao(input: CarteirinhaPreceptorPreparationInput): Promise<CarteirinhaPreceptorPreparationResult> {
    const { data, error } = await supabase.rpc('preparar_emissao_carteirinha_preceptor_secure', {
      p_polo_id: input.poloId,
      p_modo: input.mode,
      p_professor_ids: input.professorIds,
      p_mensagem_personalizada: input.customMessage || null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    return normalizePreparation(Array.isArray(data) ? data[0] : data);
  },
};
