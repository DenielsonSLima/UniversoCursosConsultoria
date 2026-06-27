// File: modules/gestor/cadastros/cursos-livres/cursos-livres.service.ts

import { Curso } from '../cadastros.types';
import { cadastrosService } from '../cadastros.service';

export type CursoLivreStatusFilter = 'ativo' | 'inativo';

export interface CreateCursoLivreInput {
  nome: string;
  descricao: string;
  area: string;
  versao: string;
  cargaHoraria: number;
  imagemUrl?: string | null;
  publicarSite?: boolean;
  duracaoMeses?: number;
}

export const cursosLivresQueryKeys = {
  all: ['cadastros', 'cursos-livres'] as const,
  list: () => [...cursosLivresQueryKeys.all, 'list'] as const,
};

export const cursosLivresService = {
  async getCursos(): Promise<Curso[]> {
    return cadastrosService.getCursosByModalidade('LIVRE');
  },

  async createCurso(input: CreateCursoLivreInput): Promise<Curso> {
    return cadastrosService.createCurso({
      nome: input.nome,
      carga_horaria: input.cargaHoraria,
      modalidade: 'LIVRE',
      status: 'ativo',
      area: input.area,
      descricao: input.descricao,
      versao: input.versao,
      duracao_meses: input.duracaoMeses || null,
      imagem_url: input.imagemUrl || null,
      publicar_site: input.publicarSite ?? false,
      valor: null
    });
  },

  async deleteCurso(cursoId: string): Promise<void> {
    await cadastrosService.deleteCurso(cursoId);
  },

  async duplicateCurso(cursoId: string, nome: string, versao: string): Promise<void> {
    await cadastrosService.duplicateCurso(cursoId, nome, versao);
  },

  async toggleStatus(cursoId: string, novoStatus: CursoLivreStatusFilter): Promise<void> {
    await cadastrosService.toggleStatus(cursoId, novoStatus);
  },
};
