import { supabase } from '../../../../lib/supabase';
import { cadastrosService } from '../cadastros.service';
import { Curso, CursoFinanceiroConfig } from '../cadastros.types';
import {
  CursoTecnicoCardData,
  normalizeCursosTecnicosCardContract,
} from './curso-tecnico-card.contract';

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
  financeiro_config?: CursoFinanceiroConfig;
}

export const cursosTecnicosQueryKeys = {
  all: ['cadastros', 'cursos-tecnicos'] as const,
  list: () => [...cursosTecnicosQueryKeys.all, 'list'] as const
};

const compressImage = (file: File): Promise<{ blob: Blob; ext: string; type: string }> => {
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
          resolve({ blob: file, ext: file.name.split('.').pop() || 'jpg', type: file.type });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const isWebpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        const format = isWebpSupported ? 'image/webp' : 'image/jpeg';
        const ext = isWebpSupported ? 'webp' : 'jpg';

        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob, ext, type: format });
          } else {
            resolve({ blob: file, ext: file.name.split('.').pop() || 'jpg', type: file.type });
          }
        }, format, 0.8);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export const cursosTecnicosService = {
  async getCursos(): Promise<CursoTecnicoCardData[]> {
    const cursos = await cadastrosService.getCursosByModalidade('TECNICO');
    return normalizeCursosTecnicosCardContract(cursos);
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
      publicar_site: input.publicar_site,
      financeiro_config: input.financeiro_config
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
    const { blob, ext, type } = await compressImage(file);
    const timestamp = Date.now();
    const compressedFile = new File([blob], `curso_${timestamp}.${ext}`, {
      type
    });
    const filePath = `cursos/curso_${timestamp}.${ext}`;

    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(filePath, compressedFile, {
        cacheControl: '31536000',
        upsert: true,
        contentType: type
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }
};
