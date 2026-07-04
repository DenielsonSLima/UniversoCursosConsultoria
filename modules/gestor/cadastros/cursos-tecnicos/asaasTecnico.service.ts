import { Curso } from '../cadastros.types';

export const cursosTecnicoAsaasService = {
  async createCourseProduct(curso: Curso): Promise<{
    success: boolean;
    linkPagamento?: string;
    asaasId?: string;
  }> {
    void curso;
    throw new Error('Cursos técnicos não usam link de curso isolado. Use a matrícula em turma para gerar cobrança no Asaas do aluno.');
  },
};
