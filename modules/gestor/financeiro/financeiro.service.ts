// File: modules/gestor/financeiro/financeiro.service.ts

import { supabase } from '../../../lib/supabase';
import { asaasIntegrationService } from '../../asaas/asaas.service';

export interface ContaBancaria {
  id?: string;
  banco: string;
  titular: string;
  agencia: string;
  conta: string;
  tipo: string;
  poloId: string;
  poloNome?: string;
  saldoInicial: number;
  dataSaldo?: string;
  ativo?: boolean;
  saldoAtual?: number;
  recebido?: number;
  pago?: number;
}

export interface ContasReceber {
  id?: string;
  poloId: string;
  poloNome?: string;
  poloCnpj?: string;
  poloCidade?: string;
  poloUf?: string;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'SUSPENSO' | 'ESTORNADO' | 'CANCELADO' | 'DEVOLVIDO';
  categoria: 'MENSALIDADE' | 'OUTROS_CREDITOS' | 'ADIANTAMENTO_TOMADO';
  clienteId?: string;
  clienteNome?: string;
  clienteCpfCnpj?: string;
  matriculaId?: string;
  turmaId?: string;
  formaPagamento?: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
  origemPagamento?: string;
  contaBancariaId?: string;
  nossoNumeroAsaas?: string;
  asaasPaymentId?: string;
  asaasInvoiceUrl?: string;
  asaasBankSlipUrl?: string;
  asaasInstallmentId?: string;
  asaasStatus?: string;
  asaasLastError?: string;
  createdAt?: string;
  tipoLancamento?: 'MATRICULA' | 'PARCELA' | 'REMATRICULA';
  parcelaNumero?: number;
  origemCronogramaId?: string;
  turmaNome?: string;
  cursoNome?: string;
}

export interface ContasPagar {
  id?: string;
  poloId: string;
  poloNome?: string;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'ESTORNADO' | 'CANCELADO';
  categoria: 'DESPESA_VARIAVEL' | 'DESPESA_ADMINISTRATIVA' | 'OUTRAS_DESPESAS' | 'ADIANTAMENTO_CEDIDO';
  fornecedorId?: string;
  fornecedorNome?: string;
  formaPagamento?: 'BOLETO' | 'PIX' | 'TED' | 'DINHEIRO';
  contaBancariaId?: string;
  createdAt?: string;
}

export interface TransferenciaConta {
  id?: string;
  poloId: string;
  poloNome?: string;
  contaOrigemId: string;
  contaOrigemNome?: string;
  contaDestinoId: string;
  contaDestinoNome?: string;
  valor: number;
  dataTransferencia: string;
  observacao?: string;
  createdAt?: string;
}

export interface FluxoMensal {
  mes: string;
  ano: number;
  mesNome: string;
  creditos: number;
  debitos: number;
  atrasoReceber: number;
  atrasoPagar: number;
}

export interface FinanceiroSummary {
  totalRecebido: number;
  totalAReceber: number;
  totalPago: number;
  totalAPagar: number;
  saldoCaixa: number;
}

