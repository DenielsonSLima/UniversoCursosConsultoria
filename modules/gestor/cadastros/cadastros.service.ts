// File: modules/gestor/cadastros/cadastros.service.ts

import { supabase } from '../../../lib/supabase';
import { Curso, Modulo } from './cadastros.types';

export const cadastrosService = {
  // Busca todos os cursos de uma modalidade (ativos e inativos para abas separadas)
  // Busca todos os cursos de uma modalidade com KPIs agregados (RPC)
  async getCursosByModalidade(modalidade: 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO' | 'EAD' | 'SUPERIOR'): Promise<Curso[]> {
    const { data, error } = await supabase
      .rpc('get_cursos_com_kpis', { p_modalidade: modalidade });
    
    if (error) {
      console.error(`Erro ao buscar cursos da modalidade ${modalidade}:`, error);
      throw error;
    }
    
    return data || [];
  },

  // Busca um curso pelo ID
  async getCursoById(id: string): Promise<Curso> {
    const { data, error } = await supabase
      .from('cursos')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error(`Erro ao buscar curso com ID ${id}:`, error);
      throw error;
    }
    
    return data;
  },

  // Cria um novo curso
  async createCurso(curso: Omit<Curso, 'id'>): Promise<Curso> {
    const { data, error } = await supabase
      .from('cursos')
      .insert({
        nome: curso.nome,
        carga_horaria: curso.carga_horaria,
        modalidade: curso.modalidade,
        status: curso.status,
        area: curso.area || 'Outros',
        descricao: curso.descricao || '',
        versao: curso.versao || '1.0',
        parceiro_instituicao: curso.parceiro_instituicao || null,
        parceiro_logo_url: curso.parceiro_logo_url || null,
        imagem_url: curso.imagem_url || null,
        duracao_meses: curso.duracao_meses || null,
        publicar_site: curso.publicar_site || false,
        imagem_detalhe_1: curso.imagem_detalhe_1 || null,
        imagem_detalhe_2: curso.imagem_detalhe_2 || null
      })
      .select()
      .single();
      
      if (error) {
        console.error('Erro ao criar curso:', error);
        throw error;
      }
      
      return data;
  },

  // Atualiza dados do curso
  async updateCurso(curso: Curso): Promise<void> {
    const { error } = await supabase
      .from('cursos')
      .update({
        nome: curso.nome,
        carga_horaria: curso.carga_horaria,
        status: curso.status,
        area: curso.area,
        descricao: curso.descricao,
        versao: curso.versao,
        parceiro_instituicao: curso.parceiro_instituicao || null,
        parceiro_logo_url: curso.parceiro_logo_url || null,
        imagem_url: curso.imagem_url || null,
        duracao_meses: curso.duracao_meses || null,
        publicar_site: curso.publicar_site !== undefined ? curso.publicar_site : false,
        imagem_detalhe_1: curso.imagem_detalhe_1 !== undefined ? curso.imagem_detalhe_1 : null,
        imagem_detalhe_2: curso.imagem_detalhe_2 !== undefined ? curso.imagem_detalhe_2 : null
      })
      .eq('id', curso.id);
      
    if (error) {
      console.error('Erro ao atualizar curso:', error);
      throw error;
    }
  },

  // Duplica um curso com toda a sua grade curricular
  async duplicateCurso(cursoId: string, novoNome: string, novaVersao: string): Promise<Curso> {
    // 1. Busca o curso original
    const { data: curso, error: cursoError } = await supabase
      .from('cursos')
      .select('*')
      .eq('id', cursoId)
      .single();
      
    if (cursoError) {
      console.error('Erro ao buscar curso original para duplicar:', cursoError);
      throw cursoError;
    }

    // 2. Cria o novo curso clonado
    const { data: novoCurso, error: insertError } = await supabase
      .from('cursos')
      .insert({
        nome: novoNome,
        carga_horaria: curso.carga_horaria,
        modalidade: curso.modalidade,
        status: 'ativo',
        area: curso.area,
        descricao: curso.descricao,
        versao: novaVersao
      })
      .select()
      .single();
      
    if (insertError) {
      console.error('Erro ao clonar curso:', insertError);
      throw insertError;
    }

    // 3. Busca a grade do curso original
    const gradeOriginal = await this.getGrade(cursoId);

    // 4. Copia os módulos, disciplinas e aulas para o novo curso
    await this.saveGrade(novoCurso.id, gradeOriginal);

    return novoCurso;
  },

  // Exclui/Deleta um curso definitivamente (apenas se não houver turmas vinculadas)
  async deleteCurso(cursoId: string): Promise<void> {
    // 1. Verificar se há turmas vinculadas
    const { count, error: countError } = await supabase
      .from('turmas')
      .select('*', { count: 'exact', head: true })
      .eq('curso_id', cursoId);

    if (countError) {
      console.error('Erro ao verificar turmas vinculadas:', countError);
      throw countError;
    }
    
    if (count && count > 0) {
      throw new Error(`Não é possível excluir o curso pois existem ${count} turma(s) vinculada(s) a ele.`);
    }

    // 2. Realizar a exclusão física do curso (cascata deletará módulos/disciplinas/aulas)
    const { error } = await supabase
      .from('cursos')
      .delete()
      .eq('id', cursoId);
      
    if (error) {
      console.error('Erro ao excluir curso do banco:', error);
      throw error;
    }
  },

  // Busca os KPIs de carga horária da grade curricular via RPC no Supabase
  async getCursoGradeKpis(cursoId: string): Promise<{
    carga_horaria_total: number;
    carga_horaria_cadastrada: number;
    carga_horaria_restante: number;
  }> {
    const { data, error } = await supabase
      .rpc('get_curso_grade_kpis', { p_curso_id: cursoId });

    if (error) {
      console.error('Erro ao buscar KPIs da grade curricular:', error);
      throw error;
    }

    // A resposta da RPC retorna uma linha (ou array com 1 item se chamado via query normal)
    const row = Array.isArray(data) ? data[0] : data;

    return {
      carga_horaria_total: row?.carga_horaria_total || 0,
      carga_horaria_cadastrada: row?.carga_horaria_cadastrada || 0,
      carga_horaria_restante: row?.carga_horaria_restante || 0
    };
  },

  // Altera o status do curso (ativo/inativo)
  async toggleStatus(cursoId: string, novoStatus: 'ativo' | 'inativo'): Promise<void> {
    const { error } = await supabase
      .from('cursos')
      .update({ status: novoStatus })
      .eq('id', cursoId);
      
    if (error) {
      console.error('Erro ao mudar status do curso:', error);
      throw error;
    }
  },

  // Busca a grade curricular (módulos -> disciplinas -> aulas)
  async getGrade(cursoId: string): Promise<Modulo[]> {
    const { data: modulosData, error: modError } = await supabase
      .from('modulos')
      .select('*, disciplinas(*, aulas(*))')
      .eq('curso_id', cursoId)
      .order('created_at', { ascending: true });
      
    if (modError) {
      console.error('Erro ao buscar grade curricular:', modError);
      throw modError;
    }

    // Ordena disciplinas e aulas localmente por criacao
    return (modulosData || []).map(m => {
      const disciplinasSorted = (m.disciplinas || []).sort((a: any, b: any) => 
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
      
      return {
        id: m.id,
        nome: m.nome,
        disciplinas: disciplinasSorted.map((d: any) => {
          const aulasSorted = (d.aulas || []).sort((a: any, b: any) => 
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
          );
          
          return {
            id: d.id,
            nome: d.nome,
            cargaHoraria: d.carga_horaria,
            cargaHorariaTeoria: d.carga_horaria_teoria || 0,
            cargaHorariaPratica: d.carga_horaria_pratica || 0,
            cargaHorariaEstagio: d.carga_horaria_estagio || 0,
            descricao: d.descricao || '',
            aulas: aulasSorted.map((a: any) => ({
              id: a.id,
              titulo: a.titulo,
              cargaHoraria: parseFloat(a.carga_horaria)
            }))
          };
        })
      };
    });
  },

  // Salva a grade curricular (deleta a antiga e insere a nova de forma transacional)
  async saveGrade(cursoId: string, modulos: Modulo[]): Promise<void> {
    // 1. Deleta os módulos antigos do curso (cascata cuida das disciplinas e aulas)
    const { error: deleteError } = await supabase
      .from('modulos')
      .delete()
      .eq('curso_id', cursoId);
      
    if (deleteError) {
      console.error('Erro ao limpar grade anterior:', deleteError);
      throw deleteError;
    }

    // 2. Insere os novos módulos
    for (const modulo of modulos) {
      const { data: insertedModulo, error: modError } = await supabase
        .from('modulos')
        .insert({
          curso_id: cursoId,
          nome: modulo.nome
        })
        .select()
        .single();
        
      if (modError) {
        console.error('Erro ao salvar módulo:', modError);
        throw modError;
      }

      // 3. Insere as disciplinas
      for (const disc of modulo.disciplinas) {
        const { data: insertedDisc, error: discError } = await supabase
          .from('disciplinas')
          .insert({
            modulo_id: insertedModulo.id,
            nome: disc.nome,
            carga_horaria: disc.cargaHoraria,
            carga_horaria_teoria: disc.cargaHorariaTeoria || 0,
            carga_horaria_pratica: disc.cargaHorariaPratica || 0,
            carga_horaria_estagio: disc.cargaHorariaEstagio || 0,
            descricao: disc.descricao || ''
          })
          .select()
          .single();
          
        if (discError) {
          console.error('Erro ao salvar disciplina:', discError);
          throw discError;
        }

        // 4. Insere as aulas em lote
        if (disc.aulas && disc.aulas.length > 0) {
          const aulasToInsert = disc.aulas.map(aula => ({
            disciplina_id: insertedDisc.id,
            titulo: aula.titulo,
            carga_horaria: aula.cargaHoraria
          }));

          const { error: aulaError } = await supabase
            .from('aulas')
            .insert(aulasToInsert);
            
          if (aulaError) {
            console.error('Erro ao salvar aulas:', aulaError);
            throw aulaError;
          }
        }
      }
    }
  }
};
