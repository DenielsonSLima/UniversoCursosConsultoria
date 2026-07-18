import { supabase } from '../../lib/supabase';
import {
  PUBLIC_ENROLLMENT_TURMA_STATUSES,
  isEligiblePublicTurmaStatus,
  isWithinPublicEnrollmentWindow,
} from './courseAvailability';
import { buildTechnicalLandingPath } from './landing-pages/cursos-tecnicos/technicalLanding.routes';

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
  items: SiteTickerItem[];
}

export interface SiteTickerItem {
  text: string;
  href?: string;
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
        .filter(Boolean)
        .map((text) => ({ text }));
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
        return { config, items: [{ text: 'A oportunidade cresce com preparo, organização e propósito.' }] };
      }

      const startOfYear = new Date(new Date().getFullYear(), 0, 0);
      const dayOfYear = Math.floor((Date.now() - startOfYear.getTime()) / 86_400_000);
      const selected = rows[dayOfYear % rows.length];
      return { config, items: [{ text: selected.texto }] };
    }

    const items: SiteTickerItem[] = [];
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
          status,
          publicar_no_site,
          permitir_inscricoes_online,
          cursos!inner(id, nome, modalidade, status, publicar_site),
          polos(nome, cidade, estado)
        `)
        .in('status', ['PLANEJADA', ...PUBLIC_ENROLLMENT_TURMA_STATUSES])
        .or('publicar_no_site.eq.true,permitir_inscricoes_online.eq.true')
        .eq('cursos.status', 'ativo')
        .eq('cursos.publicar_site', true)
        .in('cursos.modalidade', nonEadModalities)
        .order('data_inicio', { ascending: true });

      if (config.turmaIds.length) query = query.in('id', config.turmaIds);
      if (config.cursoIds.length) query = query.in('curso_id', config.cursoIds);

      const { data, error } = await query;
      if (error) throw error;

      for (const turma of (data || []).filter((item: any) => {
        const curso = Array.isArray(item?.cursos) ? item.cursos[0] : item?.cursos;
        if (curso?.modalidade === 'TECNICO') return item?.publicar_no_site === true;
        return isEligiblePublicTurmaStatus(item?.status, curso?.modalidade)
          && item?.permitir_inscricoes_online === true
          && isWithinPublicEnrollmentWindow(item);
      })) {
        const curso = Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos;
        const polo = getPoloLabel(turma);
        const start = config.showStartDate && turma.data_inicio ? ` • Início ${formatDate(turma.data_inicio)}` : '';
        const onlineOpen = turma.permitir_inscricoes_online === true
          && isEligiblePublicTurmaStatus(turma.status, curso?.modalidade)
          && isWithinPublicEnrollmentWindow(turma);
        const text = `${onlineOpen ? 'Inscrições abertas' : 'Turma disponível'}: ${curso?.nome || turma.nome}${config.showPolo && polo ? ` • ${polo}` : ''}${start}`;
        items.push({
          text,
          href: curso?.modalidade === 'TECNICO'
            ? buildTechnicalLandingPath(curso?.nome || turma.nome, turma.id)
            : undefined,
        });
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
      for (const curso of data || []) items.push({ text: `EAD disponível: ${curso.nome}` });
    }

    if (!items.length) {
      return { config, items: [{ text: 'Novas turmas abertas serão anunciadas em breve.' }] };
    }

    return { config, items: items.slice(0, config.maxItems) };
  },
};
