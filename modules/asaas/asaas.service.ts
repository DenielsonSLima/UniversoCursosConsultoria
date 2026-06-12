
// File: modules/asaas/asaas.service.ts

import { supabase } from '../../lib/supabase';
import { AsaasCustomer, AsaasPayment, AsaasSubscription } from './asaas.types';

// TODO: Substituir por chamadas reais via Edge Functions quando o backend estiver pronto
// Por enquanto, usaremos a estratégia "Mock First" para validar o fluxo visual e de dados.

export const asaasService = {
  
  /**
   * Cria ou recupera um cliente no Asaas
   */
  async createCustomer(customerData: Omit<AsaasCustomer, 'id'>): Promise<AsaasCustomer> {
    console.log('[Asaas Mock] Criando cliente:', customerData);
    
    // Simula delay de rede
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      id: `cus_${Math.random().toString(36).substr(2, 12)}`,
      ...customerData
    };
  },

  /**
   * Gera uma cobrança única (Boleto/Pix)
   */
  async createPayment(paymentData: Omit<AsaasPayment, 'id' | 'status' | 'invoiceUrl' | 'bankSlipUrl'>): Promise<AsaasPayment> {
    console.log('[Asaas Mock] Gerando cobrança:', paymentData);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    const id = `pay_${Math.random().toString(36).substr(2, 12)}`;
    
    return {
      id,
      ...paymentData,
      status: 'PENDING',
      invoiceUrl: `https://sandbox.asaas.com/i/${id}`,
      bankSlipUrl: paymentData.billingType === 'BOLETO' ? `https://sandbox.asaas.com/b/${id}` : undefined,
      pixQrCodeText: paymentData.billingType === 'PIX' ? '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5913Universo Cursos6008Aracaju62070503***6304ABCD' : undefined
    };
  },

  /**
   * Cria uma assinatura recorrente
   */
  async createSubscription(subscriptionData: Omit<AsaasSubscription, 'id' | 'status'>): Promise<AsaasSubscription> {
    console.log('[Asaas Mock] Criando assinatura:', subscriptionData);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      id: `sub_${Math.random().toString(36).substr(2, 12)}`,
      ...subscriptionData,
      status: 'ACTIVE'
    };
  }
};
