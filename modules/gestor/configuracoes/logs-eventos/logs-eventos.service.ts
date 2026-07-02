import { supabase } from '../../../../lib/supabase';

export interface SistemaEvento {
  id: string;
  dataEvento: string;
  usuarioNome: string;
  usuarioEmail?: string | null;
  usuarioTipo: string;
  pessoaNome?: string | null;
  pessoaTipo?: string | null;
  poloId?: string | null;
  poloNome?: string | null;
  modulo: string;
  entidade: string;
  acao: string;
  descricao: string;
  entidadeId?: string | null;
  origem: string;
  detalhes?: Record<string, any> | null;
  totalCount?: number;
}

export interface LogsEventosFilters {
  modulo?: string;
  actorTipo?: string;
  pessoaTipo?: string;
  poloId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface LogsEventosPage {
  items: SistemaEvento[];
  totalCount: number;
}

export interface LogsEventosPolo {
  id: string;
  nome: string;
}

const mapEvento = (row: any): SistemaEvento => ({
  id: row.id,
  dataEvento: row.data_evento,
  usuarioNome: row.usuario_nome || 'Sistema',
  usuarioEmail: row.usuario_email,
  usuarioTipo: row.usuario_tipo || 'Sistema',
  pessoaNome: row.pessoa_nome,
  pessoaTipo: row.pessoa_tipo,
  poloId: row.polo_id,
  poloNome: row.polo_nome,
  modulo: row.modulo || 'Sistema',
  entidade: row.entidade || '',
  acao: row.acao || '',
  descricao: row.descricao || '',
  entidadeId: row.entidade_id,
  origem: row.origem || 'Sistema',
  detalhes: row.detalhes || null,
  totalCount: Number(row.total_count || 0),
});

export const logsEventosService = {
  async getEventos(filters: LogsEventosFilters = {}): Promise<LogsEventosPage> {
    const { data, error } = await supabase.rpc('get_sistema_eventos', {
      p_page: filters.page || 1,
      p_page_size: filters.pageSize || 25,
      p_modulo: filters.modulo || null,
      p_actor_tipo: filters.actorTipo || null,
      p_pessoa_tipo: filters.pessoaTipo || null,
      p_polo_id: filters.poloId || null,
      p_search: filters.search?.trim() || null,
    });

    if (error) throw error;
    const items = (data || []).map(mapEvento);
    return {
      items,
      totalCount: items[0]?.totalCount || 0,
    };
  },

  async getPolos(): Promise<LogsEventosPolo[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome')
      .order('nome', { ascending: true });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      nome: row.nome,
    }));
  },
};
