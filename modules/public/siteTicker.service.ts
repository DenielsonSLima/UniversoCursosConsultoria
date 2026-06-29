import { supabase } from '../../lib/supabase';

export type SiteTickerMode = 'manual' | 'open_classes' | 'automatic_phrases';
export type SiteTickerModality = 'EAD' | 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO';
export type SiteTickerPhraseCategory = 'all' | 'motivacional' | 'reflexao';

export interface SitePublicTickerConfig {
  enabled: boolean;
  mode: SiteTickerMode;
  manualText: string;
  modalidades: SiteTickerModality[];
  cursoIds: string[];
  turmaIds: string[];
  maxItems: number;
  speedSeconds: number;
  showPolo: boolean;
  showStartDate: boolean;
  automaticCategory: SiteTickerPhraseCategory;
  updatedAt?: string;
}

export interface SiteTickerData {
  config: SitePublicTickerConfig;
  items: string[];
}

export const SITE_PUBLIC_TICKER_CONFIG_ID = 'site_publico_ticker_config';

export const DEFAULT_SITE_TICKER_CONFIG: SitePublicTickerConfig = {
  enabled: false,
  mode: 'manual',
  manualText: '',
  modalidades: ['TECNICO', 'LIVRE', 'ESPECIALIZACAO'],
  cursoIds: [],
  turmaIds: [],
  maxItems: 12,
  speedSeconds: 28,
  showPolo: true,
  showStartDate: false,
  automaticCategory: 'all',
};

const normalizeConfig = (value: any): SitePublicTickerConfig => ({
  ...DEFAULT_SITE_TICKER_CONFIG,
  ...(value || {}),
  modalidades: Array.isArray(value?.modalidades) && value.modalidades.length ? value.modalidades : DEFAULT_SITE_TICKER_CONFIG.modalidades,
  cursoIds: Array.isArray(value?.cursoIds) ? value.cursoIds : [],
  turmaIds: Array.isArray(value?.turmaIds) ? value.turmaIds : [],
  maxItems: Math.max(1, Math.min(30, Number(value?.maxItems || DEFAULT_SITE_TICKER_CONFIG.maxItems))),
  speedSeconds: Math.max(5, Math.min(90, Number(value?.speedSeconds || DEFAULT_SITE_TICKER_CONFIG.speedSeconds))),
  showPolo: value?.showPolo !== false,
  showStartDate: value?.showStartDate === true,
  automaticCategory: ['motivacional', 'reflexao', 'all'].includes(value?.automaticCategory) ? value.automaticCategory : 'all',
});

const formatDate = (value?: string | null) => {
  if (!value) return '';
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
};

const getPoloLabel = (turma: any) => {
  const polo = Array.isArray(turma?.polos) ? turma.polos[0] : turma?.polos;
  return [polo?.nome, polo?.cidade && polo?.estado ? `${polo.cidade}/${polo.estado}` : polo?.cidade || polo?.estado]
    .filter(Boolean)
    .join(' - ');
};

const isWithinEnrollmentWindow = (turma: any) => {
  const today = new Date().toISOString().slice(0, 10);
  const start = turma?.data_inicio_inscricao ? String(turma.data_inicio_inscricao).slice(0, 10) : null;
  const end = turma?.data_fim_inscricao ? String(turma.data_fim_inscricao).slice(0, 10) : null;
  return (!start || today >= start) && (!end || today <= end);
};

export const siteTickerService = {
  async getConfig(): Promise<SitePublicTickerConfig> {
    const { data, error } = await supabase
      .from('documentos_templates')
      .select('conteudo, updated_at')
      .eq('id', SITE_PUBLIC_TICKER_CONFIG_ID)
      .maybeSingle();

    if (error) throw error;
    return normalizeConfig({ ...(data?.conteudo || {}), updatedAt: data?.updated_at });
  },

  async getTickerData(): Promise<SiteTickerData | null> {
    const config = await this.getConfig();
    if (!config.enabled) return null;

    if (config.mode === 'manual') {
      const items = String(config.manualText || '')
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
      return items.length ? { config, items } : null;
    }

    if (config.mode === 'automatic_phrases') {
      let query = supabase
        .from('site_publico_ticker_mensagens')
        .select('texto, categoria')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });

      if (config.automaticCategory !== 'all') {
        query = query.eq('categoria', config.automaticCategory);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      if (!rows.length) {
        return { config, items: ['A oportunidade cresce com preparo, organização e propósito.'] };
      }

      const startOfYear = new Date(new Date().getFullYear(), 0, 0);
      const dayOfYear = Math.floor((Date.now() - startOfYear.getTime()) / 86_400_000);
      const selected = rows[dayOfYear % rows.length];
      return { config, items: [selected.texto] };
    }

    const items: string[] = [];
    const modalities = config.modalidades.length ? config.modalidades : DEFAULT_SITE_TICKER_CONFIG.modalidades;
    const nonEadModalities = modalities.filter((item) => item !== 'EAD');

    if (nonEadModalities.length > 0) {
      let query = supabase
        .from('turmas')
        .select(`
          id,
          nome,
          data_inicio,
          data_inicio_inscricao,
          data_fim_inscricao,
          cursos!inner(id, nome, modalidade, status, publicar_site),
          polos(nome, cidade, estado)
        `)
        .eq('status', 'EM_ANDAMENTO')
        .eq('permitir_inscricoes_online', true)
        .eq('cursos.status', 'ativo')
        .eq('cursos.publicar_site', true)
        .in('cursos.modalidade', nonEadModalities)
        .order('data_inicio', { ascending: true })
        .limit(config.maxItems);

      if (config.turmaIds.length) query = query.in('id', config.turmaIds);
      if (config.cursoIds.length) query = query.in('curso_id', config.cursoIds);

      const { data, error } = await query;
      if (error) throw error;

      for (const turma of (data || []).filter(isWithinEnrollmentWindow)) {
        const curso = Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos;
        const polo = getPoloLabel(turma);
        const start = config.showStartDate && turma.data_inicio ? ` • Início ${formatDate(turma.data_inicio)}` : '';
        items.push(`Turma aberta: ${curso?.nome || turma.nome}${config.showPolo && polo ? ` • ${polo}` : ''}${start}`);
      }
    }

    if (modalities.includes('EAD') && items.length < config.maxItems) {
      let query = supabase
        .from('cursos')
        .select('id, nome')
        .eq('modalidade', 'EAD')
        .eq('status', 'ativo')
        .eq('publicar_site', true)
        .order('nome', { ascending: true })
        .limit(config.maxItems - items.length);

      if (config.cursoIds.length) query = query.in('id', config.cursoIds);

      const { data, error } = await query;
      if (error) throw error;
      for (const curso of data || []) items.push(`EAD disponível: ${curso.nome}`);
    }

    if (!items.length) {
      return { config, items: ['Novas turmas abertas serão anunciadas em breve.'] };
    }

    return { config, items: items.slice(0, config.maxItems) };
  },
};
