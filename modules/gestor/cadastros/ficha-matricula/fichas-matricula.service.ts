// File: modules/gestor/cadastros/ficha-matricula/fichas-matricula.service.ts

import { supabase } from '../../../../lib/supabase';

export const fichasMatriculaService = {
  // Busca todas as fichas cadastradas no Supabase
  async getAll(): Promise<any[]> {
    const { data, error } = await supabase
      .from('modelos_fichas')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Erro ao buscar modelos de fichas:', error);
      throw error;
    }
    
    return (data || []).map(f => ({
      id: f.id,
      nome: f.nome,
      tipoCurso: f.tipo_curso,
      status: f.status,
      requerAssinatura: f.requer_assinatura,
      textoContrato: f.texto_contrato,
      camposCustomizados: f.campos_customizados || [],
      camposCount: (f.campos_customizados || []).length,
      cursoEspecificoId: f.curso_especifico_id
    }));
  },

  // Cria um novo modelo de ficha
  async create(ficha: any): Promise<any> {
    const { data, error } = await supabase
      .from('modelos_fichas')
      .insert({
        nome: ficha.nome,
        tipo_curso: ficha.tipoCurso,
        status: ficha.status,
        requer_assinatura: ficha.requerAssinatura,
        texto_contrato: ficha.textoContrato,
        campos_customizados: ficha.camposCustomizados || [],
        curso_especifico_id: ficha.cursoEspecificoId || null
      })
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao criar modelo de ficha:', error);
      throw error;
    }
    
    return {
      id: data.id,
      nome: data.nome,
      tipoCurso: data.tipo_curso,
      status: data.status,
      requerAssinatura: data.requer_assinatura,
      textoContrato: data.texto_contrato,
      camposCustomizados: data.campos_customizados || [],
      camposCount: (data.campos_customizados || []).length,
      cursoEspecificoId: data.curso_especifico_id
    };
  },

  // Atualiza um modelo existente
  async update(ficha: any): Promise<void> {
    const { error } = await supabase
      .from('modelos_fichas')
      .update({
        nome: ficha.nome,
        tipo_curso: ficha.tipoCurso,
        status: ficha.status,
        requer_assinatura: ficha.requerAssinatura,
        texto_contrato: ficha.textoContrato,
        campos_customizados: ficha.camposCustomizados || [],
        curso_especifico_id: ficha.cursoEspecificoId || null
      })
      .eq('id', ficha.id);
      
    if (error) {
      console.error('Erro ao atualizar modelo de ficha:', error);
      throw error;
    }
  },

  // Exclui um modelo de ficha
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('modelos_fichas')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error('Erro ao excluir modelo de ficha:', error);
      throw error;
    }
  }
};
