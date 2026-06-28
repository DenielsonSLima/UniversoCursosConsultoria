import { supabase } from '../../../../lib/supabase';
import { documentValidationService } from '../../../shared/document-validation/document-validation.service';
import {
  SecretariaAlunoResumo,
  SecretariaContext,
  SecretariaDocumentoId,
  SecretariaMatriculaResumo,
  SecretariaTurmaResumo,
} from './secretaria-documentos.types';

const normalizeSearchTerm = (term: string) =>
  term.trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ');

export const getSecretariaContext = (): SecretariaContext => ({
  userId:
    window.sessionStorage.getItem('logged_user_id') ||
    'f1111111-1111-1111-1111-111111111111',
  poloId:
    window.sessionStorage.getItem('current_polo_id') ||
    window.sessionStorage.getItem('active_polo_id') ||
    '44444444-4444-4444-4444-444444444444',
});

export const secretariaDocumentosService = {
  async searchAlunos(poloId: string, term: string): Promise<SecretariaAlunoResumo[]> {
    const safeTerm = normalizeSearchTerm(term);
    if (safeTerm.length < 2) return [];

    const { data, error } = await supabase
      .from('parceiros')
      .select('id, nome, cpf_cnpj, email, telefone, foto_url')
      .eq('tipo', 'Aluno')
      .or(`polo_id.eq.${poloId},polo_id.is.null`)
      .or(`nome.ilike.%${safeTerm}%,cpf_cnpj.ilike.%${safeTerm}%`)
      .order('nome', { ascending: true })
      .limit(20);

    if (error) throw error;
    return (data || []).map((aluno) => ({
      id: aluno.id,
      nome: aluno.nome,
      cpf: aluno.cpf_cnpj,
      email: aluno.email,
      telefone: aluno.telefone,
      fotoUrl: aluno.foto_url,
    }));
  },

  async getMatriculas(
    alunoId: string,
    poloId: string,
    technicalOnly: boolean,
    completedOnly = false,
    activeEnrollmentOnly = false,
    activeTurmaOnly = false,
    enrollmentStatuses: string[] = []
  ): Promise<SecretariaMatriculaResumo[]> {
    let query = supabase
      .from('matriculas')
      .select('id, status, data_matricula, turma_id, turmas!inner(id, nome, codigo, status, polo_id, cursos!inner(nome, modalidade))')
      .eq('aluno_id', alunoId)
      .or(`polo_id.eq.${poloId},polo_id.is.null`, { foreignTable: 'turmas' });

    if (technicalOnly) query = query.eq('turmas.cursos.modalidade', 'TECNICO');
    if (activeEnrollmentOnly) query = query.eq('status', 'ATIVO');
    if (activeTurmaOnly) query = query.eq('turmas.status', 'EM_ANDAMENTO');
    if (enrollmentStatuses.length) query = query.in('status', enrollmentStatuses);
    if (completedOnly) query = query.eq('status', 'CONCLUIDO');

    const { data, error } = await query.order('data_matricula', { ascending: false });
    if (error) throw error;

    return (data || []).map((matricula: any) => ({
      id: matricula.id,
      status: matricula.status,
      dataMatricula: matricula.data_matricula || null,
      turmaId: matricula.turma_id,
      turmaNome: matricula.turmas?.nome || '',
      turmaCodigo: matricula.turmas?.codigo || '',
      cursoNome: matricula.turmas?.cursos?.nome || '',
      modalidade: matricula.turmas?.cursos?.modalidade || '',
      poloId: matricula.turmas?.polo_id || poloId,
    }));
  },

  async getTurmas(
    poloId: string,
    technicalOnly: boolean,
    activeTurmaOnly = false
  ): Promise<SecretariaTurmaResumo[]> {
    let query = supabase
      .from('turmas')
      .select('id, nome, codigo, turno, status, cursos!inner(nome, modalidade)')
      .or(`polo_id.eq.${poloId},polo_id.is.null`)
      .order('nome', { ascending: true });

    if (technicalOnly) query = query.eq('cursos.modalidade', 'TECNICO');
    if (activeTurmaOnly) query = query.eq('status', 'EM_ANDAMENTO');

    const { data, error } = await query;
    if (error) throw error;

    const turmas = data || [];
    const counts = await Promise.all(
      turmas.map(async (turma: any) => {
        const { count, error: countError } = await supabase
          .from('matriculas')
          .select('id', { count: 'exact', head: true })
          .eq('turma_id', turma.id)
          .eq('status', 'ATIVO');
        if (countError) throw countError;
        return count || 0;
      })
    );

    return turmas.map((turma: any, index) => ({
      id: turma.id,
      nome: turma.nome,
      codigo: turma.codigo,
      cursoNome: turma.cursos?.nome || '',
      modalidade: turma.cursos?.modalidade || '',
      turno: turma.turno,
      status: turma.status,
      totalAlunos: counts[index],
    }));
  },

  async registrarEmissao(input: {
    context: SecretariaContext;
    documento: SecretariaDocumentoId;
    modo: 'individual' | 'lote';
    alunoId?: string;
    matriculaId?: string;
    turmaId?: string;
    technicalOnly?: boolean;
    activeEnrollmentOnly?: boolean;
    activeTurmaOnly?: boolean;
    completedOnly?: boolean;
    enrollmentStatuses?: string[];
    referencePeriod?: string;
  }) {
    let query = supabase
      .from('matriculas')
      .select(`
        id, status, data_matricula, aluno_id, turma_id,
        parceiros!inner(nome, cpf_cnpj, data_nascimento),
        turmas!inner(nome, codigo, polo_id, cursos!inner(nome, modalidade), polos!inner(nome))
      `)
      .or(`polo_id.eq.${input.context.poloId},polo_id.is.null`, { foreignTable: 'turmas' });

    if (input.modo === 'individual') {
      query = query.eq('id', input.matriculaId!);
    } else {
      query = query.eq('turma_id', input.turmaId!);
    }
    if (input.technicalOnly) query = query.eq('turmas.cursos.modalidade', 'TECNICO');
    if (input.activeEnrollmentOnly) query = query.eq('status', 'ATIVO');
    if (input.activeTurmaOnly) query = query.eq('turmas.status', 'EM_ANDAMENTO');
    if (input.enrollmentStatuses?.length) query = query.in('status', input.enrollmentStatuses);
    if (input.completedOnly) query = query.eq('status', 'CONCLUIDO');

    const { data: matriculas, error: matriculasError } = await query;
    if (matriculasError) throw matriculasError;
    if (!matriculas?.length) throw new Error('Nenhuma matrícula elegível para emissão.');

    const records = await Promise.all(
      matriculas.map((matricula: any) =>
        documentValidationService.issue({
          type: input.documento,
          enrollmentId: matricula.id,
          issuedBy: input.context.userId,
          referencePeriod: input.referencePeriod,
          sourceReference:
            input.documento === 'transferencia'
              ? `${matricula.id}_transferencia`
              : input.documento === 'termo_estagio'
              ? `${matricula.id}_contrato_principal`
              : undefined,
          registerReissue: true,
        })
      )
    );
    const issuedAt = records[0].issuedAt;
    const expiresAt = records[0].expiresAt;

    return {
      documento: input.documento,
      modo: input.modo,
      status: 'PREPARADO',
      issuedAt,
      expiresAt,
      codes: records.map((record) => record.code),
    };
  },
};
