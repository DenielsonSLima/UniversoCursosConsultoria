// File: modules/gestor/biblioteca/biblioteca.service.ts

import { supabase } from '../../../lib/supabase';
import { LibraryDocument, LibraryFolder, TeacherRepository } from './biblioteca.types';

export const bibliotecaService = {
  // 1. Buscar Documentos
  async getDocuments(filters?: { 
    pastaId?: string | null; 
    teacherId?: string | null; 
    search?: string;
  }): Promise<LibraryDocument[]> {
    let query = supabase
      .from('biblioteca_documentos')
      .select('*, polos(nome)');

    if (filters?.pastaId !== undefined) {
      if (filters.pastaId === null) {
        query = query.is('pasta_id', null);
      } else {
        query = query.eq('pasta_id', filters.pastaId);
      }
    }

    if (filters?.teacherId !== undefined) {
      if (filters.teacherId === null) {
        query = query.is('teacher_id', null);
      } else {
        query = query.eq('teacher_id', filters.teacherId);
      }
    }

    if (filters?.search) {
      query = query.or(`titulo.ilike.%${filters.search}%,descricao.ilike.%${filters.search}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('Erro ao buscar documentos da biblioteca:', error);
      throw error;
    }

    return (data || []).map((doc: any) => ({
      id: doc.id,
      pastaId: doc.pasta_id,
      title: doc.titulo,
      description: doc.descricao || '',
      fileType: doc.tipo_arquivo,
      size: doc.tamanho,
      url: doc.arquivo_url,
      targetAudience: doc.publico_alvo,
      scope: doc.abrangencia,
      poloId: doc.polo_id,
      poloName: doc.polos?.nome || '',
      acessos: doc.acessos || 0,
      teacherId: doc.teacher_id,
      authorName: doc.author_name,
      createdAt: doc.created_at,
      cursoIds: doc.curso_ids || [],
      turmaIds: doc.turma_ids || [],
      disciplinaIds: doc.disciplina_ids || [],
      liberacaoTipo: doc.liberacao_tipo || 'IMEDIATO',
      liberacaoData: doc.liberacao_data,
      liberacaoDisciplinaId: doc.liberacao_disciplina_id,
      liberacaoDiasValidade: doc.liberacao_dias_validade
    }));
  },

  // 2. Buscar Pastas
  async getFolders(
    parentId: string | null = null, 
    teacherId: string | null = null
  ): Promise<LibraryFolder[]> {
    if (parentId === null && teacherId !== null) {
      const { data: existingFolders, error: checkError } = await supabase
        .from('biblioteca_pastas')
        .select('id')
        .eq('teacher_id', teacherId)
        .is('parent_id', null);
      
      if (!checkError && (!existingFolders || existingFolders.length === 0)) {
        const { data: teacher } = await supabase
          .from('parceiros')
          .select('nome')
          .eq('id', teacherId)
          .single();
        
        if (teacher) {
          await supabase.from('biblioteca_pastas').insert({
            nome: `Arquivos de ${teacher.nome}`,
            teacher_id: teacherId,
            parent_id: null
          });
        }
      }
    }

    let query = supabase.from('biblioteca_pastas').select('*');

    if (parentId === null) {
      query = query.is('parent_id', null);
    } else {
      query = query.eq('parent_id', parentId);
    }

    if (teacherId === null) {
      query = query.is('teacher_id', null);
    } else {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query.order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar pastas:', error);
      throw error;
    }

    return (data || []).map((folder: any) => ({
      id: folder.id,
      nome: folder.nome,
      parentId: folder.parent_id,
      teacherId: folder.teacher_id,
      createdAt: folder.created_at
    }));
  },

  // 3. Criar Pasta
  async createFolder(nome: string, parentId: string | null = null, teacherId: string | null = null): Promise<void> {
    const { error } = await supabase.from('biblioteca_pastas').insert({
      nome,
      parent_id: parentId || null,
      teacher_id: teacherId || null
    });

    if (error) {
      console.error('Erro ao criar pasta:', error);
      throw error;
    }
  },

  // 4. Renomear Pasta
  async renameFolder(id: string, newNome: string): Promise<void> {
    const { error } = await supabase
      .from('biblioteca_pastas')
      .update({ nome: newNome })
      .eq('id', id);

    if (error) {
      console.error('Erro ao renomear pasta:', error);
      throw error;
    }
  },

  // 5. Excluir Pasta (Cascateia no DB para subpastas e documentos)
  async deleteFolder(id: string): Promise<void> {
    const { error } = await supabase.from('biblioteca_pastas').delete().eq('id', id);
    if (error) {
      console.error('Erro ao excluir pasta:', error);
      throw error;
    }
  },

  // 6. Publicar Documento
  async uploadDocument(doc: Omit<LibraryDocument, 'id' | 'createdAt' | 'acessos' | 'authorName'>): Promise<void> {
    const { error } = await supabase.from('biblioteca_documentos').insert({
      pasta_id: doc.pastaId || null,
      titulo: doc.title,
      descricao: doc.description || null,
      tipo_arquivo: doc.fileType,
      tamanho: doc.size,
      arquivo_url: doc.url,
      publico_alvo: doc.targetAudience,
      abrangencia: doc.scope,
      polo_id: doc.poloId || null,
      teacher_id: doc.teacherId || null,
      author_name: 'Gestor',
      curso_ids: doc.cursoIds || [],
      turma_ids: doc.turmaIds || [],
      disciplina_ids: doc.disciplinaIds || [],
      liberacao_tipo: doc.liberacaoTipo || 'IMEDIATO',
      liberacao_data: doc.liberacaoData || null,
      liberacao_disciplina_id: doc.liberacaoDisciplinaId || null,
      liberacao_dias_validade: doc.liberacaoDiasValidade || null
    });

    if (error) {
      console.error('Erro ao publicar documento:', error);
      throw error;
    }
  },

  // 7. Excluir Documento
  async deleteDocument(id: string): Promise<void> {
    const { error } = await supabase.from('biblioteca_documentos').delete().eq('id', id);
    if (error) {
      console.error('Erro ao excluir documento:', error);
      throw error;
    }
  },

  // 8. Mover Documento
  async moveDocument(docId: string, targetFolderId: string | null): Promise<void> {
    const { error } = await supabase
      .from('biblioteca_documentos')
      .update({ pasta_id: targetFolderId })
      .eq('id', docId);

    if (error) {
      console.error('Erro ao mover documento:', error);
      throw error;
    }
  },

  // 9. Mover Pasta
  async moveFolder(folderId: string, targetFolderId: string | null): Promise<void> {
    const { error } = await supabase
      .from('biblioteca_pastas')
      .update({ parent_id: targetFolderId })
      .eq('id', folderId);

    if (error) {
      console.error('Erro ao mover pasta:', error);
      throw error;
    }
  },

  // 10. Incrementar Visualizações/Acessos
  async incrementAcessos(docId: string): Promise<void> {
    const { data } = await supabase
      .from('biblioteca_documentos')
      .select('acessos')
      .eq('id', docId)
      .single();

    const current = data?.acessos || 0;
    await supabase
      .from('biblioteca_documentos')
      .update({ acessos: current + 1 })
      .eq('id', docId);
  },

  // 11. Top 10 Acessados
  async getTop10Accessed(): Promise<LibraryDocument[]> {
    const { data, error } = await supabase
      .from('biblioteca_documentos')
      .select('*, polos(nome)')
      .order('acessos', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Erro ao buscar top 10 acessados:', error);
      throw error;
    }

    return (data || []).map((doc: any) => ({
      id: doc.id,
      pastaId: doc.pasta_id,
      title: doc.titulo,
      description: doc.descricao || '',
      fileType: doc.tipo_arquivo,
      size: doc.tamanho,
      url: doc.arquivo_url,
      targetAudience: doc.publico_alvo,
      scope: doc.abrangencia,
      poloId: doc.polo_id,
      poloName: doc.polos?.nome || '',
      acessos: doc.acessos || 0,
      teacherId: doc.teacher_id,
      authorName: doc.author_name,
      createdAt: doc.created_at,
      cursoIds: doc.curso_ids || [],
      turmaIds: doc.turma_ids || [],
      disciplinaIds: doc.disciplina_ids || [],
      liberacaoTipo: doc.liberacao_tipo || 'IMEDIATO',
      liberacaoData: doc.liberacao_data,
      liberacaoDisciplinaId: doc.liberacao_disciplina_id,
      liberacaoDiasValidade: doc.liberacao_dias_validade
    }));
  },

  // 12. Top 10 Recentes
  async getTop10Recent(): Promise<LibraryDocument[]> {
    const { data, error } = await supabase
      .from('biblioteca_documentos')
      .select('*, polos(nome)')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Erro ao buscar top 10 recentes:', error);
      throw error;
    }

    return (data || []).map((doc: any) => ({
      id: doc.id,
      pastaId: doc.pasta_id,
      title: doc.titulo,
      description: doc.descricao || '',
      fileType: doc.tipo_arquivo,
      size: doc.tamanho,
      url: doc.arquivo_url,
      targetAudience: doc.publico_alvo,
      scope: doc.abrangencia,
      poloId: doc.polo_id,
      poloName: doc.polos?.nome || '',
      acessos: doc.acessos || 0,
      teacherId: doc.teacher_id,
      authorName: doc.author_name,
      createdAt: doc.created_at,
      cursoIds: doc.curso_ids || [],
      turmaIds: doc.turma_ids || [],
      disciplinaIds: doc.disciplina_ids || [],
      liberacaoTipo: doc.liberacao_tipo || 'IMEDIATO',
      liberacaoData: doc.liberacao_data,
      liberacaoDisciplinaId: doc.liberacao_disciplina_id,
      liberacaoDiasValidade: doc.liberacao_dias_validade
    }));
  },

  // 13. Buscar Repositórios de Professores (Pastas baseadas em parceiros do tipo Professor)
  async getTeacherRepositories(): Promise<TeacherRepository[]> {
    const { data: teachers, error } = await supabase
      .from('parceiros')
      .select('id, nome, especialidade, updated_at')
      .eq('tipo', 'Professor')
      .eq('status', 'ATIVO')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar professores para biblioteca:', error);
      throw error;
    }

    // Garantir que cada professor ativo tenha uma pasta de repositório na biblioteca_pastas
    for (const t of (teachers || [])) {
      const { data: existingFolders } = await supabase
        .from('biblioteca_pastas')
        .select('id')
        .eq('teacher_id', t.id)
        .is('parent_id', null);
      
      if (!existingFolders || existingFolders.length === 0) {
        await supabase.from('biblioteca_pastas').insert({
          nome: `Arquivos de ${t.nome}`,
          teacher_id: t.id,
          parent_id: null
        });
      }
    }

    // Buscar contagem de documentos por professor
    const { data: docCounts } = await supabase
      .from('biblioteca_documentos')
      .select('teacher_id');

    const countsMap: { [key: string]: number } = {};
    (docCounts || []).forEach((doc: any) => {
      if (doc.teacher_id) {
        countsMap[doc.teacher_id] = (countsMap[doc.teacher_id] || 0) + 1;
      }
    });

    return (teachers || []).map((t: any) => ({
      teacherId: t.id,
      teacherName: t.nome,
      specialty: t.especialidade || 'Docente',
      documentsCount: countsMap[t.id] || 0,
      lastUpdate: t.updated_at ? t.updated_at.split('T')[0] : new Date().toISOString().split('T')[0]
    }));
  },

  // 14. Buscar Cursos Ativos
  async getCursos(): Promise<any[]> {
    const { data, error } = await supabase
      .from('cursos')
      .select('id, nome, modalidade')
      .eq('status', 'ativo')
      .order('nome', { ascending: true });
    
    if (error) {
      console.error('Erro ao buscar cursos:', error);
      throw error;
    }
    return data || [];
  },

  // 15. Buscar Turmas
  async getTurmas(): Promise<any[]> {
    const { data, error } = await supabase
      .from('turmas')
      .select('id, nome, codigo, curso_id')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar turmas:', error);
      throw error;
    }
    return data || [];
  },

  // 16. Buscar Disciplinas
  async getDisciplinas(): Promise<any[]> {
    const { data, error } = await supabase
      .from('disciplinas')
      .select('id, nome, modulo_id, modulos(curso_id)')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar disciplinas:', error);
      throw error;
    }
    return (data || []).map((d: any) => ({
      id: d.id,
      nome: d.nome,
      moduloId: d.modulo_id,
      cursoId: d.modulos?.curso_id || null
    }));
  },

  // 17. Atualizar Permissões e Regras de Liberação do Documento
  async updateDocumentPermissions(docId: string, data: Partial<LibraryDocument>): Promise<void> {
    const { error } = await supabase
      .from('biblioteca_documentos')
      .update({
        publico_alvo: data.targetAudience,
        abrangencia: data.scope,
        polo_id: data.poloId || null,
        curso_ids: data.cursoIds || [],
        turma_ids: data.turmaIds || [],
        disciplina_ids: data.disciplinaIds || [],
        liberacao_tipo: data.liberacaoTipo || 'IMEDIATO',
        liberacao_data: data.liberacaoData || null,
        liberacao_disciplina_id: data.liberacaoDisciplinaId || null,
        liberacao_dias_validade: data.liberacaoDiasValidade || null
      })
      .eq('id', docId);

    if (error) {
      console.error('Erro ao atualizar permissões do documento:', error);
      throw error;
    }
  },

  // 18. Copiar Documento
  async copyDocument(docId: string, targetFolderId: string | null): Promise<void> {
    // Buscar documento original
    const { data: doc, error: fetchError } = await supabase
      .from('biblioteca_documentos')
      .select('*')
      .eq('id', docId)
      .single();
    
    if (fetchError || !doc) {
      console.error('Erro ao buscar documento para copiar:', fetchError);
      throw fetchError || new Error('Documento não encontrado.');
    }

    // Determinar o teacher_id correto baseado na pasta destino
    let teacherId = null;
    if (targetFolderId) {
      const { data: folder } = await supabase
        .from('biblioteca_pastas')
        .select('teacher_id')
        .eq('id', targetFolderId)
        .single();
      teacherId = folder?.teacher_id || null;
    }

    // Inserir cópia
    const { error: insertError } = await supabase
      .from('biblioteca_documentos')
      .insert({
        pasta_id: targetFolderId,
        titulo: doc.titulo + ' (Cópia)',
        descricao: doc.descricao,
        tipo_arquivo: doc.tipo_arquivo,
        tamanho: doc.tamanho,
        arquivo_url: doc.arquivo_url,
        publico_alvo: doc.publico_alvo,
        abrangencia: doc.abrangencia,
        polo_id: doc.polo_id,
        curso_ids: doc.curso_ids,
        turma_ids: doc.turma_ids,
        disciplina_ids: doc.disciplina_ids,
        liberacao_tipo: doc.liberacao_tipo,
        liberacao_data: doc.liberacao_data,
        liberacao_disciplina_id: doc.liberacao_disciplina_id,
        liberacao_dias_validade: doc.liberacao_dias_validade,
        teacher_id: teacherId,
        author_name: doc.author_name
      });

    if (insertError) {
      console.error('Erro ao copiar documento:', insertError);
      throw insertError;
    }
  }
};
