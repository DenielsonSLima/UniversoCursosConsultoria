import { supabase } from '../../../../lib/supabase';
import { formatMatricula } from '../../../../lib/academicUtils';
import { documentValidationService } from '../../../shared/document-validation/document-validation.service';
import type { ValidatableDocumentType } from '../../../shared/document-validation/document-validation.types';
import {
  crachaPeriodoEleitoralService,
  isCrachaEleitoralTemplateAvailable,
} from '../../cadastros/modelos-documentos/cracha-periodo-eleitoral/cracha-periodo-eleitoral.service';
import {
  fichasMatriculaService,
} from '../../cadastros/ficha-matricula/fichas-matricula.service';
import {
  pastaIdentificacaoService,
} from '../../cadastros/ficha-matricula/document-layouts';
import {
  SecretariaAlunoResumo,
  SecretariaContext,
  SecretariaDocumentoId,
  SecretariaMatriculaResumo,
  SecretariaModuloResumo,
  SecretariaTurmaResumo,
} from './secretaria-documentos.types';
import type { EmissionLog } from '../historico-emissoes/historico-emissoes.types';

const normalizeSearchTerm = (term: string) =>
  term.trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ');

const buildStudentRegistrationSnapshot = (matricula: any) => ({
  studentName: matricula.parceiros?.nome || '',
  studentSocialName: matricula.parceiros?.nome_social || '',
  studentCpf: matricula.parceiros?.cpf_cnpj || '',
  studentBirthDate: matricula.parceiros?.data_nascimento || '',
  studentPhotoUrl: matricula.parceiros?.foto_url || null,
  studentEmail: matricula.parceiros?.email || '',
  studentPhone: matricula.parceiros?.telefone || '',
  studentSex: matricula.parceiros?.sexo || '',
  studentMaritalStatus: matricula.parceiros?.estado_civil || '',
  studentRaceColor: matricula.parceiros?.raca_cor || '',
  studentRg: matricula.parceiros?.rg || '',
  studentDocumentType: matricula.parceiros?.tipo_documento || '',
  studentRgIssuer: matricula.parceiros?.orgao_emissor || '',
  studentRgState: matricula.parceiros?.rg_uf_emissao || '',
  studentRgIssueDate: matricula.parceiros?.rg_data_emissao || '',
  studentNationality: matricula.parceiros?.nacionalidade || '',
  studentBirthplace: matricula.parceiros?.naturalidade || '',
  studentVoterId: matricula.parceiros?.titulo_eleitor || '',
  studentReservist: matricula.parceiros?.reservista || '',
  studentMotherName: matricula.parceiros?.nome_mae || '',
  studentFatherName: matricula.parceiros?.nome_pai || '',
  highSchoolInstitution: matricula.parceiros?.escola_ensino_medio || '',
  highSchoolCompletionYear: matricula.parceiros?.ano_conclusao_ensino_medio || '',
  studentPcd: matricula.parceiros?.pcd ? 'SIM' : 'NÃO',
  studentPcdType: matricula.parceiros?.pcd_tipo || '',
  studentZipCode: matricula.parceiros?.cep || '',
  studentStreet: matricula.parceiros?.endereco || '',
  studentAddressNumber: matricula.parceiros?.numero || '',
  studentAddressComplement: matricula.parceiros?.complemento || '',
  studentDistrict: matricula.parceiros?.bairro || '',
  studentCity: matricula.parceiros?.cidade || '',
  studentState: matricula.parceiros?.uf || '',
  studentResponsibleName: matricula.parceiros?.responsavel_nome || '',
  studentResponsibleCpf: matricula.parceiros?.responsavel_cpf || '',
  studentResponsibleRelation: matricula.parceiros?.responsavel_parentesco || '',
  studentResponsiblePhone: matricula.parceiros?.responsavel_telefone || '',
  studentNotes: matricula.parceiros?.observacao || '',
  studentMatricula: formatMatricula(
    matricula.id,
    matricula.data_matricula,
    matricula.turmas?.polo_id
  ),
  courseName: matricula.turmas?.cursos?.nome || '',
  courseModality: matricula.turmas?.cursos?.modalidade || '',
  courseHours: Number(matricula.turmas?.cursos?.carga_horaria || 0),
  courseArea: matricula.turmas?.cursos?.area || '',
  courseTechnologicalAxis: matricula.turmas?.cursos?.eixo_tecnologico || '',
  courseProfessionalProfile: matricula.turmas?.cursos?.perfil_profissional_conclusao || '',
  courseStartDate: matricula.turmas?.data_inicio || '',
  classShift: matricula.turmas?.turno || '',
  className: matricula.turmas?.nome || '',
  unitName: matricula.turmas?.polos?.nome || '',
  enrollmentStatus: matricula.status || '',
  enrollmentDate: matricula.data_matricula || '',
});

