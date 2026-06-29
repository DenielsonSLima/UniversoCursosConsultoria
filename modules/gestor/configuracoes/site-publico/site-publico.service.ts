import { supabase } from '../../../../lib/supabase';
import {
  DEFAULT_SITE_TICKER_CONFIG,
  SITE_PUBLIC_TICKER_CONFIG_ID,
  SitePublicTickerConfig,
} from '../../../public/siteTicker.service';

const normalizeConfig = (value: any): SitePublicTickerConfig => ({
  ...DEFAULT_SITE_TICKER_CONFIG,
  ...(value || {}),
  modalidades: Array.isArray(value?.modalidades) ? value.modalidades : DEFAULT_SITE_TICKER_CONFIG.modalidades,
  cursoIds: Array.isArray(value?.cursoIds) ? value.cursoIds : [],
  turmaIds: Array.isArray(value?.turmaIds) ? value.turmaIds : [],
  automaticCategory: ['motivacional', 'reflexao', 'all'].includes(value?.automaticCategory) ? value.automaticCategory : 'all',
});

export const sitePublicoConfigService = {
  async getConfig(): Promise<SitePublicTickerConfig> {
    const { data, error } = await supabase
      .from('documentos_templates')
      .select('conteudo')
      .eq('id', SITE_PUBLIC_TICKER_CONFIG_ID)
      .maybeSingle();

    if (error) throw error;
    return normalizeConfig(data?.conteudo);
  },

  async saveConfig(config: SitePublicTickerConfig) {
    const { error } = await supabase
      .from('documentos_templates')
      .upsert({
        id: SITE_PUBLIC_TICKER_CONFIG_ID,
        conteudo: { ...config, updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
  },
};
