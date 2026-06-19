// File: modules/gestor/cadastros/modelos-documentos/cracha/cracha.service.ts

import { supabase } from '../../../../../lib/supabase';

const DEFAULT_TEMPLATE = {
  widthCm: 5.5,
  heightCm: 8.5,
  startNumber: 1000,
  bgFrente: null,
  bgVerso: null,
  fields: []
};

const STORAGE_KEY = 'universo_template_cracha';

const getLocalStorageTemplate = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao ler template do localStorage:', e);
      }
    }
  }
  return DEFAULT_TEMPLATE;
};

export const crachaService = {
  async getTemplate() {
    return new Promise<any>((resolve) => {
      setTimeout(() => resolve(getLocalStorageTemplate()), 300);
    });
  },

  async saveTemplate(data: any) {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
        resolve(true);
      }, 350);
    });
  },

  async getNextNumber() {
    const temp = getLocalStorageTemplate();
    return temp.startNumber || 1000;
  }
};
