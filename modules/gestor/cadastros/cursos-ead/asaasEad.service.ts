// File: modules/gestor/cadastros/cursos-ead/asaasEad.service.ts

import { Curso } from '../cadastros.types';

export const asaasEadService = {
  async createCourseProduct(curso: Curso): Promise<{ success: boolean; linkPagamento?: string; asaasId?: string }> {
    throw new Error(`Link genérico desativado para EAD (${curso.nome}). Use o checkout do aluno com CPF, e-mail e telefone vinculados.`);
  }
};