export const financeiroService = {
  // 1. Bancos & Saldos (Sem criação de conta aqui - agora é em configurações)
  async getContasBancariasSaldos(): Promise<ContaBancaria[]> {
    const { data, error } = await supabase.rpc('get_contas_bancarias_saldos');
    if (error) {
      console.error('Erro ao buscar contas bancárias e saldos:', error);
      throw error;
    }
    return (data || []).map((cb: any) => ({
      id: cb.id,
      banco: cb.banco,
      titular: cb.titular,
      agencia: cb.agencia,
      conta: cb.conta,
      tipo: cb.tipo,
      poloId: cb.polo_id,
      poloNome: cb.polo_name || cb.polo_nome || '',
      saldoInicial: Number(cb.saldo_inicial),
      saldoAtual: Number(cb.saldo_atual),
      recebido: Number(cb.recebido),
      pago: Number(cb.pago),
      ativo: cb.ativo
    }));
  },

  // 2. Resumos Financeiros & Consolidação de 3 Meses
  async getFinanceiroSummary(
    poloId?: string,
    dataInicio?: string,
    dataFim?: string
  ): Promise<FinanceiroSummary> {
    const { data, error } = await supabase.rpc('get_financeiro_summary', {
      p_polo_id: poloId || null,
      p_data_inicio: dataInicio || '1970-01-01',
      p_data_fim: dataFim || '2999-12-31'
    });
    if (error) {
      console.error('Erro ao obter resumo financeiro:', error);
      throw error;
    }
    const res = data?.[0] || {};
    return {
      totalRecebido: Number(res.total_recebido || 0),
      totalAReceber: Number(res.total_a_receber || 0),
      totalPago: Number(res.total_pago || 0),
      totalAPagar: Number(res.total_a_pagar || 0),
      saldoCaixa: Number(res.saldo_caixa || 0)
    };
  },

  async getFluxoConsolidado3Meses(poloId?: string): Promise<FluxoMensal[]> {
    const { data, error } = await supabase.rpc('get_fluxo_consolidado_3_meses', {
      p_polo_id: poloId || null
    });
    if (error) {
      console.error('Erro ao obter fluxo consolidado de 3 meses:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      mes: row.mes,
      ano: Number(row.ano),
      mesNome: row.mes_nome,
      creditos: Number(row.creditos || 0),
      debitos: Number(row.debitos || 0),
      atrasoReceber: Number(row.atraso_receber || 0),
      atrasoPagar: Number(row.atraso_pagar || 0)
    }));
  },

  // 3. Contas a Receber (Receitas)
  async getContasReceber(filters?: { poloId?: string; status?: string; categoria?: string }): Promise<ContasReceber[]> {
    let query = supabase
      .from('contas_receber')
      .select('*, parceiros(nome, cpf_cnpj), polos(nome, cnpj, cidade, estado)');

    if (filters?.poloId && filters.poloId !== 'todos') {
      query = query.eq('polo_id', filters.poloId);
    }
    if (filters?.status && filters.status !== 'todos') {
      query = query.eq('status', filters.status);
    }
    if (filters?.categoria && filters.categoria !== 'todos') {
      query = query.eq('categoria', filters.categoria);
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });
    if (error) {
      console.error('Erro ao buscar contas a receber:', error);
      throw error;
    }

    return (data || []).map((cr: any) => ({
      id: cr.id,
      poloId: cr.polo_id,
      poloNome: cr.polos?.nome || '',
      poloCnpj: cr.polos?.cnpj || '',
      poloCidade: cr.polos?.cidade || '',
      poloUf: cr.polos?.estado || '',
      descricao: cr.descricao,
      valor: Number(cr.valor),
      dataVencimento: cr.data_vencimento,
      dataPagamento: cr.data_pagamento,
      valorPago: cr.valor_pago ? Number(cr.valor_pago) : undefined,
      status: cr.status,
      categoria: cr.categoria,
      clienteId: cr.cliente_id,
      clienteNome: cr.parceiros?.nome || 'Cliente Geral',
      clienteCpfCnpj: cr.parceiros?.cpf_cnpj || '',
      matriculaId: cr.matricula_id,
      turmaId: cr.turma_id,
      formaPagamento: cr.forma_pagamento,
      origemPagamento: cr.origem_pagamento,
      contaBancariaId: cr.conta_bancaria_id,
      nossoNumeroAsaas: cr.nosso_numero_asaas,
      asaasPaymentId: cr.asaas_payment_id,
      asaasInvoiceUrl: cr.asaas_invoice_url,
      asaasBankSlipUrl: cr.asaas_bank_slip_url,
      asaasInstallmentId: cr.asaas_installment_id,
      asaasStatus: cr.asaas_status,
      asaasLastError: cr.asaas_last_error,
      createdAt: cr.created_at,
      tipoLancamento: cr.tipo_lancamento,
      parcelaNumero: cr.parcela_numero,
      origemCronogramaId: cr.origem_cronograma_id,
    }));
  },

  async getReceivablesByModality(modality: 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO'): Promise<ContasReceber[]> {
    const { data, error } = await supabase
      .from('contas_receber')
      .select(`
        *,
        parceiros(nome, cpf_cnpj),
        polos(nome, cnpj, cidade, estado),
        turmas!inner(
          nome,
          codigo,
          cursos!inner(nome, modalidade)
        )
      `)
      .eq('categoria', 'MENSALIDADE')
      .eq('turmas.cursos.modalidade', modality)
      .order('data_vencimento', { ascending: true });

    if (error) {
      console.error(`Erro ao buscar recebíveis da modalidade ${modality}:`, error);
      throw error;
    }

    return (data || []).map((cr: any) => ({
      id: cr.id,
      poloId: cr.polo_id,
      poloNome: cr.polos?.nome || '',
      poloCnpj: cr.polos?.cnpj || '',
      poloCidade: cr.polos?.cidade || '',
      poloUf: cr.polos?.estado || '',
      descricao: cr.descricao,
      valor: Number(cr.valor),
      dataVencimento: cr.data_vencimento,
      dataPagamento: cr.data_pagamento,
      valorPago: cr.valor_pago === null ? undefined : Number(cr.valor_pago),
      status: cr.status,
      categoria: cr.categoria,
      clienteId: cr.cliente_id,
      clienteNome: cr.parceiros?.nome || 'Aluno',
      clienteCpfCnpj: cr.parceiros?.cpf_cnpj || '',
      matriculaId: cr.matricula_id,
      turmaId: cr.turma_id,
      turmaNome: cr.turmas?.nome || '',
      cursoNome: cr.turmas?.cursos?.nome || '',
      formaPagamento: cr.forma_pagamento,
      origemPagamento: cr.origem_pagamento,
      contaBancariaId: cr.conta_bancaria_id,
      nossoNumeroAsaas: cr.nosso_numero_asaas,
      asaasPaymentId: cr.asaas_payment_id,
      asaasInvoiceUrl: cr.asaas_invoice_url,
      asaasBankSlipUrl: cr.asaas_bank_slip_url,
      asaasInstallmentId: cr.asaas_installment_id,
      asaasStatus: cr.asaas_status,
      asaasLastError: cr.asaas_last_error,
      tipoLancamento: cr.tipo_lancamento,
      parcelaNumero: cr.parcela_numero,
      origemCronogramaId: cr.origem_cronograma_id,
      createdAt: cr.created_at,
    }));
  },

  async getTechnicalReceivables(): Promise<ContasReceber[]> {
    return this.getReceivablesByModality('TECNICO');
  },

  async createReceivable(cr: Omit<ContasReceber, 'id'>): Promise<void> {
    const { error } = await supabase.from('contas_receber').insert({
      polo_id: cr.poloId,
      descricao: cr.descricao,
      valor: cr.valor,
      data_vencimento: cr.dataVencimento,
      status: cr.status || 'PENDENTE',
      categoria: cr.categoria,
      cliente_id: cr.clienteId || null,
      matricula_id: cr.matriculaId || null,
      turma_id: cr.turmaId || null,
      forma_pagamento: cr.formaPagamento || null,
      conta_bancaria_id: cr.contaBancariaId || null,
      nosso_numero_asaas: cr.nossoNumeroAsaas || null
    });
    if (error) {
      console.error('Erro ao criar conta a receber:', error);
      throw error;
    }
  },

  async getOutrosCreditos(): Promise<ContasReceber[]> {
    return this.getContasReceber({ categoria: 'OUTROS_CREDITOS' });
  },

  async createOtherCredit(input: {
    poloId: string;
    descricao: string;
    valor: number;
    dataVencimento: string;
    clienteId?: string;
    formaPagamento?: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
    contaBancariaId?: string;
    markAsPaid?: boolean;
    generateAsaas?: boolean;
  }): Promise<ContasReceber> {
    if (input.generateAsaas && !input.clienteId) {
      throw new Error('Selecione um parceiro cadastrado para gerar cobrança no Asaas.');
    }

    const payload = {
      polo_id: input.poloId,
      descricao: input.descricao,
      valor: input.valor,
      data_vencimento: input.dataVencimento,
      status: input.markAsPaid ? 'PAGO' : 'PENDENTE',
      categoria: 'OUTROS_CREDITOS',
      cliente_id: input.clienteId || null,
      forma_pagamento: input.formaPagamento || null,
      conta_bancaria_id: input.contaBancariaId || null,
      valor_pago: input.markAsPaid ? input.valor : null,
      data_pagamento: input.markAsPaid ? input.dataVencimento : null,
      origem_pagamento: input.markAsPaid ? 'PRESENCIAL' : (input.generateAsaas ? 'ASAAS' : 'LOCAL'),
    };

    const { data, error } = await supabase
      .from('contas_receber')
      .insert(payload)
      .select(`
        *,
        parceiros(nome, cpf_cnpj),
        polos(nome, cnpj, cidade, estado)
      `)
      .single();

    if (error) {
      console.error('Erro ao criar outro crédito:', error);
      throw error;
    }

    if (input.generateAsaas && data?.id) {
      await asaasIntegrationService.syncReceivable(data.id);
      const { data: synced, error: syncFetchError } = await supabase
        .from('contas_receber')
        .select(`
          *,
          parceiros(nome, cpf_cnpj),
          polos(nome, cnpj, cidade, estado)
        `)
        .eq('id', data.id)
        .single();
      if (syncFetchError) throw syncFetchError;
      return {
        id: synced.id,
        poloId: synced.polo_id,
        poloNome: synced.polos?.nome || '',
        poloCnpj: synced.polos?.cnpj || '',
        poloCidade: synced.polos?.cidade || '',
        poloUf: synced.polos?.estado || '',
        descricao: synced.descricao,
        valor: Number(synced.valor),
        dataVencimento: synced.data_vencimento,
        dataPagamento: synced.data_pagamento,
        valorPago: synced.valor_pago === null ? undefined : Number(synced.valor_pago),
        status: synced.status,
        categoria: synced.categoria,
        clienteId: synced.cliente_id,
        clienteNome: synced.parceiros?.nome || 'Cliente Geral',
        clienteCpfCnpj: synced.parceiros?.cpf_cnpj || '',
        formaPagamento: synced.forma_pagamento,
        origemPagamento: synced.origem_pagamento,
        contaBancariaId: synced.conta_bancaria_id,
        nossoNumeroAsaas: synced.nosso_numero_asaas,
        asaasPaymentId: synced.asaas_payment_id,
        asaasInvoiceUrl: synced.asaas_invoice_url,
        asaasBankSlipUrl: synced.asaas_bank_slip_url,
        asaasInstallmentId: synced.asaas_installment_id,
        asaasStatus: synced.asaas_status,
        asaasLastError: synced.asaas_last_error,
        createdAt: synced.created_at,
      };
    }

    return {
      id: data.id,
      poloId: data.polo_id,
      poloNome: data.polos?.nome || '',
      poloCnpj: data.polos?.cnpj || '',
      poloCidade: data.polos?.cidade || '',
      poloUf: data.polos?.estado || '',
      descricao: data.descricao,
      valor: Number(data.valor),
      dataVencimento: data.data_vencimento,
      dataPagamento: data.data_pagamento,
      valorPago: data.valor_pago === null ? undefined : Number(data.valor_pago),
      status: data.status,
      categoria: data.categoria,
      clienteId: data.cliente_id,
      clienteNome: data.parceiros?.nome || 'Cliente Geral',
      clienteCpfCnpj: data.parceiros?.cpf_cnpj || '',
      formaPagamento: data.forma_pagamento,
      origemPagamento: data.origem_pagamento,
      contaBancariaId: data.conta_bancaria_id,
      nossoNumeroAsaas: data.nosso_numero_asaas,
      asaasPaymentId: data.asaas_payment_id,
      asaasInvoiceUrl: data.asaas_invoice_url,
      asaasBankSlipUrl: data.asaas_bank_slip_url,
      asaasInstallmentId: data.asaas_installment_id,
      asaasStatus: data.asaas_status,
      asaasLastError: data.asaas_last_error,
      createdAt: data.created_at,
    };
  },

  async markReceivablePaid(
    id: string,
    params: {
      contaBancariaId: string;
      valorPago: number;
      dataPagamento: string;
      formaPagamento: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
    }
  ): Promise<{ success: boolean; asaasCanceled?: boolean; asaasPaymentId?: string }> {
    return asaasIntegrationService.settleInPerson(id, params);
  },

  async reverseManualSettlement(
    id: string,
    params: {
      recreateAsaas?: boolean;
      reason?: string;
    } = {}
  ): Promise<{ success: boolean; receivable: any; asaasRecreated?: boolean }> {
    return asaasIntegrationService.reverseInPersonSettlement(id, params);
  },

  async deleteReceivable(id: string): Promise<void> {
    const { error } = await supabase.from('contas_receber').delete().eq('id', id);
    if (error) {
      console.error('Erro ao deletar conta a receber:', error);
      throw error;
    }
  },

  // 4. Contas a Pagar (Despesas)
  async getContasPagar(filters?: { poloId?: string; status?: string; categoria?: string }): Promise<ContasPagar[]> {
    let query = supabase
      .from('contas_pagar')
      .select('*, parceiros(nome), polos(nome)');

    if (filters?.poloId && filters.poloId !== 'todos') {
      query = query.eq('polo_id', filters.poloId);
    }
    if (filters?.status && filters.status !== 'todos') {
      query = query.eq('status', filters.status);
    }
    if (filters?.categoria && filters.categoria !== 'todos') {
      query = query.eq('categoria', filters.categoria);
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });
    if (error) {
      console.error('Erro ao buscar contas a pagar:', error);
      throw error;
    }

    return (data || []).map((cp: any) => ({
      id: cp.id,
      poloId: cp.polo_id,
      poloNome: cp.polos?.nome || '',
      descricao: cp.descricao,
      valor: Number(cp.valor),
      dataVencimento: cp.data_vencimento,
      dataPagamento: cp.data_pagamento,
      valorPago: cp.valor_pago ? Number(cp.valor_pago) : undefined,
      status: cp.status,
      categoria: cp.categoria,
      fornecedorId: cp.fornecedor_id,
      fornecedorNome: cp.parceiros?.nome || 'Fornecedor Geral',
      formaPagamento: cp.forma_pagamento,
      contaBancariaId: cp.conta_bancaria_id,
      createdAt: cp.created_at
    }));
  },

  async createPayable(cp: Omit<ContasPagar, 'id'>): Promise<void> {
    const { error } = await supabase.from('contas_pagar').insert({
      polo_id: cp.poloId,
      descricao: cp.descricao,
      valor: cp.valor,
      data_vencimento: cp.dataVencimento,
      status: cp.status || 'PENDENTE',
      categoria: cp.categoria,
      fornecedor_id: cp.fornecedorId || null,
      forma_pagamento: cp.formaPagamento || null,
      conta_bancaria_id: cp.contaBancariaId || null
    });
    if (error) {
      console.error('Erro ao criar conta a pagar:', error);
      throw error;
    }
  },

  async markPayablePaid(
    id: string,
    params: {
      contaBancariaId: string;
      valorPago: number;
      dataPagamento: string;
      formaPagamento: 'BOLETO' | 'PIX' | 'TED' | 'DINHEIRO';
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('contas_pagar')
      .update({
        status: 'PAGO',
        conta_bancaria_id: params.contaBancariaId,
        valor_pago: params.valorPago,
        data_pagamento: params.dataPagamento,
        forma_pagamento: params.formaPagamento
      })
      .eq('id', id);
    if (error) {
      console.error('Erro ao liquidar conta a pagar:', error);
      throw error;
    }
  },

  async deletePayable(id: string): Promise<void> {
    const { error } = await supabase.from('contas_pagar').delete().eq('id', id);
    if (error) {
      console.error('Erro ao deletar conta a pagar:', error);
      throw error;
    }
  },

  // 5. Transferências entre Contas
  async getTransferencias(filters?: { poloId?: string }): Promise<TransferenciaConta[]> {
    let query = supabase
      .from('transferencias_contas')
      .select('*, c_origem:contas_bancarias!conta_origem_id(*), c_destino:contas_bancarias!conta_destino_id(*), polos(nome)');

    if (filters?.poloId && filters.poloId !== 'todos') {
      query = query.eq('polo_id', filters.poloId);
    }

    const { data, error } = await query.order('data_transferencia', { ascending: false });
    if (error) {
      console.error('Erro ao buscar transferências:', error);
      throw error;
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      poloId: t.polo_id,
      poloNome: t.polos?.nome || '',
      contaOrigemId: t.conta_origem_id,
      contaOrigemNome: `${t.c_origem?.banco} (Ag: ${t.c_origem?.agencia} CC: ${t.c_origem?.conta})`,
      contaDestinoId: t.conta_destino_id,
      contaDestinoNome: `${t.c_destino?.banco} (Ag: ${t.c_destino?.agencia} CC: ${t.c_destino?.conta})`,
      valor: Number(t.valor),
      dataTransferencia: t.data_transferencia,
      observacao: t.observacao,
      createdAt: t.created_at
    }));
  },

  async createTransferencia(t: Omit<TransferenciaConta, 'id'>): Promise<void> {
    const { error } = await supabase.from('transferencias_contas').insert({
      polo_id: t.poloId,
      conta_origem_id: t.contaOrigemId,
      conta_destino_id: t.contaDestinoId,
      valor: t.valor,
      data_transferencia: t.dataTransferencia,
      observacao: t.observacao || null
    });
    if (error) {
      console.error('Erro ao registrar transferência:', error);
      throw error;
    }
  },

  async deleteTransferencia(id: string): Promise<void> {
    const { error } = await supabase.from('transferencias_contas').delete().eq('id', id);
    if (error) {
      console.error('Erro ao excluir transferência:', error);
      throw error;
    }
  },

  // 6. Auxiliares
  async getPolos(): Promise<any[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, cnpj, cidade, estado, is_matriz')
      .order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar polos no financeiro:', error);
      throw error;
    }
    return data || [];
  },

  async getParceiros(): Promise<any[]> {
    const { data, error } = await supabase
      .from('parceiros')
      .select('id, nome, tipo, cpf_cnpj, email, telefone')
      .eq('status', 'ATIVO')
      .order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar parceiros no financeiro:', error);
      throw error;
    }
    return data || [];
  },

  async getResumoKpis(poloId?: string): Promise<{ alunosAtivos: number; parcelasAtraso: number }> {
    let activeStudentsQuery = supabase
      .from('matriculas')
      .select('*, turmas!inner(polo_id)', { count: 'exact', head: true })
      .eq('status', 'ATIVO');

    if (poloId && poloId !== 'todos') {
      activeStudentsQuery = activeStudentsQuery.eq('turmas.polo_id', poloId);
    }

    const { count: activeStudents, error: err1 } = await activeStudentsQuery;
      
    if (err1) {
      console.error('Erro ao contar alunos ativos:', err1);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let overdueQuery = supabase
      .from('contas_receber')
      .select('*', { count: 'exact', head: true })
      .or(`status.eq.VENCIDO,and(status.eq.PENDENTE,data_vencimento.lt.${todayStr})`);

    if (poloId && poloId !== 'todos') {
      overdueQuery = overdueQuery.eq('polo_id', poloId);
    }

    const { count: overdueCount, error: err2 } = await overdueQuery;

    if (err2) {
      console.error('Erro ao contar parcelas em atraso:', err2);
    }

    return {
      alunosAtivos: activeStudents || 0,
      parcelasAtraso: overdueCount || 0
    };
  },

  async searchAlunoReceivables(searchQuery: string, poloId?: string): Promise<any[]> {
    let query = supabase
      .from('contas_receber')
      .select('*, parceiros!inner(nome, cpf_cnpj), polos(nome)')
      .eq('categoria', 'MENSALIDADE');

    if (poloId && poloId !== 'todos') {
      query = query.eq('polo_id', poloId);
    }

    if (searchQuery) {
      query = query.or(`descricao.ilike.%${searchQuery}%,parceiros.nome.ilike.%${searchQuery}%,parceiros.cpf_cnpj.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });
    if (error) {
      console.error('Erro ao buscar contas a receber de alunos:', error);
      throw error;
    }

    return (data || []).map((cr: any) => ({
      id: cr.id,
      poloNome: cr.polos?.nome || '',
      descricao: cr.descricao,
      valor: Number(cr.valor),
      dataVencimento: cr.data_vencimento,
      dataPagamento: cr.data_pagamento,
      status: cr.status,
      categoria: cr.categoria,
      clienteNome: cr.parceiros?.nome || 'Cliente Geral',
      clienteCpf: cr.parceiros?.cpf_cnpj || '',
      formaPagamento: cr.forma_pagamento
    }));
  }
};
