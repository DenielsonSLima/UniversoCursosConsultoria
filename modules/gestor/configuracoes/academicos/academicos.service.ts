// File: modules/gestor/configuracoes/academicos/academicos.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.
// Cache em memória apenas para evitar múltiplos fetches na mesma sessão de página.

import { supabase } from '../../../../lib/supabase';

export interface AcademicosConfigData {
  matriculaPrefix: string;
  matriculaDigits: number;
  usePoloCode: boolean;
  yearFormat: string;
  carteirinhaPrimaryColor: string;
  carteirinhaSecondaryColor: string;
  validityMonths: number;
  validacaoPrefix: string;
  templateTecnico: string;
  templateEad: string;
  templateLivres: string;
  templateEspecializacao: string;
  validacaoUrl: string;
}

export const DEFAULT_CONFIGS: AcademicosConfigData = {
  matriculaPrefix: 'UNIV-',
  matriculaDigits: 4,
  usePoloCode: false,
  yearFormat: 'yy',
  carteirinhaPrimaryColor: '#001a33',
  carteirinhaSecondaryColor: '#4169E1',
  validityMonths: 12,
  validacaoPrefix: 'VAL-',
  templateTecnico: 'Certificamos que o aluno concluiu com êxito o curso Técnico em {CURSO} ministrado no polo {POLO}.',
  templateEad: 'Certificamos que o aluno concluiu via plataforma digital EAD o curso livre de {CURSO}.',
  templateLivres: 'Certificamos a participação do aluno no curso livre de {CURSO} com carga horária de {CARGA}h.',
  templateEspecializacao: 'Certificamos que o especialista concluiu a Pós-Graduação Latu Sensu em {CURSO}.',
  validacaoUrl: 'https://www.universocc.com.br/validador',
};

// Cache em memória — válido apenas durante a vida da página (sem localStorage)
let _memCache: AcademicosConfigData | null = null;
let _memCacheTs = 0;
const CACHE_TTL_MS = 60_000; // 1 minuto

export const academicosService = {
  /**
   * Busca configurações diretamente do Supabase.
   * Usa cache em memória por até 1 minuto para evitar re-fetches desnecessários.
   * NUNCA usa localStorage.
   */
  async getConfigs(): Promise<AcademicosConfigData> {
    const now = Date.now();
    if (_memCache && now - _memCacheTs < CACHE_TTL_MS) {
      return _memCache;
    }

    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'academicos_config')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        _memCache = { ...DEFAULT_CONFIGS, ...data.conteudo } as AcademicosConfigData;
        _memCacheTs = now;
        return _memCache;
      }
    } catch (e) {
      console.error('[academicosService] Erro ao buscar configs do Supabase:', e);
    }

    return DEFAULT_CONFIGS;
  },

  /**
   * Salva configurações no Supabase e atualiza o cache em memória.
   * NUNCA usa localStorage.
   */
  async saveConfigs(data: AcademicosConfigData): Promise<boolean> {
    // Invalida cache em memória
    _memCache = null;

    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'academicos_config',
          conteudo: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Atualiza cache em memória após salvar com sucesso
      _memCache = data;
      _memCacheTs = Date.now();
      return true;
    } catch (e) {
      console.error('[academicosService] Erro ao salvar configs no Supabase:', e);
      return false;
    }
  },

  /** Invalida o cache em memória para forçar re-fetch na próxima chamada. */
  invalidateCache() {
    _memCache = null;
    _memCacheTs = 0;
  },

  /**
   * @deprecated Use getConfigs() diretamente — agora é async.
   * Retorna defaults ou cache em memória (nunca acessa localStorage).
   */
  getConfigsSync(): AcademicosConfigData {
    return _memCache ?? DEFAULT_CONFIGS;
  },

  /** @deprecated Use getConfigs() */
  async syncConfigs(): Promise<AcademicosConfigData> {
    return this.getConfigs();
  },
};