const normalizeCursoModalidadeFilter = (modalidade?: string | null) => {
  const normalized = String(modalidade || '').trim().toUpperCase();
  if (normalized === 'ESPECIALIZACAO') {
    return ['ESPECIALIZACAO', 'SUPERIOR'] as const;
  }
  return normalized ? [normalized] as const : [];
};

const searchSecretariaStudents = async (
  poloId: string,
  term: string,
  documento?: SecretariaDocumentoId,
) => {
  const safeTerm = normalizeSearchTerm(term);
  if (safeTerm.length < 2) return [];

  const { data, error } = await supabase.rpc('search_secretaria_students_secure', {
    p_polo_id: poloId,
    p_search: safeTerm,
    p_limit: 20,
    p_documento: documento || null,
  });
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((aluno: any) => ({
    ...aluno,
    matricula: aluno.matricula_id
      ? formatMatricula(
          aluno.matricula_id,
          aluno.matricula_data,
          aluno.turma_polo_id || poloId,
        )
      : '',
    cursoNome: aluno.curso_nome || '',
    turmaNome: aluno.turma_nome || '',
    turmaCodigo: aluno.turma_codigo || '',
    matriculaStatus: aluno.matricula_status || '',
  }));
};

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
  async searchAlunos(
    poloId: string,
    term: string,
    documento?: SecretariaDocumentoId,
  ): Promise<SecretariaAlunoResumo[]> {
    const alunos = await searchSecretariaStudents(poloId, term, documento);
    return alunos.map((aluno: any) => ({
      id: aluno.id,
      nome: aluno.nome,
      cpf: aluno.cpf_cnpj,
      email: aluno.email,
      telefone: aluno.telefone,
      fotoUrl: aluno.foto_url,
      matricula: aluno.matricula,
      cursoNome: aluno.cursoNome,
      turmaNome: aluno.turmaNome,
      turmaCodigo: aluno.turmaCodigo,
      matriculaStatus: aluno.matriculaStatus,
    }));
  },

  async searchAlunosDetalhados(
    poloId: string,
    term: string,
    documento?: SecretariaDocumentoId,
  ): Promise<any[]> {
    return searchSecretariaStudents(poloId, term, documento);
  },

  async getMatriculas(
    alunoId: string,
    poloId: string,
    technicalOnly: boolean,
    completedOnly = false,
    activeEnrollmentOnly = false,
    activeTurmaOnly = false,
    enrollmentStatuses: string[] = [],
    internshipOnly = false
  ): Promise<SecretariaMatriculaResumo[]> {
    let query = supabase
      .from('matriculas')
      .select('id, status, data_matricula, turma_id, turmas!inner(id, nome, codigo, status, polo_id, cursos!inner(id, nome, modalidade))')
      .eq('aluno_id', alunoId)
      .or(`polo_id.eq.${poloId},polo_id.is.null`, { foreignTable: 'turmas' });

    if (technicalOnly) query = query.eq('turmas.cursos.modalidade', 'TECNICO');
    if (activeEnrollmentOnly) query = query.eq('status', 'ATIVO');
    if (activeTurmaOnly) query = query.eq('turmas.status', 'EM_ANDAMENTO');
    if (enrollmentStatuses.length) query = query.in('status', enrollmentStatuses);
    if (completedOnly) query = query.eq('status', 'CONCLUIDO');

    const { data, error } = await query.order('data_matricula', { ascending: false });
    if (error) throw error;

    let eligibleRows = data || [];
    if (internshipOnly && eligibleRows.length) {
      const turmaIds = [...new Set(eligibleRows.map((matricula: any) => matricula.turma_id).filter(Boolean))];
      const { data: estagios, error: estagiosError } = await supabase
        .from('matriculas_estagios')
        .select('aluno_id, turma_id')
        .eq('aluno_id', alunoId)
        .in('turma_id', turmaIds);
      if (estagiosError) throw estagiosError;
      const turmasComEstagio = new Set((estagios || []).map((estagio: any) => estagio.turma_id));
      eligibleRows = eligibleRows.filter((matricula: any) => turmasComEstagio.has(matricula.turma_id));
    }

    return eligibleRows.map((matricula: any) => ({
      id: matricula.id,
      status: matricula.status,
      dataMatricula: matricula.data_matricula || null,
      turmaId: matricula.turma_id,
      turmaNome: matricula.turmas?.nome || '',
      turmaCodigo: matricula.turmas?.codigo || '',
      cursoId: matricula.turmas?.cursos?.id || '',
      cursoNome: matricula.turmas?.cursos?.nome || '',
      modalidade: matricula.turmas?.cursos?.modalidade || '',
      poloId: matricula.turmas?.polo_id || poloId,
    }));
  },

  async getTurmas(
    poloId: string,
    technicalOnly: boolean,
    activeTurmaOnly = false,
    internshipOnly = false,
    modalidadeFilter?: string | null
  ): Promise<SecretariaTurmaResumo[]> {
    let query = supabase
      .from('turmas')
      .select('id, nome, codigo, turno, status, cursos!inner(id, nome, modalidade)')
      .or(`polo_id.eq.${poloId},polo_id.is.null`)
      .order('nome', { ascending: true });

    if (technicalOnly) query = query.eq('cursos.modalidade', 'TECNICO');
    const modalidades = normalizeCursoModalidadeFilter(
      modalidadeFilter || (technicalOnly ? 'TECNICO' : '')
    );
    if (modalidades.length > 1) {
      query = query.in('cursos.modalidade', modalidades);
    } else if (modalidades.length === 1) {
      query = query.eq('cursos.modalidade', modalidades[0]);
    }
    if (activeTurmaOnly) query = query.eq('status', 'EM_ANDAMENTO');

    const { data, error } = await query;
    if (error) throw error;

    let turmas = data || [];
    const internshipCounts = new Map<string, number>();
    if (internshipOnly && turmas.length) {
      const { data: estagios, error: estagiosError } = await supabase
        .from('matriculas_estagios')
        .select('turma_id, aluno_id')
        .in('turma_id', turmas.map((turma: any) => turma.id));
      if (estagiosError) throw estagiosError;
      const turmaIds = new Set((estagios || []).map((estagio: any) => estagio.turma_id));
      const alunosPorTurma = new Map<string, Set<string>>();
      (estagios || []).forEach((estagio: any) => {
        const alunos = alunosPorTurma.get(estagio.turma_id) || new Set<string>();
        alunos.add(estagio.aluno_id);
        alunosPorTurma.set(estagio.turma_id, alunos);
      });
      alunosPorTurma.forEach((alunos, turmaId) => internshipCounts.set(turmaId, alunos.size));
      turmas = turmas.filter((turma: any) => turmaIds.has(turma.id));
    }
    const activeEnrollmentCounts = new Map<string, number>();
    if (!internshipOnly && turmas.length) {
      const { data: activeEnrollments, error: activeEnrollmentsError } = await supabase
        .from('matriculas')
        .select('turma_id')
        .in('turma_id', turmas.map((turma: any) => turma.id))
        .eq('status', 'ATIVO');
      if (activeEnrollmentsError) throw activeEnrollmentsError;
      (activeEnrollments || []).forEach((enrollment: any) => {
        activeEnrollmentCounts.set(
          enrollment.turma_id,
          (activeEnrollmentCounts.get(enrollment.turma_id) || 0) + 1
        );
      });
    }

    return turmas.map((turma: any) => ({
      id: turma.id,
      nome: turma.nome,
      codigo: turma.codigo,
      cursoId: turma.cursos?.id || '',
      cursoNome: turma.cursos?.nome || '',
      modalidade: turma.cursos?.modalidade || '',
      turno: turma.turno,
      status: turma.status,
      totalAlunos: internshipOnly
        ? internshipCounts.get(turma.id) || 0
        : activeEnrollmentCounts.get(turma.id) || 0,
    }));
  },

  async getTurmaModulos(turmaId: string): Promise<SecretariaModuloResumo[]> {
    const { data, error } = await supabase
      .from('turmas_disciplinas')
      .select('disciplinas!inner(modulos!inner(id, nome, created_at))')
      .eq('turma_id', turmaId);
    if (error) throw error;

    const modulesById = new Map<string, SecretariaModuloResumo>();
    (data || []).forEach((item: any) => {
      const modulo = item.disciplinas?.modulos;
      if (!modulo?.id || modulesById.has(modulo.id)) return;
      modulesById.set(modulo.id, {
        id: modulo.id,
        nome: modulo.nome || 'Módulo',
        ordem: new Date(modulo.created_at || 0).getTime(),
      });
    });

    return [...modulesById.values()].sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  },

  async registrarEmissao(input: {
    context: SecretariaContext;
    documento: SecretariaDocumentoId;
    modo: 'individual' | 'lote' | 'custom';
    alunoId?: string;
    matriculaId?: string;
    matriculaIds?: string[];
    turmaId?: string;
    allStudentsInPolo?: boolean;
    technicalOnly?: boolean;
    activeEnrollmentOnly?: boolean;
    activeTurmaOnly?: boolean;
    completedOnly?: boolean;
    enrollmentStatuses?: string[];
    internshipOnly?: boolean;
    referencePeriod?: string;
    moduleId?: string;
    moduleName?: string;
    idempotencyKey: string;
  }) {
    let query = supabase
      .from('matriculas')
      .select(`
        id, status, data_matricula, aluno_id, turma_id,
        parceiros!inner(
          nome, nome_social, cpf_cnpj, email, telefone, foto_url,
          data_nascimento, sexo, estado_civil, raca_cor,
          rg, tipo_documento, orgao_emissor, rg_uf_emissao, rg_data_emissao,
          nacionalidade, naturalidade, titulo_eleitor, reservista,
          nome_mae, nome_pai, pcd, pcd_tipo,
          escola_ensino_medio, ano_conclusao_ensino_medio,
          cep, endereco, numero, complemento, bairro, cidade, uf,
          responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone,
          observacao
        ),
        turmas!inner(
          nome, codigo, turno, polo_id, data_inicio, data_previsao_termino,
          cursos!inner(
            id, nome, modalidade, carga_horaria, area,
            eixo_tecnologico, perfil_profissional_conclusao
          ),
          polos!inner(nome)
        )
      `)
      .or(`polo_id.eq.${input.context.poloId},polo_id.is.null`, { foreignTable: 'turmas' });

    if (input.modo === 'individual') {
      query = query.eq('id', input.matriculaId!);
    } else if (input.modo === 'lote') {
      if (input.allStudentsInPolo) {
        if (input.documento !== 'pasta_identificacao') {
          throw new Error('A emissão para todo o polo não está disponível para este documento.');
        }
      } else if (input.turmaId && input.turmaId !== 'todos') {
        query = query.eq('turma_id', input.turmaId);
      } else {
        throw new Error('Selecione uma turma para preparar a emissão em lote.');
      }
    } else {
      if (!input.matriculaIds?.length) {
        throw new Error('Adicione pelo menos um aluno à lista personalizada.');
      }
      query = query.in('id', input.matriculaIds);
    }
    if (input.technicalOnly) query = query.eq('turmas.cursos.modalidade', 'TECNICO');
    const isActiveFolderBatch =
      input.documento === 'pasta_identificacao' && input.modo === 'lote';
    if (input.activeEnrollmentOnly || isActiveFolderBatch) query = query.eq('status', 'ATIVO');
    if (input.activeTurmaOnly) query = query.eq('turmas.status', 'EM_ANDAMENTO');
    if (input.enrollmentStatuses?.length) query = query.in('status', input.enrollmentStatuses);
    if (input.completedOnly) query = query.eq('status', 'CONCLUIDO');

    const { data: matriculasData, error: matriculasError } = await query;
    if (matriculasError) throw matriculasError;
    let matriculas = matriculasData || [];
    if (input.internshipOnly && matriculas.length) {
      const turmaIds = [...new Set(matriculas.map((matricula: any) => matricula.turma_id).filter(Boolean))];
      const alunoIds = [...new Set(matriculas.map((matricula: any) => matricula.aluno_id).filter(Boolean))];
      const { data: estagios, error: estagiosError } = await supabase
        .from('matriculas_estagios')
        .select('aluno_id, turma_id')
        .in('turma_id', turmaIds)
        .in('aluno_id', alunoIds);
      if (estagiosError) throw estagiosError;
      const eligibleKeys = new Set((estagios || []).map((estagio: any) => `${estagio.aluno_id}:${estagio.turma_id}`));
      matriculas = matriculas.filter((matricula: any) => eligibleKeys.has(`${matricula.aluno_id}:${matricula.turma_id}`));
    }
    if (input.modo === 'custom' && input.matriculaIds?.length) {
      const selectedOrder = new Map(input.matriculaIds.map((id, index) => [id, index]));
      matriculas = [...matriculas].sort(
        (a: any, b: any) =>
          (selectedOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER)
          - (selectedOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
    } else {
      // A chave idempotente de cada item usa sua posição no lote. A consulta
      // não possui ordem SQL garantida, então normalizamos por identidade para
      // que retries nunca reassociem uma chave já confirmada a outra matrícula.
      matriculas = [...matriculas].sort((a: any, b: any) =>
        String(a.id).localeCompare(String(b.id))
      );
    }
    if (!matriculas.length) {
      throw new Error('Nenhuma matrícula compatível foi localizada para esta emissão.');
    }

    if (input.documento === 'boletim') {
      if (!input.moduleId || input.referencePeriod !== input.moduleId) {
        throw new Error('Selecione um módulo válido para preparar o boletim.');
      }
      const turmaIds = [...new Set(
        matriculas.map((matricula: any) => matricula.turma_id).filter(Boolean)
      )];
      if (turmaIds.length !== 1) {
        throw new Error('O boletim personalizado aceita somente alunos da mesma turma.');
      }
      const turmaModules = await secretariaDocumentosService.getTurmaModulos(turmaIds[0]);
      if (!turmaModules.some((module) => module.id === input.moduleId)) {
        throw new Error('O módulo selecionado não pertence à turma dos alunos.');
      }
    }

    if (input.documento === 'termo_estagio') {
      throw new Error(
        'O termo de estágio exige concedente, vigência, jornada, plano de atividades e supervisor. '
        + 'A emissão foi bloqueada porque esses dados ainda não possuem cadastro acadêmico completo.'
      );
    }

    const transferDestinationByEnrollment = new Map<string, string>();
    if (input.documento === 'transferencia') {
      await Promise.all(matriculas.map(async (matricula: any) => {
        const { data, error } = await supabase
          .from('transferencias_academicas')
          .select('instituicao_destino')
          .eq('matricula_origem_id', matricula.id)
          .not('instituicao_destino', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        const destination = String(data?.instituicao_destino || '').trim();
        if (!destination) {
          throw new Error(
            `A transferência de ${matricula.parceiros?.nome || 'o aluno'} ainda não possui instituição de destino registrada.`
          );
        }
        transferDestinationByEnrollment.set(matricula.id, destination);
      }));
    }

    const irpfPaymentsByEnrollment = new Map<string, any[]>();
    if (input.documento === 'declaracao_irpf') {
      await Promise.all(matriculas.map(async (matricula: any) => {
        const { data, error } = await supabase.rpc('get_pagamentos_irpf_aluno', {
          p_aluno_id: matricula.aluno_id,
          p_ano: input.referencePeriod || '',
          p_turma_id: matricula.turma_id,
        });
        if (error) throw error;
        const payments = Array.isArray(data) ? data : [];
        if (!payments.length) {
          throw new Error(
            `Não existem pagamentos confirmados para ${matricula.parceiros?.nome || 'o aluno'} no ano selecionado.`
          );
        }
        irpfPaymentsByEnrollment.set(matricula.id, payments);
      }));
    }

    const shouldIssueValidation = input.documento !== 'cracha_periodo_eleitoral';
    if (!shouldIssueValidation) {
      const template = await crachaPeriodoEleitoralService.getTemplate();
      if (!isCrachaEleitoralTemplateAvailable(template)) {
        throw new Error('O modelo SES ativo está desabilitado.');
      }
    }

    let registrationTemplateSnapshot: any = null;
    let registrationTemplateName = '';
    if (input.documento === 'pasta_identificacao') {
      registrationTemplateSnapshot = await pastaIdentificacaoService.getTemplate(
        input.context.poloId
      );
      registrationTemplateName = 'Pasta de Identificação Geral';
    }
    if (input.documento === 'ficha_matricula') {
      if (!input.referencePeriod) {
        throw new Error('Selecione um modelo ativo de ficha de matrícula.');
      }
      const selectedModel = await fichasMatriculaService.getById(input.referencePeriod);
      if (!selectedModel || selectedModel.status !== 'ATIVO') {
        throw new Error('O modelo selecionado não está mais ativo ou foi removido.');
      }

      const application = String(selectedModel.tipoCurso || 'TODOS').trim().toUpperCase();
      const incompatibleEnrollment = matriculas.find((matricula: any) => {
        const modality = String(matricula.turmas?.cursos?.modalidade || '').trim().toUpperCase();
        const courseId = matricula.turmas?.cursos?.id || null;
        if (selectedModel.cursoEspecificoId && selectedModel.cursoEspecificoId !== courseId) {
          return true;
        }
        return application !== 'TODOS' && application !== modality;
      });
      if (incompatibleEnrollment) {
        throw new Error(
          `O modelo “${selectedModel.nome}” não é compatível com o curso de `
          + `${(incompatibleEnrollment as any).parceiros?.nome || 'um dos alunos selecionados'}.`
        );
      }

      registrationTemplateSnapshot = selectedModel.templateConfig;
      registrationTemplateName = selectedModel.nome;
    }

    const isRegistrationDocument = (
      input.documento === 'pasta_identificacao'
      || input.documento === 'ficha_matricula'
    );
    const records = shouldIssueValidation
      ? isRegistrationDocument
        ? await documentValidationService.reissueRegistrationBatch({
            type: input.documento as ValidatableDocumentType,
            enrollmentIds: matriculas.map((matricula: any) => matricula.id),
            issuedBy: input.context.userId,
            referencePeriod: input.referencePeriod,
            idempotencyKey: input.idempotencyKey,
          })
        : await Promise.all(
          matriculas.map((matricula: any) => {
            const validationType = input.documento as ValidatableDocumentType;
            return documentValidationService.reissue({
              type: validationType,
              enrollmentId: matricula.id,
              issuedBy: input.context.userId,
              referencePeriod: input.referencePeriod,
              sourceReference:
                input.documento === 'transferencia'
                  ? `${matricula.id}_transferencia`
                  : input.documento === 'termo_estagio'
                  ? `${matricula.id}_contrato_principal`
                  : undefined,
              idempotencyKey: `${input.idempotencyKey}:${matricula.id}`,
            });
          })
        )
      : [];

    const issuedAt = records[0]?.issuedAt || new Date().toISOString();
    const expiresAt = records[0]?.expiresAt || null;
    const codes = records.map((record) => record.code);
    let emissions: EmissionLog[] = [];

    if (codes.length) {
      const { data: emissionsData, error: emissionsError } = await supabase
        .from('documentos_validacao')
        .select(`
          *,
          aluno:parceiros(
            id, nome, cpf_cnpj, rg, data_nascimento, foto_url, sexo,
            nacionalidade, naturalidade, orgao_emissor, titulo_eleitor, reservista,
            nome_mae, nome_pai, escola_ensino_medio, ano_conclusao_ensino_medio
          ),
          matricula:matriculas(id, status, turma:turmas(id, nome, codigo))
        `)
        .in('codigo', codes);
      if (emissionsError) {
        console.warn('[SecretariaDocumentos] Snapshot emitido não pôde ser relido; usando os dados já consolidados.', emissionsError);
      }

      const emissionsByCode = new Map(
        ((emissionsData || []) as unknown as EmissionLog[]).map((emission) => [emission.codigo, emission])
      );
      emissions = codes
        .map((code, index) => {
          const matricula: any = matriculas[index];
          const record = records[index];
          const persisted = emissionsByCode.get(code);
          const fallback: EmissionLog = {
            id: code,
            identidade: code,
            codigo: code,
            documento: input.documento,
            matricula_id: matricula.id,
            aluno_id: matricula.aluno_id,
            polo_id: matricula.turmas?.polo_id || input.context.poloId,
            periodo_referencia: input.referencePeriod || null,
            referencia_externa: null,
            status: 'ATIVO',
            emitido_em: record?.issuedAt || issuedAt,
            ultima_emissao_em: record?.lastIssuedAt || record?.issuedAt || issuedAt,
            validade_ate: record?.expiresAt || null,
            validacao_publica: record?.validationPublic ?? false,
            revogado_em: null,
            emitido_por: input.context.userId,
            quantidade_emissoes: record?.issueCount || 1,
            dados_emissao: {
              ...buildStudentRegistrationSnapshot(matricula),
              validationPublic: record?.validationPublic ?? false,
              ...(input.documento === 'pasta_identificacao'
                || input.documento === 'ficha_matricula'
                ? {
                    documentTemplateId: input.documento === 'ficha_matricula'
                      ? input.referencePeriod
                      : 'pasta_identificacao_aluno',
                    documentTemplateName: registrationTemplateName,
                    documentTemplateSnapshot: registrationTemplateSnapshot,
                  }
                : {}),
            },
            aluno: {
              id: matricula.aluno_id,
              nome: matricula.parceiros?.nome || '',
              cpf_cnpj: matricula.parceiros?.cpf_cnpj || '',
              data_nascimento: matricula.parceiros?.data_nascimento || '',
              foto_url: matricula.parceiros?.foto_url || null,
            },
            matricula: {
              id: matricula.id,
              status: matricula.status || '',
              turma: {
                id: matricula.turma_id,
                nome: matricula.turmas?.nome || '',
                codigo: matricula.turmas?.codigo || '',
              },
            },
          };
          const emission = persisted || fallback;
          const payments = irpfPaymentsByEnrollment.get(matricula.id) || [];
          const isAuthoritativeRegistrationSnapshot = Boolean(persisted) && (
            input.documento === 'pasta_identificacao'
            || input.documento === 'ficha_matricula'
          );
          return {
            ...emission,
            dados_emissao: {
              ...(emission.dados_emissao || {}),
              ...(!isAuthoritativeRegistrationSnapshot
                ? buildStudentRegistrationSnapshot(matricula)
                : {}),
              ...(input.documento === 'declaracao_irpf'
                ? {
                    calendarYear: input.referencePeriod,
                    irpfTotal: Number(payments[0]?.total_anual_pago || 0),
                  }
                : {}),
              ...(input.documento === 'transferencia'
                ? {
                    destinationInstitution: transferDestinationByEnrollment.get(emission.matricula_id),
                  }
                : {}),
              ...(input.documento === 'boletim'
                ? {
                    moduleId: input.moduleId,
                    moduleName: input.moduleName,
                  }
                : {}),
            },
          };
        });
    }

    return {
      documento: input.documento,
      modo: input.modo,
      status: 'PREPARADO',
      issuedAt,
      expiresAt,
      codes,
      emissions,
      items: matriculas.map((matricula: any, index: number) => ({
        matriculaId: matricula.id,
        alunoId: matricula.aluno_id,
        nome: matricula.parceiros?.nome || '',
        cpf: matricula.parceiros?.cpf_cnpj || '',
        matricula: formatMatricula(matricula.id, matricula.data_matricula, matricula.turmas?.polo_id),
        curso: matricula.turmas?.cursos?.nome || '',
        turma: matricula.turmas?.nome || '',
        polo: matricula.turmas?.polos?.nome || '',
        fotoUrl: matricula.parceiros?.foto_url || null,
        validationCode: records[index]?.code,
        validationPublic: records[index]?.validationPublic === true,
        validade: records[index]?.expiresAt
          ? new Date(records[index].expiresAt!).toLocaleDateString('pt-BR')
          : 'Sem vencimento',
      })),
    };
  },
};
