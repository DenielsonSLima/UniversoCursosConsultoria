import { supabase } from '../../../../../../lib/supabase';
import {
  createPreceptorCrachaModel,
  hasPreceptorCrachaLayout,
  PRECEPTOR_CRACHA_LAYOUT_VERSION,
  type CrachaTemplateField,
} from '../../cracha/components/cracha-editor.model';
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

const normalizeQr = (value: unknown) => {
  const qr = isRecord(value) ? value : {};
  const modoValidade = qr.modoValidade === 'POR_DIAS' ? 'POR_DIAS' : 'SEM_VENCIMENTO';
  return {
    habilitado: qr.habilitado !== false,
    rotulo: asString(qr.rotulo, 'Validar credencial'),
    caminhoValidacao: asString(qr.caminhoValidacao, '/validar-documento'),
    modoValidade,
    diasValidade: modoValidade === 'POR_DIAS' && typeof qr.diasValidade === 'number' && Number.isFinite(qr.diasValidade)
      ? qr.diasValidade
      : modoValidade === 'POR_DIAS' ? 365 : null,
  } as const;
};

const normalizeContent = (value: unknown): ConteudoModeloCarteirinhaPreceptor => {
  const source = isRecord(value) ? value : {};
  // Modelos antigos precisam continuar identificáveis aqui. A tela então usa o
  // modelo de estágio vigente como fonte visual do primeiro clone; converter
  // nesta camada faria perder os fundos personalizados antes de ela carregá-los.
  if (!hasPreceptorCrachaLayout(source)) {
    return {
      ...source,
      id: CARTEIRINHA_PRECEPTOR_TEMPLATE_KEY,
      nome: asString(source.nome, asString(source.nomeModelo, 'Crachá de Preceptor')),
      nomeModelo: asString(source.nomeModelo, 'Crachá de Preceptor'),
      tituloFrente: asString(source.tituloFrente, 'PRECEPTOR(A)'),
      subtituloFrente: asString(source.subtituloFrente, 'UNIVERSO CURSOS E CONSULTORIA'),
      mensagemVerso: asString(source.mensagemVerso, 'Credencial institucional de uso pessoal e intransferível. A autenticidade pode ser conferida pelo QR Code.'),
      rodape: asString(source.rodape, 'Documento institucional · valide pelo QR Code'),
      mostrarFoto: source.mostrarFoto !== false,
      mostrarPolo: source.mostrarPolo !== false,
      marcaDaguaHabilitada: source.marcaDaguaHabilitada !== false,
      qr: normalizeQr(source.qr),
    } as ConteudoModeloCarteirinhaPreceptor;
  }
  const prepared = createPreceptorCrachaModel(source);
  const fields = Array.isArray(prepared.fields) ? prepared.fields : [];

  return {
    ...prepared,
    id: CARTEIRINHA_PRECEPTOR_TEMPLATE_KEY,
    layoutVersion: PRECEPTOR_CRACHA_LAYOUT_VERSION,
    nome: asString(prepared.nome, 'Crachá de Preceptor'),
    nomeModelo: asString(source.nomeModelo, asString(prepared.nome, 'Crachá de Preceptor')),
    tituloFrente: asString(source.tituloFrente, asString(prepared.textoFrente, 'PRECEPTOR(A)')),
    subtituloFrente: asString(source.subtituloFrente, 'UNIVERSO CURSOS E CONSULTORIA'),
    mensagemVerso: asString(source.mensagemVerso, asString(prepared.textoVerso)),
    rodape: asString(source.rodape, 'Documento institucional · valide pelo QR Code'),
    mostrarFoto: source.mostrarFoto !== false && fields.some((field) => field.type === 'foto'),
    mostrarPolo: source.mostrarPolo !== false,
    marcaDaguaHabilitada: source.marcaDaguaHabilitada !== false,
    fields: fields as CrachaTemplateField[],
    qr: normalizeQr(source.qr),
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
 * O backend mantém autorização, revisão, auditoria e QR opaco. Esta camada só
 * normaliza o layout do navegador antes de enviar pelo RPC versionado.
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
