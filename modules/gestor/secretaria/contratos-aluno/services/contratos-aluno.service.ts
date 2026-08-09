import { supabase } from '../../../../../lib/supabase';
import { normalizeCanonicalDocumentRenderPayload } from '../../shared/canonical-document-render.utils';
import type {
  ContratoAlunoPreparationInput,
  ContratoAlunoPreparationResult,
  ContratoAlunoTurma,
  ContratoAlunoWorkspace,
  ContratoAlunoTarget,
} from '../types/contratos-aluno.types';

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

const list = (value: unknown, keys: string[]) => {
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

const normalizeTarget = (raw: unknown): ContratoAlunoTarget => {
  const row = unwrap(raw);
  const aluno = asRecord(row.aluno);
  const turma = asRecord(row.turma);
  const curso = asRecord(row.curso);
  const eligibility = asRecord(row.elegibilidade || row.eligibility);
  const normalizedEligibility = boolean(
    row.elegivel,
    row.eligible,
    eligibility.elegivel,
    eligibility.eligible,
  );

  return {
    enrollmentId: text(row.matricula_id, row.enrollment_id, row.enrollmentId, row.id),
    poloId: text(row.polo_id, row.poloId),
    dataMatricula: nullableText(row.data_matricula, row.enrollment_created_at, row.dataMatricula),
    alunoId: text(row.aluno_id, row.student_id, row.alunoId, aluno.id),
    alunoNome: text(row.aluno_nome, row.student_name, row.alunoNome, aluno.nome) || 'Aluno não informado',
    alunoCpf: nullableText(row.aluno_cpf, row.student_cpf, row.alunoCpf, aluno.cpf, aluno.cpf_cnpj),
    alunoRg: nullableText(row.aluno_rg, row.student_rg, row.alunoRg, aluno.rg),
    alunoFotoUrl: nullableText(row.aluno_foto_url, row.student_photo_url, row.alunoFotoUrl, aluno.foto_url),
    cursoNome: text(row.curso_nome, row.course_name, row.cursoNome, curso.nome) || 'Curso não informado',
    modalidade: text(row.modalidade, row.course_modality, row.curso_modalidade, curso.modalidade) || 'NÃO INFORMADA',
    turmaId: text(row.turma_id, row.class_id, row.turmaId, turma.id),
    turmaNome: text(row.turma_nome, row.class_name, row.turmaNome, turma.nome) || 'Turma não informada',
    turmaCodigo: text(row.turma_codigo, row.class_code, row.turmaCodigo, turma.codigo),
    statusLabel: nullableText(row.status_label, row.status, eligibility.status_label),
    // A elegibilidade é inteiramente canônica. Ausência do indicador não é tratada como aprovação.
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

const normalizeTurma = (raw: unknown): ContratoAlunoTurma => {
  const row = unwrap(raw);
  const curso = asRecord(row.curso);
  return {
    id: text(row.id, row.turma_id, row.class_id),
    nome: text(row.nome, row.turma_nome, row.class_name) || 'Turma não informada',
    codigo: text(row.codigo, row.turma_codigo, row.class_code),
    cursoNome: text(row.curso_nome, row.course_name, curso.nome) || 'Curso não informado',
    modalidade: text(row.modalidade, row.course_modality, curso.modalidade) || 'NÃO INFORMADA',
  };
};

const normalizeTemplateInfo = (raw: unknown) => {
  const template = unwrap(raw);
  const content = asRecord(template.content || template.conteudo);
  const watermark = asRecord(content.marcaDagua || content.marca_dagua);
  const qr = asRecord(content.qr);

  return {
    id: nullableText(template.id, template.template_id, template.templateKey, template.template_key),
    nome: text(
      template.nome,
      template.name,
      content.tituloDocumento,
      content.titulo,
    ) || 'Contrato do aluno',
    versao: nullableText(template.versao, template.version, template.revision, template.revisao),
    modalidade: nullableText(template.modalidade, template.modality),
    status: nullableText(template.status),
    marcaDaguaAtiva: boolean(
      template.marca_dagua_ativa,
      template.watermark_active,
      watermark.habilitada,
      watermark.enabled,
    ),
    qrCodeAtivo: boolean(template.qr_code_ativo, template.qr_enabled, qr.habilitado, qr.enabled),
  };
};

const normalizeWorkspace = (raw: unknown): ContratoAlunoWorkspace => {
  const payload = unwrap(raw);
  const templates = list(payload, ['templates', 'modelos']);
  const policy = asRecord(payload.policy || payload.politica || payload.validation_policy);
  const targets = list(payload, ['targets', 'enrollments', 'matriculas', 'alunos'])
    .map(normalizeTarget)
    .filter((target) => Boolean(target.enrollmentId));
  const turmas = list(payload, ['turmas', 'classes'])
    .map(normalizeTurma)
    .filter((turma) => Boolean(turma.id));

  return {
    targets,
    turmas,
    templates: templates.map(normalizeTemplateInfo),
    policy: Object.keys(policy).length ? {
      validadeLabel: nullableText(policy.validade_label, policy.validity_label, policy.validade),
      validacaoPublica: boolean(policy.validacao_publica, policy.public_validation),
    } : null,
    generatedAt: nullableText(payload.generated_at, payload.generatedAt),
  };
};

const normalizePreparedDocument = (raw: unknown, index: number) => {
  const row = unwrap(raw);
  const target = asRecord(row.target || row.destinatario || row.aluno);
  return {
    emissionId: text(row.emission_id, row.emissao_id, row.id) || `preparado-${index + 1}`,
    documentId: nullableText(row.document_id, row.documento_id),
    title: text(row.title, row.titulo, row.document_name, row.documento_nome) || 'Contrato de prestação de serviços educacionais',
    targetName: text(row.target_name, row.aluno_nome, row.student_name, target.nome) || 'Aluno selecionado',
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

const normalizePreparation = (raw: unknown): ContratoAlunoPreparationResult => {
  const payload = unwrap(raw);
  return {
    documents: list(payload, ['documents', 'documentos', 'items', 'emissions'])
      .map(normalizePreparedDocument),
    message: nullableText(payload.message, payload.mensagem),
    generatedAt: nullableText(payload.generated_at, payload.generatedAt),
  };
};

export const contratosAlunoService = {
  async getWorkspace(poloId: string): Promise<ContratoAlunoWorkspace> {
    const { data, error } = await supabase.rpc('get_secretaria_contratos_aluno_workspace_secure', {
      p_polo_id: poloId,
    });
    if (error) throw error;
    return normalizeWorkspace(Array.isArray(data) ? data[0] : data);
  },

  async prepararEmissao(input: ContratoAlunoPreparationInput): Promise<ContratoAlunoPreparationResult> {
    const { data, error } = await supabase.rpc('preparar_emissao_contrato_aluno_secure', {
      p_polo_id: input.poloId,
      p_modo: input.mode,
      p_matricula_ids: input.enrollmentIds,
      p_mensagem_personalizada: input.customMessage || null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    return normalizePreparation(Array.isArray(data) ? data[0] : data);
  },
};
