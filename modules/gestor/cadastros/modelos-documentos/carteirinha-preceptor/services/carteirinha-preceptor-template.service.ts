import { supabase } from '../../../../../../lib/supabase';
import type {
  ConteudoModeloCarteirinhaPreceptor,
  ModeloCarteirinhaPreceptorSeguro,
  SalvarModeloCarteirinhaPreceptorInput,
  StatusModeloPreceptor,
} from '../types/carteirinha-preceptor.types';

export const CARTEIRINHA_PRECEPTOR_TEMPLATE_KEY = 'carteirinha_preceptor' as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asString = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const isStatus = (value: unknown): value is StatusModeloPreceptor => (
  value === 'RASCUNHO' || value === 'ATIVO' || value === 'EM_REVISAO'
);

const DEFAULT_CONTENT: ConteudoModeloCarteirinhaPreceptor = {
  nomeModelo: 'Carteirinha de Preceptor',
  tituloFrente: 'PRECEPTOR(A)',
  subtituloFrente: 'UNIVERSO CURSOS E CONSULTORIA',
  mensagemVerso: 'Credencial institucional de uso pessoal e intransferível. A autenticidade pode ser conferida pelo QR Code.',
  rodape: 'Documento institucional · valide pelo QR Code',
  mostrarFoto: true,
  mostrarPolo: true,
  marcaDaguaHabilitada: true,
  qr: {
    habilitado: true,
    rotulo: 'Validar credencial',
    caminhoValidacao: '/validar-documento',
    modoValidade: 'POR_DIAS',
    diasValidade: 365,
  },
};

const normalizeContent = (value: unknown): ConteudoModeloCarteirinhaPreceptor => {
  if (!isRecord(value)) return DEFAULT_CONTENT;
  const qr = isRecord(value.qr) ? value.qr : {};
  const modoValidade = qr.modoValidade === 'POR_DIAS' ? 'POR_DIAS' : 'SEM_VENCIMENTO';
  return {
    nomeModelo: asString(value.nomeModelo, DEFAULT_CONTENT.nomeModelo),
    tituloFrente: asString(value.tituloFrente, DEFAULT_CONTENT.tituloFrente),
    subtituloFrente: asString(value.subtituloFrente, DEFAULT_CONTENT.subtituloFrente),
    mensagemVerso: asString(value.mensagemVerso, DEFAULT_CONTENT.mensagemVerso),
    rodape: asString(value.rodape, DEFAULT_CONTENT.rodape),
    mostrarFoto: value.mostrarFoto !== false,
    mostrarPolo: value.mostrarPolo !== false,
    marcaDaguaHabilitada: value.marcaDaguaHabilitada !== false,
    qr: {
      habilitado: qr.habilitado !== false,
      rotulo: asString(qr.rotulo, DEFAULT_CONTENT.qr.rotulo),
      caminhoValidacao: asString(qr.caminhoValidacao, DEFAULT_CONTENT.qr.caminhoValidacao),
      modoValidade,
      diasValidade: modoValidade === 'POR_DIAS' && typeof qr.diasValidade === 'number' && Number.isFinite(qr.diasValidade)
        ? qr.diasValidade
        : modoValidade === 'POR_DIAS' ? DEFAULT_CONTENT.qr.diasValidade : null,
    },
  };
};

const normalizeEnvelope = (payload: unknown): ModeloCarteirinhaPreceptorSeguro => {
  const row = Array.isArray(payload) ? payload[0] : payload;
  const source = isRecord(row) ? row : {};
  const revision = typeof source.revisao === 'number'
    ? source.revisao
    : typeof source.revision === 'number' ? source.revision : 0;

  return {
    templateKey: CARTEIRINHA_PRECEPTOR_TEMPLATE_KEY,
    revisao: Number.isFinite(revision) ? revision : 0,
    status: isStatus(source.status) ? source.status : 'RASCUNHO',
    atualizadoEm: asString(source.atualizadoEm ?? source.updatedAt ?? source.updated_at) || null,
    atualizadoPorNome: asString(source.atualizadoPorNome ?? source.updatedByName ?? source.updated_by_name) || null,
    conteudo: normalizeContent(source.conteudo ?? source.content),
  };
};

/**
 * RPCs esperadas para este modelo:
 * - get_modelo_documento_template_secure('carteirinha_preceptor', null)
 * - save_modelo_documento_template_secure('carteirinha_preceptor', null,
 *   p_expected_revision, p_content jsonb, p_request_id uuid)
 *
 * O backend limita a leitura/gravação ao gestor autorizado, grava a auditoria
 * e retorna a revisão vencedora. A credencial emitida e seu QR são sempre
 * gerados em outro fluxo seguro; esta tela só edita o modelo.
 */
export const carteirinhaPreceptorTemplateService = {
  async getTemplate() {
    const { data, error } = await supabase.rpc('get_modelo_documento_template_secure', {
      p_template_key: CARTEIRINHA_PRECEPTOR_TEMPLATE_KEY,
      p_modality: null,
    });
    if (error) throw error;
    return normalizeEnvelope(data);
  },

  async saveTemplate(input: SalvarModeloCarteirinhaPreceptorInput) {
    const { data, error } = await supabase.rpc('save_modelo_documento_template_secure', {
      p_template_key: CARTEIRINHA_PRECEPTOR_TEMPLATE_KEY,
      p_modality: null,
      p_expected_revision: input.revisaoEsperada,
      p_content: input.conteudo,
      p_request_id: input.requestId,
    });
    if (error) throw error;
    return normalizeEnvelope(data);
  },
};
