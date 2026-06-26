// File: modules/gestor/secretaria/secretaria.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../lib/supabase';

export interface Solicitacao {
  id: string;
  alunoId: string;
  alunoNome: string;
  alunoMatricula: string;
  curso: string;
  tipo: 'Histórico Escolar' | 'Declaração IRPF' | 'Transferência';
  dataSolicitacao: string;
  prazo: string;
  status: 'Pendente' | 'Deferido' | 'Indeferido';
  resposta?: string;
  respostaData?: string;
}

export interface PrazoConfig {
  prazo: string;
  descricao: string;
}

export const DEFAULT_PRAZOS: Record<string, PrazoConfig> = {
  'Histórico Escolar': { prazo: '48 horas', descricao: 'O Histórico Escolar oficial consolida todas as disciplinas do curso, notas, cargas horárias e frequência. Emissão via PDF em até 48 horas.' },
  'Declaração IRPF': { prazo: '48 horas', descricao: 'A declaração financeira de Imposto de Renda fornece o relatório de todas as mensalidades quitadas no ano-calendário anterior para dedução fiscal de instrução escolar. Emissão em até 48 horas.' },
  'Transferência': { prazo: '3 dias úteis', descricao: 'A solicitação de transferência prepara a sua pasta acadêmica (incluindo guia de transferência e notas acumuladas) para submissão à outra instituição. Prazo regulamentar de 3 dias úteis.' }
};

// Helper: convert DB row to frontend Solicitacao
function rowToSolicitacao(row: any): Solicitacao {
  return {
    id: row.id,
    alunoId: row.aluno_id,
    alunoNome: row.aluno_nome,
    alunoMatricula: row.aluno_matricula,
    curso: row.curso,
    tipo: row.tipo,
    dataSolicitacao: row.data_solicitacao,
    prazo: row.prazo,
    status: row.status,
    resposta: row.resposta,
    respostaData: row.resposta_data,
  };
}

export const secretariaService = {
  // ── SOLICITAÇÕES ────────────────────────────────────────────────────────────

  async getSolicitacoes(): Promise<Solicitacao[]> {
    try {
      const { data, error } = await supabase
        .from('secretaria_solicitacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(rowToSolicitacao);
    } catch (e) {
      console.error('[secretariaService] Erro ao buscar solicitações:', e);
      return [];
    }
  },

  async getSolicitacoesByAluno(alunoId: string): Promise<Solicitacao[]> {
    try {
      const { data, error } = await supabase
        .from('secretaria_solicitacoes')
        .select('*')
        .eq('aluno_id', alunoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(rowToSolicitacao);
    } catch (e) {
      console.error('[secretariaService] Erro ao buscar solicitações do aluno:', e);
      return [];
    }
  },

  async createSolicitacao(sol: Omit<Solicitacao, 'id'>): Promise<Solicitacao | null> {
    try {
      const { data, error } = await supabase
        .from('secretaria_solicitacoes')
        .insert({
          aluno_id: sol.alunoId,
          aluno_nome: sol.alunoNome,
          aluno_matricula: sol.alunoMatricula,
          curso: sol.curso,
          tipo: sol.tipo,
          data_solicitacao: sol.dataSolicitacao,
          prazo: sol.prazo,
          status: sol.status,
        })
        .select()
        .single();

      if (error) throw error;
      return rowToSolicitacao(data);
    } catch (e) {
      console.error('[secretariaService] Erro ao criar solicitação:', e);
      return null;
    }
  },

  async updateSolicitacao(id: string, updates: Partial<Solicitacao>): Promise<boolean> {
    try {
      const dbUpdates: any = { updated_at: new Date().toISOString() };
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.resposta !== undefined) dbUpdates.resposta = updates.resposta;
      if (updates.respostaData !== undefined) dbUpdates.resposta_data = updates.respostaData;

      const { error } = await supabase
        .from('secretaria_solicitacoes')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[secretariaService] Erro ao atualizar solicitação:', e);
      return false;
    }
  },

  // ── CONFIGURAÇÃO DE PRAZOS ─────────────────────────────────────────────────

  async getPrazos(): Promise<Record<string, PrazoConfig>> {
    try {
      const { data, error } = await supabase
        .from('secretaria_config')
        .select('conteudo')
        .eq('id', 'prazos_documentos')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo as Record<string, PrazoConfig>;
      }
    } catch (e) {
      console.error('[secretariaService] Erro ao buscar prazos:', e);
    }

    return DEFAULT_PRAZOS;
  },

  async savePrazos(prazos: Record<string, PrazoConfig>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('secretaria_config')
        .upsert({
          id: 'prazos_documentos',
          conteudo: prazos,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[secretariaService] Erro ao salvar prazos:', e);
      return false;
    }
  },

  async getSystemUsers(): Promise<Record<string, string>> {
    try {
      const { data, error } = await supabase
        .from('usuarios_sistema')
        .select('id, nome');
      
      if (error) throw error;
      
      const userMap: Record<string, string> = {};
      (data || []).forEach((u: any) => {
        userMap[u.id] = u.nome;
      });
      return userMap;
    } catch (e) {
      console.error('[secretariaService] Erro ao buscar usuários do sistema:', e);
      return {};
    }
  },

  async getEmissoesPaginadas(params: {
    documento?: string;
    search?: string;
    turmaId?: string;
    poloId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: any[]; total: number }> {
    try {
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;

      let query = supabase
        .from('documentos_validacao')
        .select(`
          *,
          aluno:parceiros(id, nome, cpf_cnpj),
          matricula:matriculas(
            id,
            status,
            turma:turmas(id, nome, codigo)
          )
        `, { count: 'exact' });

      if (params.documento && params.documento !== 'todos') {
        query = query.eq('documento', params.documento);
      }

      if (params.poloId) {
        query = query.eq('polo_id', params.poloId);
      }

      if (params.turmaId && params.turmaId !== 'todos') {
        query = query.eq('matriculas.turma_id', params.turmaId);
      }

      if (params.search) {
        const cleanSearch = params.search.trim();
        query = query.or(`codigo.ilike.%${cleanSearch}%,dados_emissao->>studentName.ilike.%${cleanSearch}%,dados_emissao->>studentCpf.ilike.%${cleanSearch}%`);
      }

      const { data, count, error } = await query
        .order('ultima_emissao_em', { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        data: data || [],
        total: count || 0
      };
    } catch (e) {
      console.error('[secretariaService] Erro ao buscar emissões paginadas:', e);
      return { data: [], total: 0 };
    }
  }
};

