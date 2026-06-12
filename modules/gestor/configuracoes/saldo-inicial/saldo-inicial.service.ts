import { supabase } from '../../../../lib/supabase';

// Helper de mapeamento: Banco -> Frontend para contas bancárias
function mapAccountToFrontend(db: any) {
  if (!db) return null;
  return {
    id: db.id,
    companyId: db.polo_id, // mantido para compatibilidade com a UI que usa companyId
    banco: db.banco,
    titular: db.titular,
    agencia: db.agencia,
    conta: db.conta,
    tipo: db.tipo,
    saldoInicial: Number(db.saldo_inicial || 0),
    dataSaldo: db.data_saldo || '',
    ativo: db.ativo
  };
}

export const saldoInicialService = {
  /**
   * Retorna todos os polos cadastrados no sistema.
   */
  async getCompanies(): Promise<any[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, cnpj, status')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar polos para saldo inicial:', error);
      throw new Error(error.message);
    }

    return (data || []).map(p => ({
      id: p.id,
      nomeFantasia: p.nome,
      cnpj: p.cnpj,
      ativo: p.status === 'ativo'
    }));
  },

  /**
   * Retorna as contas de um polo específico.
   */
  async getAccountsByCompany(poloId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('contas_bancarias')
      .select('*')
      .eq('polo_id', poloId)
      .order('banco', { ascending: true });

    if (error) {
      console.error('Erro ao buscar contas do polo para saldo inicial:', error);
      throw new Error(error.message);
    }

    return (data || []).map(mapAccountToFrontend);
  },

  /**
   * Atualiza o saldo inicial e a data de saldo de uma conta bancária.
   */
  async updateInitialBalance(accountId: string, value: number, date: string): Promise<boolean> {
    const { error } = await supabase
      .from('contas_bancarias')
      .update({
        saldo_inicial: value,
        data_saldo: date || null
      })
      .eq('id', accountId);

    if (error) {
      console.error('Erro ao atualizar saldo inicial:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
