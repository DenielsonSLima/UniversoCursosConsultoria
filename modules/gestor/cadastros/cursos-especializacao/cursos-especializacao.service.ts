import { Curso, CursoFinanceiroConfig } from '../cadastros.types';
import { cadastrosService } from '../cadastros.service';
import { uploadCursoImagem } from '../cursoImageUpload.service';

export type CursoEspecializacaoStatusFilter = 'ativo' | 'inativo';

export interface CreateCursoEspecializacaoInput {
  nome: string;
  descricao: string;
  area: string;
  versao: string;
  cargaHoraria: number;
  imagemUrl?: string | null;
  publicarSite?: boolean;
  duracaoMeses?: number;
  financeiroConfig?: CursoFinanceiroConfig;
}

export const cursosEspecializacaoQueryKeys = {
  all: ['cadastros', 'cursos-especializacao'] as const,
  list: () => [...cursosEspecializacaoQueryKeys.all, 'list'] as const,
};

export const cursosEspecializacaoService = {
  async getCursos(): Promise<Curso[]> {
    return cadastrosService.getCursosByModalidade('ESPECIALIZACAO');
  },

  async createCurso(input: CreateCursoEspecializacaoInput): Promise<Curso> {
    return cadastrosService.createCurso({
      nome: input.nome,
      carga_horaria: input.cargaHoraria,
      modalidade: 'ESPECIALIZACAO',
      status: 'ativo',
      area: input.area,
      descricao: input.descricao,
      versao: input.versao,
      duracao_meses: input.duracaoMeses || null,
      imagem_url: input.imagemUrl || null,
      publicar_site: input.publicarSite ?? false,
      financeiro_config: input.financeiroConfig
    });
  },

  async deleteCurso(cursoId: string): Promise<void> {
    await cadastrosService.deleteCurso(cursoId);
  },

  async duplicateCurso(cursoId: string, nome: string, versao: string): Promise<void> {
    await cadastrosService.duplicateCurso(cursoId, nome, versao);
  },

  async toggleStatus(cursoId: string, novoStatus: CursoEspecializacaoStatusFilter): Promise<void> {
    await cadastrosService.toggleStatus(cursoId, novoStatus);
  },

  async uploadImagem(file: File): Promise<string> {
    return uploadCursoImagem(file);
  }
};
