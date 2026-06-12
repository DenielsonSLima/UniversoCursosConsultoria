import { supabase } from '../../../../lib/supabase';

export interface AsaasConfigData {
  id?: string;
  environment: 'sandbox' | 'production';
  apiKey: string;
  walletId: string;
}

const CONSTANT_ASAAS_ID = 'a1111111-1111-1111-1111-111111111111';

export const asaasService = {
  /**
   * Obtém a configuração do Asaas ativa no banco de dados.
   */
  async getConfig(): Promise<AsaasConfigData> {
    const { data, error } = await supabase
      .from('asaas_config')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar configuração do Asaas:', error);
      throw new Error(error.message);
    }

    if (!data) {
      return {
        id: CONSTANT_ASAAS_ID,
        environment: 'sandbox',
        apiKey: '',
        walletId: ''
      };
    }

    return {
      id: data.id,
      environment: data.environment as 'sandbox' | 'production',
      apiKey: data.api_key || '',
      walletId: data.wallet_id || ''
    };
  },

  /**
   * Salva a configuração do Asaas no banco de dados.
   */
  async saveConfig(config: AsaasConfigData): Promise<boolean> {
    const { error } = await supabase
      .from('asaas_config')
      .upsert({
        id: config.id || CONSTANT_ASAAS_ID,
        environment: config.environment,
        api_key: config.apiKey,
        wallet_id: config.walletId
      });

    if (error) {
      console.error('Erro ao salvar configuração do Asaas:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
