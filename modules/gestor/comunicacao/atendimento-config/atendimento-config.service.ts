import { supabase } from '../../../../lib/supabase';
import type {
  AtendimentoConfig,
  AtendimentoResponsavel,
  AtendimentoWorkspace,
} from './atendimento-config.types';

export const atendimentoConfigKeys = {
  all: ['comunicacao', 'atendimento-config'] as const,
  workspace: (poloId: string | null) => ['comunicacao', 'atendimento-config', 'workspace', poloId || 'todos'] as const,
};

const getWorkspace = async (poloId: string | null): Promise<AtendimentoWorkspace> => {
  let polosQuery = supabase
    .from('polos')
    .select('id, nome, cidade, estado, is_matriz')
    .eq('status', 'ativo')
    .order('is_matriz', { ascending: false })
    .order('nome');
  if (poloId) polosQuery = polosQuery.eq('id', poloId);

  const { data: polos, error: polosError } = await polosQuery;
  if (polosError) throw polosError;
  const poloIds = (polos || []).map((polo) => polo.id);
  if (poloIds.length === 0) return { polos: [], configs: [], usuarios: [], responsaveis: [] };

  const [configsResult, usuariosResult, responsaveisResult] = await Promise.all([
    supabase.from('comunicacao_atendimento_config').select('*').in('polo_id', poloIds),
    supabase
      .from('usuarios_sistema')
      .select('id, nome, email, setor_comunicacao, polo_comunicacao_id, polo_ids, pode_visualizar_todos_polos, foto_path')
      .eq('status', 'Ativo')
      .order('nome'),
    supabase.from('comunicacao_atendentes_polos').select('*').in('polo_id', poloIds).order('prioridade'),
  ]);
  if (configsResult.error) throw configsResult.error;
  if (usuariosResult.error) throw usuariosResult.error;
  if (responsaveisResult.error) throw responsaveisResult.error;

  return {
    polos: polos || [],
    configs: (configsResult.data || []) as AtendimentoConfig[],
    usuarios: usuariosResult.data || [],
    responsaveis: (responsaveisResult.data || []) as AtendimentoResponsavel[],
  };
};

const saveConfig = async (config: AtendimentoConfig) => {
  const { id: _id, updated_at: _updatedAt, ...payload } = config;
  const { data, error } = await supabase
    .from('comunicacao_atendimento_config')
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: 'polo_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data as AtendimentoConfig;
};

const addResponsavel = async (input: Omit<AtendimentoResponsavel, 'id'>) => {
  const { data, error } = await supabase
    .from('comunicacao_atendentes_polos')
    .upsert(input, { onConflict: 'polo_id,usuario_id,setor' })
    .select('*')
    .single();
  if (error) throw error;
  return data as AtendimentoResponsavel;
};

const removeResponsavel = async (id: string) => {
  const { error } = await supabase.from('comunicacao_atendentes_polos').delete().eq('id', id);
  if (error) throw error;
};

export const atendimentoConfigService = {
  addResponsavel,
  getWorkspace,
  removeResponsavel,
  saveConfig,
};

