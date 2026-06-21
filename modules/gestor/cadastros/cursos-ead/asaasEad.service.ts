// File: modules/gestor/cadastros/cursos-ead/asaasEad.service.ts

import { Curso } from '../cadastros.types';

export const asaasEadService = {
  /**
   * Simula a criação de um produto ou link de pagamento no Asaas ao publicar/salvar um curso EAD com valor comercial.
   */
  async createCourseProduct(curso: Curso): Promise<{ success: boolean; linkPagamento?: string; asaasId?: string }> {
    console.log(`[Asaas Integration] Iniciando criação de produto para o curso EAD: "${curso.nome}"`);
    console.log(`[Asaas Integration] Valor comercial configurado: R$ ${curso.valor?.toFixed(2) || '0.00'}`);
    console.log(`[Asaas Integration] Carga horária: ${curso.carga_horaria} horas`);

    // Simulando delay de rede da API do Asaas
    await new Promise((resolve) => setTimeout(resolve, 800));

    const asaasId = `prod_${Math.random().toString(36).substr(2, 9)}`;
    const linkPagamento = `https://cobranca.asaas.com/u/${asaasId}`;

    console.log(`[Asaas Integration] Produto criado com sucesso no Asaas! ID: ${asaasId}, Link: ${linkPagamento}`);

    return {
      success: true,
      asaasId,
      linkPagamento
    };
  }
};
