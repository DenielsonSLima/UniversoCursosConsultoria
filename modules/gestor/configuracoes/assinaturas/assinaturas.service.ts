// File: modules/gestor/configuracoes/assinaturas/assinaturas.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.
// Cache em memória apenas (não persiste entre sessões de página).

import { supabase } from '../../../../lib/supabase';

export interface AssinaturasData {
  diretoriaGeral: string;
  secretaria: string;
  coordenacao: string;
  financeiro: string;
  diretoriaGeralNome?: string;
  diretoriaGeralCargo?: string;
  secretariaNome?: string;
  secretariaCargo?: string;
  coordenacaoNome?: string;
  coordenacaoCargo?: string;
  financeiroNome?: string;
  financeiroCargo?: string;
}

const DEFAULT_ASSINATURAS: AssinaturasData = {
  diretoriaGeral: '',
  secretaria: '',
  coordenacao: '',
  financeiro: '',
  diretoriaGeralNome: '',
  diretoriaGeralCargo: 'Diretora Geral',
  secretariaNome: '',
  secretariaCargo: 'Secretária Escolar',
  coordenacaoNome: '',
  coordenacaoCargo: '',
  financeiroNome: '',
  financeiroCargo: '',
};

// Cache em memória — válido apenas durante a vida da página (sem localStorage)
let _memCache: AssinaturasData | null = null;
let _memCacheTs = 0;
const CACHE_TTL_MS = 60_000; // 1 minuto

const normalizeSignatureMetadata = (data: AssinaturasData): AssinaturasData => ({
  ...data,
  diretoriaGeralCargo: data.diretoriaGeralCargo === 'Diretor(a) Geral'
    ? 'Diretora Geral'
    : data.diretoriaGeralCargo || DEFAULT_ASSINATURAS.diretoriaGeralCargo,
  secretariaCargo: data.secretariaCargo === 'Secretária Acadêmica'
    ? 'Secretária Escolar'
    : data.secretariaCargo || DEFAULT_ASSINATURAS.secretariaCargo,
});

export const assinaturasService = {
  /**
   * Busca assinaturas diretamente do Supabase.
   * Usa cache em memória por até 1 minuto para evitar re-fetches desnecessários.
   * NUNCA usa localStorage.
   */
  async getSignatures(): Promise<AssinaturasData> {
    const now = Date.now();

    // Retorna cache em memória se ainda válido
    if (_memCache && now - _memCacheTs < CACHE_TTL_MS) {
      return _memCache;
    }

    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'assinaturas')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        _memCache = normalizeSignatureMetadata({ ...DEFAULT_ASSINATURAS, ...data.conteudo } as AssinaturasData);
        _memCacheTs = now;
        return _memCache;
      }
    } catch (e) {
      console.error('[assinaturasService] Erro ao buscar do Supabase:', e);
    }

    return DEFAULT_ASSINATURAS;
  },

  /**
   * Salva assinaturas no Supabase e atualiza o cache em memória.
   * NUNCA usa localStorage.
   */
  async saveSignatures(data: AssinaturasData): Promise<boolean> {
    // Invalida cache em memória
    _memCache = null;

    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'assinaturas',
          conteudo: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Atualiza cache em memória após salvar com sucesso
      _memCache = normalizeSignatureMetadata(data);
      _memCacheTs = Date.now();
      return true;
    } catch (e) {
      console.error('[assinaturasService] Erro ao salvar no Supabase:', e);
      return false;
    }
  },

  /**
   * Retorna o cache em memória ou defaults.
   * NUNCA usa localStorage.
   */
  getSignaturesSync(): AssinaturasData {
    return _memCache ?? DEFAULT_ASSINATURAS;
  },

  /** Invalida o cache em memória para forçar re-fetch na próxima chamada. */
  invalidateCache() {
    _memCache = null;
    _memCacheTs = 0;
  },

  /** @deprecated Use getSignatures() */
  async syncSignatures(): Promise<AssinaturasData> {
    return this.getSignatures();
  },
};
