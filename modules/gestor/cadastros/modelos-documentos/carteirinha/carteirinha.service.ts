
// File: modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha.service.ts

import { supabase } from '../../../../../lib/supabase';

// Mock Storage para o Template
let mockTemplate = {
  widthCm: 8.5,
  heightCm: 5.5,
  startNumber: 1000,
  bgFrente: null,
  bgVerso: null,
  fields: []
};

export const carteirinhaService = {
  async getTemplate() {
    // Simula delay de rede
    return new Promise<any>((resolve) => {
      setTimeout(() => resolve(mockTemplate), 500);
    });
  },

  async saveTemplate(data: any) {
    // Simula salvamento
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        mockTemplate = data;
        resolve(true);
      }, 800);
    });
  },

  async getNextNumber() {
    return mockTemplate.startNumber;
  }
};
