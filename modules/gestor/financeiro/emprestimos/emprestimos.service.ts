import { supabase } from '../../../../lib/supabase';
import {
  mapEmprestimoFinanceiro,
  mapEmprestimosFinanceiros,
} from './emprestimos.mapper';
import type {
  BaixarEmprestimoParcelasInput,
  BaixarEmprestimoParcelasResult,
  CancelarOuEstornarEmprestimoInput,
  CancelarOuEstornarEmprestimoResult,
  CriarEmprestimoInput,
  EmprestimosExportSnapshot,
  EmprestimoFinanceiro,
  EmprestimoStatus,
  EmprestimoStatusScope,
} from './emprestimos.types';

export interface EmprestimoBancoParceiro {
  id: string;
  nome: string;
  cpfCnpj?: string;
  fotoUrl?: string;
}

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

const asEmprestimoStatus = (value: unknown): EmprestimoStatus => {
  if (value === 'QUITADO' || value === 'CANCELADO') return value;
  return 'ATIVO';
};

const asStatusScope = (value: unknown): EmprestimoStatusScope => {
  if (value === 'ATIVOS' || value === 'FINALIZADOS') return value;
  return 'TODOS';
};

const asStringArray = (value: unknown) => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

const asResultRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
};

export const createEmprestimoRequestId = () => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    })
);

export const emprestimosService = {
  async listarBancosCredores(poloResponsavelId: string): Promise<EmprestimoBancoParceiro[]> {
    const { data, error } = await supabase.rpc(
      'get_financeiro_bancos_por_polo_secure',
      { p_polo_id: poloResponsavelId },
    );

    if (error) throw error;

    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      id: typeof row.id === 'string' ? row.id : '',
      nome: typeof row.nome === 'string' ? row.nome : '',
      cpfCnpj: typeof row.cpf_cnpj === 'string' ? row.cpf_cnpj : undefined,
      fotoUrl: typeof row.foto_url === 'string' ? row.foto_url : undefined,
    })).filter((banco) => Boolean(banco.id && banco.nome));
  },

  async listar(poloResponsavelId: string): Promise<EmprestimoFinanceiro[]> {
    const { data, error } = await supabase.rpc('listar_emprestimos_financeiros_polo_secure', {
      p_polo_id: poloResponsavelId,
    });

    if (error) throw error;
    return mapEmprestimosFinanceiros(data);
  },

  async criar(input: CriarEmprestimoInput): Promise<EmprestimoFinanceiro> {
    const { data, error } = await supabase.rpc('criar_emprestimo_financeiro_polo_com_banco_secure', {
      p_request_id: input.requestId,
      p_polo_id: input.poloResponsavelId,
      p_credor_parceiro_id: input.credorParceiroId,
      p_descricao: input.descricao,
      p_valor_liberado: input.valorLiberado,
      p_valor_total_divida: input.valorTotalDivida,
      p_data_liberacao: input.dataLiberacao,
      p_data_primeiro_vencimento: input.dataPrimeiroVencimento,
      p_total_parcelas: input.totalParcelas,
      p_intervalo_meses: input.intervaloMeses,
      p_conta_credito_id: input.contaCreditoId,
      p_forma_credito: input.formaCredito,
      p_rateio_modo: input.rateioModo,
      p_polo_ids: input.rateioModo === 'SELECIONADOS' ? input.poloIds || [] : [],
      p_observacao: input.observacao || null,
    });

    if (error) throw error;
    return mapEmprestimoFinanceiro(data);
  },

  async baixarParcelas(
    input: BaixarEmprestimoParcelasInput,
  ): Promise<BaixarEmprestimoParcelasResult> {
    const { data, error } = await supabase.rpc('baixar_emprestimo_parcelas_polo_secure', {
      p_emprestimo_id: input.emprestimoId,
      p_emprestimo_parcela_ids: input.parcelaIds,
      p_polo_id: input.poloResponsavelId,
      p_request_id: input.requestId,
      p_conta_bancaria_id: input.contaBancariaId,
      p_data_pagamento: input.dataPagamento,
      p_forma_pagamento: input.formaPagamento,
      p_juros_valor: input.jurosValor,
      p_multa_valor: input.multaValor,
      p_desconto_valor: input.descontoValor,
      p_observacao: input.observacao || null,
    });

    if (error) throw error;
    const result = asResultRecord(data);
    return {
      emprestimoId: asString(result.emprestimoId ?? result.emprestimo_id) || input.emprestimoId,
      status: asEmprestimoStatus(result.status),
      parcelaIds: asStringArray(result.parcelaIds ?? result.parcela_ids),
      valorBase: asNumber(result.valorBase ?? result.valor_base),
      jurosValor: asNumber(result.jurosValor ?? result.juros_valor),
      multaValor: asNumber(result.multaValor ?? result.multa_valor),
      descontoValor: asNumber(result.descontoValor ?? result.desconto_valor),
      valorPago: asNumber(result.valorPago ?? result.valor_pago),
      replayed: result.replayed === true,
    };
  },

  async cancelarOuEstornar(
    input: CancelarOuEstornarEmprestimoInput,
  ): Promise<CancelarOuEstornarEmprestimoResult> {
    const { data, error } = await supabase.rpc(
      'cancelar_ou_estornar_emprestimo_financeiro_secure',
      {
        p_emprestimo_id: input.emprestimoId,
        p_polo_id: input.poloResponsavelId,
        p_request_id: input.requestId,
        p_motivo: input.motivo,
        p_confirmar_estorno: input.confirmarEstorno,
      },
    );

    if (error) throw error;
    const result = asResultRecord(data);
    return {
      emprestimoId: asString(result.emprestimoId ?? result.emprestimo_id) || input.emprestimoId,
      status: asEmprestimoStatus(result.status),
      estornado: result.estornado === true,
      replayed: result.replayed === true,
    };
  },

  async prepararRelatorio(
    poloResponsavelId: string,
    statusScope: EmprestimoStatusScope,
  ): Promise<EmprestimosExportSnapshot> {
    const { data, error } = await supabase.rpc(
      'preparar_relatorio_emprestimos_financeiros_secure',
      {
        p_polo_id: poloResponsavelId,
        p_status_scope: statusScope,
      },
    );

    if (error) throw error;
    const result = asResultRecord(data);
    const polo = asResultRecord(result.polo);
    const company = asResultRecord(result.company);
    return {
      issuedAt: asString(result.issuedAt ?? result.issued_at),
      statusScope: asStatusScope(result.statusScope ?? result.status_scope),
      total: asNumber(result.total),
      polo,
      company,
      items: mapEmprestimosFinanceiros(result.items),
    };
  },
};
