import { supabase } from '../../../../lib/supabase';

export interface CompanyWatermark {
  id: string;
  nomeFantasia: string;
  cidade: string;
  uf: string;
  watermarkUrl: string | null;
  watermarkOpacity: number;
  watermarkScale: number;
}

export const marcaDaguaService = {
  /**
   * Retorna todos os polos com suas configurações de marca d'água.
   */
  async getCompaniesWithWatermark(): Promise<CompanyWatermark[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, cidade, estado, watermark_url, watermark_opacity, watermark_scale')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar marcas dágua dos polos:', error);
      throw new Error(error.message);
    }

    return (data || []).map(p => ({
      id: p.id,
      nomeFantasia: p.nome,
      cidade: p.cidade,
      uf: p.estado,
      watermarkUrl: p.watermark_url,
      watermarkOpacity: Number(p.watermark_opacity ?? 0.1),
      watermarkScale: Number(p.watermark_scale ?? 50)
    }));
  },

  /**
   * Salva as configurações de marca d'água de um polo.
   */
  async saveWatermarkSettings(data: CompanyWatermark): Promise<boolean> {
    const { error } = await supabase
      .from('polos')
      .update({
        watermark_url: data.watermarkUrl,
        watermark_opacity: data.watermarkOpacity,
        watermark_scale: data.watermarkScale
      })
      .eq('id', data.id);

    if (error) {
      console.error('Erro ao salvar marca dágua do polo:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
