// File: modules/gestor/cadastros/cursos-livres/cursos-livres.service.ts

import { supabase } from '../../../../lib/supabase';
import { Curso, CursoFinanceiroConfig, Modulo } from '../cadastros.types';
import { cadastrosService } from '../cadastros.service';
import { uploadCursoImagem } from '../cursoImageUpload.service';

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
  financeiroConfig?: CursoFinanceiroConfig;
}

export interface CursoLivreGradeWorkspace {
  cursoId: string;
  fingerprint: string;
  modulos: Modulo[];
  estruturaBloqueada: boolean;
  motivoBloqueio: 'TENTATIVA_REGISTRADA' | 'USO_OPERACIONAL' | null;
  replayed: boolean;
}

interface SaveCursoLivreGradeInput {
  requestId: string;
  cursoId: string;
  expectedFingerprint: string;
  modulos: Modulo[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const duplicateRequestIds = new Map<string, string>();

const normalizeGradeWorkspace = (value: unknown, cursoId: string): CursoLivreGradeWorkspace => {
  if (!isRecord(value) || typeof value.fingerprint !== 'string' || !Array.isArray(value.modulos)) {
    throw new Error('O servidor não retornou a grade oficial do Curso Livre.');
  }
  return {
    cursoId: typeof value.cursoId === 'string' ? value.cursoId : cursoId,
    fingerprint: value.fingerprint,
    modulos: value.modulos as unknown as Modulo[],
    estruturaBloqueada: value.estruturaBloqueada === true,
    motivoBloqueio: value.motivoBloqueio === 'TENTATIVA_REGISTRADA' || value.motivoBloqueio === 'USO_OPERACIONAL'
      ? value.motivoBloqueio
      : null,
    replayed: value.replayed === true,
  };
};

export const cursosLivresQueryKeys = {
  all: ['cadastros', 'cursos-livres'] as const,
  list: () => [...cursosLivresQueryKeys.all, 'list'] as const,
};

export const cursosLivresService = {
  async getGradeWorkspace(cursoId: string): Promise<CursoLivreGradeWorkspace> {
    const { data, error } = await supabase.rpc('obter_grade_curso_livre_gestao_secure', {
      p_curso_id: cursoId,
    });
    if (error) throw error;
    return normalizeGradeWorkspace(data, cursoId);
  },

  async saveGrade(input: SaveCursoLivreGradeInput): Promise<CursoLivreGradeWorkspace> {
    const { data, error } = await supabase.rpc('salvar_grade_curso_livre_gestao_secure', {
      p_request_id: input.requestId,
      p_curso_id: input.cursoId,
      p_expected_fingerprint: input.expectedFingerprint,
      p_modulos: input.modulos,
    });
    if (error) throw error;
    return normalizeGradeWorkspace(data, input.cursoId);
  },

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
      valor: null,
      financeiro_config: input.financeiroConfig
    });
  },

  async deleteCurso(cursoId: string): Promise<void> {
    await cadastrosService.deleteCurso(cursoId);
  },

  async duplicateCurso(cursoId: string, nome: string, versao: string): Promise<void> {
    const signature = JSON.stringify({ cursoId, nome, versao });
    const requestId = duplicateRequestIds.get(signature) || createCursoLivreGradeRequestId();
    duplicateRequestIds.set(signature, requestId);

    const { error } = await supabase.rpc('duplicar_curso_livre_gestao_secure', {
      p_request_id: requestId,
      p_curso_id: cursoId,
      p_novo_nome: nome,
      p_nova_versao: versao,
    });
    if (error) throw error;
    duplicateRequestIds.delete(signature);
  },

  async toggleStatus(cursoId: string, novoStatus: CursoLivreStatusFilter): Promise<void> {
    await cadastrosService.toggleStatus(cursoId, novoStatus);
  },

  async uploadImagem(file: File): Promise<string> {
    return uploadCursoImagem(file);
  },
};

export const createCursoLivreGradeRequestId = () => globalThis.crypto.randomUUID();
