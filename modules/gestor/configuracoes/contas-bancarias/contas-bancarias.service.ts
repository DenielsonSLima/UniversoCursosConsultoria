
import { supabase } from '../../../../lib/supabase';

// Helper de mapeamento: Banco -> Frontend
function mapAccountToFrontend(db: any) {
  if (!db) return null;
  return {
    id: db.id,
    poloId: db.polo_id,
    companyId: db.polo_id, // mantido para compatibilidade com partes antigas do front se houver
    banco: db.banco,
    titular: db.titular,
    agencia: db.agencia,
    conta: db.conta,
    tipo: db.tipo,
    saldoInicial: db.saldo_inicial,
    dataSaldo: db.data_saldo,
    ativo: db.ativo
  };
}

// Helper de mapeamento: Frontend -> Banco
function mapAccountToDatabase(fe: any) {
  if (!fe) return null;
  return {
    polo_id: fe.poloId || fe.companyId,
    banco: fe.banco,
    titular: fe.titular,
    agencia: fe.agencia,
    conta: fe.conta,
    tipo: fe.tipo,
    saldo_inicial: fe.saldoInicial !== undefined ? Number(fe.saldoInicial) : 0,
    data_saldo: fe.dataSaldo || null,
    ativo: fe.ativo !== undefined ? fe.ativo : true
  };
}

// Auxiliar para update
function mapToDatabaseUpdate(fe: any) {
  const data: any = {};
  if (fe.banco !== undefined) data.banco = fe.banco;
  if (fe.titular !== undefined) data.titular = fe.titular;
  if (fe.agencia !== undefined) data.agencia = fe.agencia;
  if (fe.conta !== undefined) data.conta = fe.conta;
  if (fe.tipo !== undefined) data.tipo = fe.tipo;
  if (fe.saldoInicial !== undefined) data.saldo_inicial = Number(fe.saldoInicial);
  if (fe.dataSaldo !== undefined) data.data_saldo = fe.dataSaldo || null;
  if (fe.ativo !== undefined) data.ativo = fe.ativo;
  return data;
}

export const contasBancariasService = {
  /**
   * Retorna todos os polos com o contador de contas vinculadas.
   */
  async getCompanies(): Promise<any[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, cnpj, status, contas_bancarias(count)')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar polos com contas:', error);
      throw new Error(error.message);
    }

    return (data || []).map(p => ({
      id: p.id,
      nomeFantasia: p.nome,
      cnpj: p.cnpj,
      ativo: p.status === 'ativo',
      contasCount: p.contas_bancarias?.[0]?.count || 0
    }));
  },

  /**
   * Retorna as contas bancárias de um polo específico.
   */
  async getAccountsByCompany(poloId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('contas_bancarias')
      .select('*')
      .eq('polo_id', poloId)
      .order('banco', { ascending: true });

    if (error) {
      console.error('Erro ao buscar contas do polo:', error);
      throw new Error(error.message);
    }

    return (data || []).map(mapAccountToFrontend);
  },

  /**
   * Cria uma nova conta bancária.
   */
  async createAccount(data: any) {
    const dbData = mapAccountToDatabase(data);
    const { data: created, error } = await supabase
      .from('contas_bancarias')
      .insert(dbData)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar conta:', error);
      throw new Error(error.message);
    }

    return mapAccountToFrontend(created);
  },

  /**
   * Atualiza os dados de uma conta bancária.
   */
  async updateAccount(id: string, data: any) {
    const dbData = mapToDatabaseUpdate(data);
    const { error } = await supabase
      .from('contas_bancarias')
      .update(dbData)
      .eq('id', id);

    if (error) {
      console.error('Erro ao atualizar conta:', error);
      throw new Error(error.message);
    }

    return true;
  },

  /**
   * Exclui uma conta bancária.
   */
  async deleteAccount(id: string) {
    const { error } = await supabase
      .from('contas_bancarias')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir conta:', error);
      throw new Error(error.message);
    }

    return true;
  },

  /**
   * Alterna o status ativo/inativo de um polo.
   */
  async toggleCompanyStatus(id: string, status: boolean) {
    const { error } = await supabase
      .from('polos')
      .update({ status: status ? 'ativo' : 'inativo' })
      .eq('id', id);

    if (error) {
      console.error('Erro ao alternar status do polo:', error);
      throw new Error(error.message);
    }

    return true;
  },

  /**
   * Alterna o status ativo/inativo de uma conta bancária.
   */
  async toggleAccountStatus(id: string, status: boolean) {
    const { error } = await supabase
      .from('contas_bancarias')
      .update({ ativo: status })
      .eq('id', id);

    if (error) {
      console.error('Erro ao alternar status da conta:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
