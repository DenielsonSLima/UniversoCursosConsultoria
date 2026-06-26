import { supabase } from '../../../../lib/supabase';
import { cadastrosService } from '../cadastros.service';
import { Curso } from '../cadastros.types';

export type CursoTecnicoStatusFilter = 'ativo' | 'inativo';

export interface CreateCursoTecnicoInput {
  nome: string;
  descricao: string;
  area: string;
  versao: string;
  carga_horaria: number;
  duracao_meses: number;
  imagem_url: string | null;
  publicar_site: boolean;
}

export const cursosTecnicosQueryKeys = {
  all: ['cadastros', 'cursos-tecnicos'] as const,
  list: () => [...cursosTecnicosQueryKeys.all, 'list'] as const
};

const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), 'image/webp', 0.8);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export const cursosTecnicosService = {
  async getCursos(): Promise<Curso[]> {
    return cadastrosService.getCursosByModalidade('TECNICO');
  },

  async createCurso(input: CreateCursoTecnicoInput): Promise<Curso> {
    return cadastrosService.createCurso({
      nome: input.nome,
      carga_horaria: input.carga_horaria,
      modalidade: 'TECNICO',
      status: 'ativo',
      area: input.area,
      descricao: input.descricao,
      versao: input.versao,
      duracao_meses: input.duracao_meses,
      imagem_url: input.imagem_url,
      publicar_site: input.publicar_site
    });
  },

  async deleteCurso(cursoId: string): Promise<void> {
    await cadastrosService.deleteCurso(cursoId);
  },

  async duplicateCurso(cursoId: string, nome: string, versao: string): Promise<void> {
    await cadastrosService.duplicateCurso(cursoId, nome, versao);
  },

  async toggleStatus(cursoId: string, novoStatus: CursoTecnicoStatusFilter): Promise<void> {
    await cadastrosService.toggleStatus(cursoId, novoStatus);
  },

  async uploadImagem(file: File): Promise<string> {
    const timestamp = Date.now();
    const compressedBlob = await compressImage(file);
    const compressedFile = new File([compressedBlob], `curso_${timestamp}.webp`, {
      type: 'image/webp'
    });
    const filePath = `cursos/curso_${timestamp}.webp`;

    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(filePath, compressedFile, {
        cacheControl: '31536000',
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }
};
