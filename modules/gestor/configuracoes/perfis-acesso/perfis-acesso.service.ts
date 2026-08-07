import { supabase } from '../../../../lib/supabase';
import type { DashboardWidgetId } from '../../access-control';

export type PerfilSetorComunicacao =
  | 'todos'
  | 'pedagogico_coordenacao'
  | 'financeiro'
  | 'comercial_matriculas'
  | 'secretaria'
  | 'atendimento_geral';

export interface PerfilCommunicationScope {
  sector: PerfilSetorComunicacao;
  poloId: string | null;
  canViewAll: boolean;
}

export interface PerfilAcesso {
  id?: string;
  nome: string;
  descricao?: string;
  permissoes: {
    modules: string[];
    financeiroTabs?: string[];
    dashboardWidgets?: DashboardWidgetId[];
    tabs?: Record<string, string[]>;
    allPolos: boolean;
    poloIds?: string[];
    communicationScope?: PerfilCommunicationScope;
  };
  restricao_horario: {
    dias: number[];
    horario_inicio: string;
    horario_fim: string;
    ativo: boolean;
  };
  created_at?: string;
}

export const perfisAcessoService = {
  async getAll(): Promise<PerfilAcesso[]> {
    const { data, error } = await supabase
      .from('perfis_acesso')
      .select('*')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar perfis de acesso:', error);
      throw new Error(error.message);
    }
    return data || [];
  },

  async getById(id: string): Promise<PerfilAcesso> {
    const { data, error } = await supabase
      .from('perfis_acesso')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error(`Erro ao buscar perfil de acesso ${id}:`, error);
      throw new Error(error.message);
    }
    return data;
  },

  async create(perfil: Omit<PerfilAcesso, 'id' | 'created_at'>): Promise<PerfilAcesso> {
    const { data, error } = await supabase
      .from('perfis_acesso')
      .insert(perfil)
      .select('*')
      .single();

    if (error) {
      console.error('Erro ao criar perfil de acesso:', error);
      throw new Error(error.message);
    }
    return data;
  },

  async update(id: string, perfil: Partial<PerfilAcesso>): Promise<PerfilAcesso> {
    const { data, error } = await supabase
      .from('perfis_acesso')
      .update(perfil)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error(`Erro ao atualizar perfil de acesso ${id}:`, error);
      throw new Error(error.message);
    }
    return data;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('perfis_acesso')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Erro ao excluir perfil de acesso ${id}:`, error);
      throw new Error(error.message);
    }
    return true;
  }
};
