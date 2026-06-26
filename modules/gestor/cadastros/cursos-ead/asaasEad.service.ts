// File: modules/gestor/cadastros/cursos-ead/asaasEad.service.ts

import { Curso } from '../cadastros.types';
import { asaasIntegrationService } from '../../../asaas/asaas.service';

export const asaasEadService = {
  async createCourseProduct(curso: Curso): Promise<{ success: boolean; linkPagamento?: string; asaasId?: string }> {
    const result = await asaasIntegrationService.createCourseLink(curso.id, true);
    return {
      success: true,
      linkPagamento: result.url,
    };
  }
};
