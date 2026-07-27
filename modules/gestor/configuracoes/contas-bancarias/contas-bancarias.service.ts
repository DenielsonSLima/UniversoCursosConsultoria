
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
    ativo: db.ativo,
    natureza: db.natureza || 'BANCARIA',
    systemManaged: db.system_managed === true,
    polosUso: (db.contas_bancarias_polos || []).map((item: any) => item.polo_id),
  };
}

export const contasBancariasService = {
  /**
   * Retorna todos os polos com o contador de contas vinculadas.
   */
  async getCompanies(): Promise<any[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, cnpj, cidade, estado, status, is_matriz, contas_bancarias(count)')
      .order('is_matriz', { ascending: false })
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar polos com contas:', error);
      throw new Error(error.message);
    }

    return (data || []).map(p => ({
      id: p.id,
      nomeFantasia: p.nome,
      cnpj: p.cnpj,
      cidade: p.cidade,
      estado: p.estado,
      isMatriz: p.is_matriz === true,
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
      .select('*, contas_bancarias_polos(polo_id)')
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
    const { data: createdId, error } = await supabase.rpc('salvar_conta_bancaria_secure', {
      p_polo_id: data.poloId || data.companyId,
      p_banco: data.banco || '',
      p_titular: data.titular || '',
      p_agencia: data.agencia || '',
      p_conta: data.conta || '',
      p_tipo: data.tipo || 'Corrente',
      p_polos_uso: data.polosUso || [data.poloId || data.companyId],
      p_ativo: data.ativo !== false,
      p_conta_id: null,
    });

    if (error) {
      console.error('Erro ao criar conta:', error);
      throw new Error(error.message);
    }

    return createdId;
  },

  /**
   * Atualiza os dados de uma conta bancária.
   */
  async updateAccount(id: string, data: any) {
    const { error } = await supabase.rpc('salvar_conta_bancaria_secure', {
      p_polo_id: data.poloId || data.companyId,
      p_banco: data.banco || '',
      p_titular: data.titular || '',
      p_agencia: data.agencia || '',
      p_conta: data.conta || '',
      p_tipo: data.tipo || 'Corrente',
      p_polos_uso: data.polosUso || [data.poloId || data.companyId],
      p_ativo: data.ativo !== false,
      p_conta_id: id,
    });

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
    const { error } = await supabase.rpc('excluir_conta_bancaria_secure', {
      p_conta_id: id,
    });

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
    const { error } = await supabase.rpc('definir_status_conta_bancaria_secure', {
      p_conta_id: id,
      p_ativo: status,
    });

    if (error) {
      console.error('Erro ao alternar status da conta:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
