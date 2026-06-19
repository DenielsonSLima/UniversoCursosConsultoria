// File: modules/gestor/caixa/caixa.service.ts

import { supabase } from '../../../lib/supabase';
import { financeiroService } from '../financeiro/financeiro.service';

export interface CaixaDashboardData {
  saldoTotalContas: number;
  saldosIndividuais: Array<{
    id: string;
    banco: string;
    agencia: string;
    conta: string;
    saldoAtual: number;
    poloNome: string;
    poloId: string;
  }>;
  totalReceber: number;
  receberPorTipo: Array<{
    categoria: string;
    valor: number;
  }>;
  totalPagar: number;
  pagarPorTipo: Array<{
    categoria: string;
    valor: number;
  }>;
  mensalidadesEmAtraso: {
    quantidade: number;
    valorTotal: number;
  };
  fluxo3Meses: Array<{
    mesNome: string;
    creditos: number;
    debitos: number;
  }>;
}

export const PRINCIPAL_POLO_ID = '44444444-4444-4444-4444-444444444444';

export const caixaService = {
  async getCaixaDashboardData(poloId?: string): Promise<CaixaDashboardData> {
    const isFiltered = poloId && poloId !== 'todos';

    // 1. Saldos Individuais e Total de Contas Bancárias
    const contasBancarias = await financeiroService.getContasBancariasSaldos();
    let mappedSaldos = contasBancarias.map(cb => ({
      id: cb.id || '',
      banco: cb.banco,
      agencia: cb.agencia,
      conta: cb.conta,
      saldoAtual: cb.saldoAtual || 0,
      poloNome: cb.poloNome || 'Polo Geral',
      poloId: cb.poloId || ''
    }));

    // Filtrar contas bancárias
    if (isFiltered) {
      if (poloId === PRINCIPAL_POLO_ID) {
        mappedSaldos = mappedSaldos.filter(s => s.poloId === PRINCIPAL_POLO_ID || !s.poloId);
      } else {
        mappedSaldos = mappedSaldos.filter(s => s.poloId === poloId);
      }
    }
    const saldoTotalContas = mappedSaldos.reduce((acc, curr) => acc + curr.saldoAtual, 0);

    // 2. Contas a Receber (Categorizadas)
    let queryRec = supabase
      .from('contas_receber')
      .select('categoria, valor, status, data_vencimento, polo_id')
      .in('status', ['PENDENTE', 'VENCIDO']);

    if (isFiltered) {
      if (poloId === PRINCIPAL_POLO_ID) {
        queryRec = queryRec.or(`polo_id.eq.${PRINCIPAL_POLO_ID},polo_id.is.null`);
      } else {
        queryRec = queryRec.eq('polo_id', poloId);
      }
    }

    const { data: recData, error: recError } = await queryRec;
    if (recError) {
      console.error('Erro ao buscar contas a receber no Caixa:', recError);
      throw recError;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let totalReceber = 0;
    const receberMap: { [key: string]: number } = {
      MENSALIDADE: 0,
      OUTROS_CREDITOS: 0,
      ADIANTAMENTO_TOMADO: 0
    };

    let mensalidadesAtrasoCount = 0;
    let mensalidadesAtrasoValor = 0;

    (recData || []).forEach((row: any) => {
      const valor = Number(row.valor || 0);
      const cat = row.categoria || 'OUTROS_CREDITOS';
      
      totalReceber += valor;
      if (receberMap[cat] !== undefined) {
        receberMap[cat] += valor;
      } else {
        receberMap[cat] = valor;
      }

      // Mensalidade em Atraso
      if (cat === 'MENSALIDADE') {
        const isOverdue = row.status === 'VENCIDO' || (row.status === 'PENDENTE' && row.data_vencimento < todayStr);
        if (isOverdue) {
          mensalidadesAtrasoCount += 1;
          mensalidadesAtrasoValor += valor;
        }
      }
    });

    const receberPorTipo = Object.keys(receberMap).map(key => ({
      categoria: key,
      valor: receberMap[key]
    }));

    // 3. Contas a Pagar (Categorizadas)
    let queryPag = supabase
      .from('contas_pagar')
      .select('categoria, valor, status, polo_id')
      .in('status', ['PENDENTE', 'VENCIDO']);

    if (isFiltered) {
      if (poloId === PRINCIPAL_POLO_ID) {
        queryPag = queryPag.or(`polo_id.eq.${PRINCIPAL_POLO_ID},polo_id.is.null`);
      } else {
        queryPag = queryPag.eq('polo_id', poloId);
      }
    }

    const { data: pagData, error: pagError } = await queryPag;
    if (pagError) {
      console.error('Erro ao buscar contas a pagar no Caixa:', pagError);
      throw pagError;
    }

    let totalPagar = 0;
    const pagarMap: { [key: string]: number } = {
      DESPESA_VARIAVEL: 0,
      DESPESA_ADMINISTRATIVA: 0,
      OUTRAS_DESPESAS: 0,
      ADIANTAMENTO_CEDIDO: 0
    };

    (pagData || []).forEach((row: any) => {
      const valor = Number(row.valor || 0);
      const cat = row.categoria || 'OUTRAS_DESPESAS';
      
      totalPagar += valor;
      if (pagarMap[cat] !== undefined) {
        pagarMap[cat] += valor;
      } else {
        pagarMap[cat] = valor;
      }
    });

    const pagarPorTipo = Object.keys(pagarMap).map(key => ({
      categoria: key,
      valor: pagarMap[key]
    }));

    // 4. Fluxo Consolidado dos Últimos 3 Meses
    const fluxoMensalRaw = await financeiroService.getFluxoConsolidado3Meses(
      isFiltered ? poloId : undefined
    );
    const fluxo3Meses = fluxoMensalRaw.map(f => ({
      mesNome: `${f.mesNome}/${f.ano}`,
      creditos: f.creditos,
      debitos: f.debitos
    }));

    return {
      saldoTotalContas,
      saldosIndividuais: mappedSaldos,
      totalReceber,
      receberPorTipo,
      totalPagar,
      pagarPorTipo,
      mensalidadesEmAtraso: {
        quantidade: mensalidadesAtrasoCount,
        valorTotal: mensalidadesAtrasoValor
      },
      fluxo3Meses
    };
  }
};
