import { supabase } from '../../../../lib/supabase';

export interface CompanyWatermark {
  id: string;
  nomeFantasia: string;
  cidade: string;
  uf: string;
  watermarkUrl: string | null;
  watermarkOpacity: number;
  watermarkScale: number;
  watermarkRotate?: boolean;
  landscapeWatermarkUrl: string | null;
  landscapeWatermarkOpacity: number;
  landscapeWatermarkScale: number;
  landscapeWatermarkRotate?: boolean;
}

export const marcaDaguaService = {
  /**
   * Retorna todos os polos com suas configurações de marca d'água.
   */
  async getCompaniesWithWatermark(): Promise<CompanyWatermark[]> {
    const [{ data, error }, { data: landscapeRows, error: landscapeError }] = await Promise.all([
      supabase
        .from('polos')
        .select('id, nome, cidade, estado, watermark_url, watermark_opacity, watermark_scale, watermark_rotate')
        .order('nome', { ascending: true }),
      supabase
        .from('documentos_templates')
        .select('id, conteudo')
        .like('id', 'watermark_landscape_%'),
    ]);

    if (error) {
      console.error('Erro ao buscar marcas dágua dos polos:', error);
      throw new Error(error.message);
    }

    if (landscapeError) {
      console.warn('Não foi possível carregar marcas paisagem:', landscapeError);
    }

    const landscapeByPolo = new Map(
      (landscapeRows || []).map((row: any) => [
        row.id.replace('watermark_landscape_', ''),
        row.conteudo || {},
      ])
    );

    return (data || []).map(p => ({
      ...(() => {
        const landscape: any = landscapeByPolo.get(p.id) || {};
        return {
          landscapeWatermarkUrl: landscape.url || null,
          landscapeWatermarkOpacity: Number(landscape.opacity ?? 0.1),
          landscapeWatermarkScale: Number(landscape.scale ?? 50),
          landscapeWatermarkRotate: landscape.rotate === true,
        };
      })(),
      id: p.id,
      nomeFantasia: p.nome,
      cidade: p.cidade,
      uf: p.estado,
      watermarkUrl: p.watermark_url,
      watermarkOpacity: Number(p.watermark_opacity ?? 0.1),
      watermarkScale: Number(p.watermark_scale ?? 50),
      watermarkRotate: p.watermark_rotate !== false,
    }));
  },

  /**
   * Salva as configurações de marca d'água de um polo.
   */
  async saveWatermarkSettings(data: CompanyWatermark): Promise<boolean> {
    const [{ error }, { error: landscapeError }] = await Promise.all([
      supabase
        .from('polos')
        .update({
          watermark_url: data.watermarkUrl,
          watermark_opacity: data.watermarkOpacity,
          watermark_scale: data.watermarkScale,
          watermark_rotate: data.watermarkRotate !== false,
        })
        .eq('id', data.id),
      supabase
        .from('documentos_templates')
        .upsert({
          id: `watermark_landscape_${data.id}`,
          conteudo: {
            url: data.landscapeWatermarkUrl,
            opacity: data.landscapeWatermarkOpacity,
            scale: data.landscapeWatermarkScale,
            rotate: data.landscapeWatermarkRotate === true,
          },
          updated_at: new Date().toISOString(),
        }),
    ]);

    if (error) {
      console.error('Erro ao salvar marca dágua do polo:', error);
      throw new Error(error.message);
    }

    if (landscapeError) {
      console.error('Erro ao salvar marca dágua paisagem:', landscapeError);
      throw new Error(landscapeError.message);
    }

    return true;
  }
};
