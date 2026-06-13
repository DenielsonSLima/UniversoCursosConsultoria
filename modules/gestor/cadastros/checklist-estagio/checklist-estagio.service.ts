// File: modules/gestor/cadastros/checklist-estagio/checklist-estagio.service.ts

import { supabase } from '../../../../lib/supabase';

export const checklistEstagioService = {
  // Busca a configuração do checklist de estágio associada a um curso
  async getByCursoId(cursoId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from('config_checklist_estagio')
      .select('*')
      .eq('curso_id', cursoId)
      .maybeSingle();
      
    if (error) {
      console.error('Erro ao buscar configuração de checklist:', error);
      throw error;
    }
    
    return data;
  },

  // Salva ou atualiza a configuração para um curso
  async saveConfig(cursoId: string, instrumentos: any[], checklistUcs: any[]): Promise<void> {
    const existing = await this.getByCursoId(cursoId);
    
    if (existing) {
      const { error } = await supabase
        .from('config_checklist_estagio')
        .update({
          instrumentos_avaliativos: instrumentos,
          checklist_ucs: checklistUcs
        })
        .eq('curso_id', cursoId);
        
      if (error) {
        console.error('Erro ao atualizar checklist de estágio:', error);
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('config_checklist_estagio')
        .insert({
          curso_id: cursoId,
          instrumentos_avaliativos: instrumentos,
          checklist_ucs: checklistUcs
        });
        
      if (error) {
        console.error('Erro ao inserir checklist de estágio:', error);
        throw error;
      }
    }
  }
};
