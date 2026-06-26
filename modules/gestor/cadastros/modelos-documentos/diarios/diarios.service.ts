import { supabase } from '../../../../../lib/supabase';

export interface DiarioTemplate {
  capaUrl: string | null;
  contracapaUrl: string | null;
  cabecalho: string;
  rodape: string;
  imprimirInstrucoes: boolean;
  orientacao: 'landscape';
  versao: number;
}

export interface DiarioCurso {
  id: string;
  nome: string;
  modalidade: string;
}

export const DEFAULT_DIARIO_TEMPLATE: DiarioTemplate = {
  capaUrl: null,
  contracapaUrl: null,
  cabecalho: 'UNIVERSO CURSOS E CONSULTORIA',
  rodape: 'Documento Oficial — Diário de Classe emitido eletronicamente',
  imprimirInstrucoes: true,
  orientacao: 'landscape',
  versao: 1,
};

const templateId = (cursoId: string) => `diario_${cursoId}`;

export const diariosService = {
  async getCursos(): Promise<DiarioCurso[]> {
    const { data, error } = await supabase
      .from('cursos')
      .select('id, nome, modalidade')
      .in('modalidade', ['TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD'])
      .order('modalidade')
      .order('nome');

    if (error) throw error;
    return (data || []) as DiarioCurso[];
  },

  async getTemplate(cursoId: string): Promise<DiarioTemplate> {
    const { data, error } = await supabase
      .from('documentos_templates')
      .select('conteudo')
      .eq('id', templateId(cursoId))
      .maybeSingle();

    if (error) throw error;
    return {
      ...DEFAULT_DIARIO_TEMPLATE,
      ...((data?.conteudo || {}) as Partial<DiarioTemplate>),
    };
  },

  async saveTemplate(cursoId: string, conteudo: DiarioTemplate): Promise<void> {
    const { error } = await supabase
      .from('documentos_templates')
      .upsert({
        id: templateId(cursoId),
        conteudo,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
  },

  async uploadImage(
    cursoId: string,
    kind: 'capa' | 'contracapa',
    file: File,
  ): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Selecione um arquivo de imagem.');
    }
    if (file.size > 12 * 1024 * 1024) {
      throw new Error('A imagem deve possuir no máximo 12 MB.');
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `templates/diarios/${cursoId}/${kind}-${Date.now()}.${extension}`;
    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(path, file, {
        cacheControl: '31536000',
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;
    return supabase.storage.from('documentos').getPublicUrl(data.path).data.publicUrl;
  },
};
