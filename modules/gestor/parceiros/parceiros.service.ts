// File: modules/gestor/parceiros/parceiros.service.ts

import { supabase } from '../../../lib/supabase';
import { portalActivationService } from './portal-activation.service';
import { errorMessage, getFileExtension } from './utils/file-utils';
import { mapAlunoLookup, toCamel, toSnake } from './utils/parceiro-mappers';
import { validateAlunoProfessorIdentity } from './utils/parceiro-validators';
import { parceirosMatriculasService } from './parceiros-matriculas.service';
import { documentosAlunoService } from './documentos-aluno.service';

export const parceirosService = {
  async getAll(tipo?: string, filters?: { poloId?: string; includeGlobal?: boolean }) {
    let query = supabase.from('parceiros').select('*, polos(nome,cidade,estado)');
    let filterTipo: string | null = null;
    
    if (tipo && tipo !== 'todos') {
      filterTipo = tipo;
      if (tipo === 'professores') filterTipo = 'Professor';
      if (tipo === 'alunos') filterTipo = 'Aluno';
      if (tipo === 'pj') filterTipo = 'PJ';
      if (tipo === 'pf') filterTipo = 'PF';
      query = query.eq('tipo', filterTipo);
    }

    if (filters?.poloId && filters.poloId !== 'todos') {
      const scopedFilter = `polo_id.eq.${filters.poloId},polo_ids.cs.{${filters.poloId}}`;
      if (filters.includeGlobal && filterTipo !== 'Aluno') {
        query = filterTipo
          ? query.or(`${scopedFilter},polo_id.is.null`)
          : query.or(`${scopedFilter},and(polo_id.is.null,tipo.neq.Aluno)`);
      } else {
        query = query.or(scopedFilter);
      }
    }
    
    const { data, error } = await query.order('nome', { ascending: true });
    
    if (error) {
      console.error('Erro ao buscar parceiros:', error);
      throw error;
    }
    
    const partners = (data || []).map(toCamel);
    const alunoIds = partners.filter((partner) => partner?.tipo === 'Aluno').map((partner) => partner.id).filter(Boolean);
    let enrichedPartners = partners;

    if (alunoIds.length > 0) {
      const { data: matriculas, error: matriculasError } = await supabase
        .from('matriculas')
        .select('aluno_id, turma_id, status, data_matricula, turmas(id, nome, curso_id, cursos(id, nome, modalidade))')
        .in('aluno_id', alunoIds);

      if (matriculasError) {
        console.error('Erro ao buscar modalidades dos alunos:', matriculasError);
        throw matriculasError;
      }

      const alunoCursos = new Map<string, {
        modalidades: Set<string>;
        cursos: Set<string>;
        turmas: Set<string>;
        matriculas: Array<{
          turmaId: string;
          turmaNome: string;
          cursoId: string;
          cursoNome: string;
          modalidade: string;
          status: string;
          dataMatricula: string | null;
        }>;
      }>();

      (matriculas || []).forEach((matricula: any) => {
        const status = String(matricula.status || '').toUpperCase();
        const isVinculoAtual = !['CANCELADO', 'CANCELADA', 'DESISTENTE'].includes(status);

        const turma = Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas;
        const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
        if (!matricula.aluno_id || !turma) return;

        const current = alunoCursos.get(matricula.aluno_id) || {
          modalidades: new Set<string>(),
          cursos: new Set<string>(),
          turmas: new Set<string>(),
          matriculas: [],
        };

        if (isVinculoAtual) {
          if (curso?.modalidade) current.modalidades.add(String(curso.modalidade).toUpperCase());
          if (curso?.id) current.cursos.add(curso.id);
          if (matricula.turma_id) current.turmas.add(matricula.turma_id);
        }
        current.matriculas.push({
          turmaId: matricula.turma_id || turma.id || '',
          turmaNome: turma.nome || 'Turma sem nome',
          cursoId: curso?.id || '',
          cursoNome: curso?.nome || 'Curso não informado',
          modalidade: curso?.modalidade || '',
          status,
          dataMatricula: matricula.data_matricula || null,
        });
        alunoCursos.set(matricula.aluno_id, current);
      });

      enrichedPartners = partners.map((partner) => {
        const alunoInfo = alunoCursos.get(partner.id);
        if (!alunoInfo) return partner;

        return {
          ...partner,
          modalidadesAluno: Array.from(alunoInfo.modalidades),
          cursosAlunoIds: Array.from(alunoInfo.cursos),
          turmasAlunoIds: Array.from(alunoInfo.turmas),
          matriculasAluno: [...alunoInfo.matriculas].sort((a, b) => {
            const statusPriority = (item: typeof a) => item.status === 'ATIVO' ? 0 : 1;
            const priorityDiff = statusPriority(a) - statusPriority(b);
            if (priorityDiff !== 0) return priorityDiff;
            return String(b.dataMatricula || '').localeCompare(String(a.dataMatricula || ''));
          }),
        };
      });
    }

    try {
      const emailStatuses = await portalActivationService.getPartnerEmailStatuses(
        enrichedPartners.map((partner) => partner.id).filter(Boolean),
      );
      const statusByPartnerId = new Map(emailStatuses.map((status) => [status.partnerId, status]));

      return enrichedPartners.map((partner) => {
        const emailStatus = statusByPartnerId.get(partner.id);
        return emailStatus
          ? {
              ...partner,
              emailConfirmationStatus: emailStatus.status,
              authUserExists: emailStatus.authUserExists,
              emailConfirmed: emailStatus.emailConfirmed,
            }
          : partner;
      });
    } catch (statusError) {
      console.warn('Não foi possível consultar a confirmação dos e-mails:', statusError);
      return enrichedPartners.map((partner) => ({
        ...partner,
        emailConfirmationStatus: partner.email ? 'unknown' : 'no_email',
      }));
    }
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('parceiros')
      .select('*, polos(nome)')
      .eq('id', id)
      .single();
      
    if (error) {
      console.error('Erro ao buscar parceiro por id:', error);
      throw error;
    }
    
    return toCamel(data);
  },

  async create(data: any) {
    validateAlunoProfessorIdentity(data);
    if (data?.tipo === 'Aluno') {
      const existingAluno = await this.findAlunoParaVinculo(data.cpf || data.cpf_cnpj || data.email);
      if (existingAluno) return existingAluno;
    }

    const dbData = toSnake(data);
    const { data: inserted, error } = await supabase
      .from('parceiros')
      .insert(dbData)
      .select()
      .single();
      
    if (error) {
      if (data?.tipo === 'Aluno') {
        const existingAluno = await this.findAlunoParaVinculo(data.cpf || data.cpf_cnpj || data.email);
        if (existingAluno) return existingAluno;
      }
      console.error('Erro ao criar parceiro:', error);
      throw error;
    }
    
    return toCamel(inserted);
  },

  async update(id: string, data: any) {
    validateAlunoProfessorIdentity(data);
    const dbData = toSnake(data);
    const { data: updated, error } = await supabase
      .from('parceiros')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao atualizar parceiro:', error);
      throw error;
    }
    
    return toCamel(updated);
  },

  async uploadProfilePhoto(profileId: string, _currentProfile: any, file: File) {
    if (!profileId) {
      throw new Error('Perfil não identificado para atualizar a foto.');
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('Envie uma imagem em JPG, PNG ou WEBP.');
    }

    const fileExt = getFileExtension(file, 'jpg');
    const filePath = `${profileId}/perfil/foto_${Date.now()}.${fileExt}`;
    const { data, error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(filePath, file, {
        cacheControl: '3600',
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Erro no upload da foto do perfil:', uploadError);
      throw new Error(errorMessage(uploadError, 'Não foi possível enviar a foto para o storage'));
    }

    if (!data?.path) {
      throw new Error('Foto enviada, mas o storage não retornou o caminho do arquivo.');
    }

    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(data.path);

    const publicUrl = urlData.publicUrl;
    const { data: updatedPhoto, error: photoUpdateError } = await supabase
      .from('parceiros')
      .update({ foto_url: publicUrl })
      .eq('id', profileId)
      .select('foto_url')
      .maybeSingle();

    if (photoUpdateError) {
      console.error('Erro ao atualizar foto do perfil:', photoUpdateError);
      throw new Error(errorMessage(photoUpdateError, 'Foto enviada, mas não foi possível atualizar foto_url'));
    }

    if (!updatedPhoto) {
      throw new Error('Foto enviada, mas nenhum cadastro foi atualizado. Verifique se o perfil existe e se o usuário tem permissão para alterar este cadastro.');
    }

    return updatedPhoto.foto_url || publicUrl;
  },

  async delete(id: string) {
    return portalActivationService.deletePartner(id);
  },

  ...documentosAlunoService,

  ...parceirosMatriculasService,

  async getPolos() {
    const { data, error } = await supabase
      .from('polos')
      .select('*')
      .in('status', ['ativo', 'ATIVO'])
      .order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar polos:', error);
      throw error;
    }
    return data || [];
  },

  async findAlunoParaVinculo(identifier?: string | null) {
    const value = String(identifier || '').trim();
    if (!value) return null;

    const { data, error } = await supabase.rpc('buscar_aluno_global_para_vinculo', {
      p_identifier: value,
    });

    if (error) {
      console.error('Erro ao localizar aluno para vínculo:', error);
      return null;
    }

    const first = Array.isArray(data) ? data[0] : null;
    return first ? mapAlunoLookup(first) : null;
  },

  async getKpis() {
    const { data, error } = await supabase.rpc('get_parceiros_kpis');
    if (error) {
      console.error('Erro ao buscar KPIs dos parceiros:', error);
      throw error;
    }
    const kpi = data && data[0] ? data[0] : { 
      total_parceiros: 0, 
      total_parceiros_ativos: 0,
      total_alunos: 0, 
      total_alunos_ativos: 0, 
      total_alunos_inativos: 0, 
      total_professores: 0, 
      total_professores_ativos: 0, 
      total_professores_inativos: 0 
    };
    return {
      totalParceiros: Number(kpi.total_parceiros),
      totalParceirosAtivos: Number(kpi.total_parceiros_ativos),
      totalAlunosVinculados: Number(kpi.total_alunos),
      totalAlunosAtivos: Number(kpi.total_alunos_ativos),
      totalAlunosInativos: Number(kpi.total_alunos_inativos),
      totalProfessoresVinculados: Number(kpi.total_professores),
      totalProfessoresAtivos: Number(kpi.total_professores_ativos),
      totalProfessoresInativos: Number(kpi.total_professores_inativos)
    };
  }
};
