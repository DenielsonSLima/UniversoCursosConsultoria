import { supabase } from '../../../../lib/supabase';
import {
  mapConvenioDetail,
  mapConveniosList,
  mapCriarConvenioResult,
  mapFinalizarMesResult,
  mapLancarCreditoResult,
} from './convenios.mapper';
import type {
  ConvenioMesDetalhe,
  ConvenioParceiroOption,
  ConvenioStatusScope,
  ConveniosListResult,
  CriarConvenioInput,
  CriarConvenioResult,
  FinalizarConvenioMesInput,
  FinalizarConvenioMesResult,
  LancarConvenioCreditoInput,
  LancarConvenioCreditoResult,
} from './convenios.types';

const unwrap = (data: unknown) => Array.isArray(data) ? data[0] : data;

export const conveniosService = {
  async listarFaculdadesParceiras(
    poloId: string,
    signal?: AbortSignal,
  ): Promise<ConvenioParceiroOption[]> {
    const request = supabase.rpc('listar_faculdades_parceiras_convenio_secure', {
      p_polo_id: poloId,
    });
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map((item: Record<string, unknown>) => ({
      id: String(item.id),
      nome: String(item.nome),
      cpfCnpj: item.cpf_cnpj ? String(item.cpf_cnpj) : null,
    }));
  },

  async listar(
    poloId: string,
    statusScope: ConvenioStatusScope,
    search: string,
    signal?: AbortSignal,
  ): Promise<ConveniosListResult> {
    const request = supabase.rpc('listar_convenios_financeiros_meses_secure', {
      p_polo_id: poloId,
      p_status_scope: statusScope,
      p_search: search.trim() || null,
    });
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return mapConveniosList(unwrap(data));
  },

  async obterDetalhe(
    competenciaId: string,
    signal?: AbortSignal,
  ): Promise<ConvenioMesDetalhe> {
    const request = supabase.rpc('obter_convenio_financeiro_mes_secure', {
      p_competencia_id: competenciaId,
    });
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return mapConvenioDetail(unwrap(data));
  },

  async criar(input: CriarConvenioInput): Promise<CriarConvenioResult> {
    const { data, error } = await supabase.rpc('criar_convenio_financeiro_secure', {
      p_request_id: input.requestId,
      p_polo_id: input.poloId,
      p_parceiro_id: input.parceiroId || null,
      p_nome: input.nome,
      p_competencia: input.competencia,
      p_observacao: input.observacao || null,
    });
    if (error) throw error;
    return mapCriarConvenioResult(unwrap(data));
  },

  async lancarCredito(
    input: LancarConvenioCreditoInput,
  ): Promise<LancarConvenioCreditoResult> {
    const { data, error } = await supabase.rpc('lancar_credito_convenio_financeiro_secure', {
      p_request_id: input.requestId,
      p_competencia_id: input.competenciaId,
      p_conta_bancaria_id: input.contaBancariaId,
      p_data_credito: input.dataCredito,
      p_valor: input.valor,
      p_forma_recebimento: input.formaRecebimento,
      p_descricao: input.descricao,
      p_observacao: input.observacao || null,
    });
    if (error) throw error;
    return mapLancarCreditoResult(unwrap(data));
  },

  async finalizar(
    input: FinalizarConvenioMesInput,
  ): Promise<FinalizarConvenioMesResult> {
    const { data, error } = await supabase.rpc('finalizar_convenio_financeiro_mes_secure', {
      p_request_id: input.requestId,
      p_competencia_id: input.competenciaId,
      p_criar_proxima: input.criarProxima,
    });
    if (error) throw error;
    return mapFinalizarMesResult(unwrap(data));
  },
};
