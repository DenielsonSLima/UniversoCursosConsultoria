import { Curso } from '../cadastros.types';

export const cursosLivresAsaasService = {
  async createCourseProduct(curso: Curso): Promise<{ success: boolean; linkPagamento?: string; asaasId?: string }> {
    throw new Error(`Link genérico desativado para curso livre (${curso.nome}). Use o checkout do aluno com CPF, e-mail e telefone vinculados.`);
  }
};
