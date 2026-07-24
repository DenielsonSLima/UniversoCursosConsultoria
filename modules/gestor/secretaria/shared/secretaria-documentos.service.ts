import { supabase } from '../../../../lib/supabase';
import { formatMatricula } from '../../../../lib/academicUtils';
import { documentValidationService } from '../../../shared/document-validation/document-validation.service';
import type { ValidatableDocumentType } from '../../../shared/document-validation/document-validation.types';
import {
  crachaPeriodoEleitoralService,
  isCrachaEleitoralTemplateAvailable,
} from '../../cadastros/modelos-documentos/cracha-periodo-eleitoral/cracha-periodo-eleitoral.service';
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

const buildAlunoPoloScopeFilter = (poloId: string) =>
  `polo_id.eq.${poloId},polo_ids.cs.{${poloId}},polo_id.is.null`;

const normalizeStatus = (status?: string) => (status || '').toUpperCase();

const enrollmentStatusRank = (status?: string) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'ATIVO') return 0;
  if (normalized === 'EM_ANDAMENTO') return 1;
  if (normalized === 'CONCLUIDO') return 2;
  return 3;
};

const getAlunoEnrollmentSummaries = async (poloId: string, alunoIds: string[]) => {
  if (!alunoIds.length) return new Map<string, any>();

  const { data, error } = await supabase
    .from('matriculas')
    .select('id, aluno_id, status, data_matricula, turmas!inner(id, nome, codigo, polo_id, cursos(nome, modalidade))')
    .in('aluno_id', alunoIds)
    .or(`polo_id.eq.${poloId},polo_id.is.null`, { foreignTable: 'turmas' })
    .order('data_matricula', { ascending: false });

  if (error) throw error;

  const ordered = [...(data || [])].sort((a: any, b: any) => {
    const statusDiff = enrollmentStatusRank(a.status) - enrollmentStatusRank(b.status);
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.data_matricula || 0).getTime() - new Date(a.data_matricula || 0).getTime();
  });

  const summaries = new Map<string, any>();
  ordered.forEach((matricula: any) => {
    if (summaries.has(matricula.aluno_id)) return;
    summaries.set(matricula.aluno_id, {
      matricula: formatMatricula(matricula.id, matricula.data_matricula, matricula.turmas?.polo_id || poloId),
      cursoNome: matricula.turmas?.cursos?.nome || '',
      turmaNome: matricula.turmas?.nome || '',
      turmaCodigo: matricula.turmas?.codigo || '',
      matriculaStatus: matricula.status || '',
    });
  });

  return summaries;
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
  async searchAlunos(poloId: string, term: string): Promise<SecretariaAlunoResumo[]> {
    const safeTerm = normalizeSearchTerm(term);
    if (safeTerm.length < 2) return [];

    const { data, error } = await supabase
      .from('parceiros')
      .select('id, nome, cpf_cnpj, email, telefone, foto_url, polo_id, polo_ids')
      .eq('tipo', 'Aluno')
      .or(buildAlunoPoloScopeFilter(poloId))
      .or(`nome.ilike.%${safeTerm}%,cpf_cnpj.ilike.%${safeTerm}%`)
      .order('nome', { ascending: true })
      .limit(20);

    if (error) throw error;
    const summaries = await getAlunoEnrollmentSummaries(poloId, (data || []).map((aluno: any) => aluno.id));
    return (data || []).map((aluno) => ({
      id: aluno.id,
      nome: aluno.nome,
      cpf: aluno.cpf_cnpj,
      email: aluno.email,
      telefone: aluno.telefone,
      fotoUrl: aluno.foto_url,
      ...summaries.get(aluno.id),
    }));
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
      cursoNome: matricula.turmas?.cursos?.nome || '',
      modalidade: matricula.turmas?.cursos?.modalidade || '',
      poloId: matricula.turmas?.polo_id || poloId,
    }));
  },

  async getTurmas(
    poloId: string,
    technicalOnly: boolean,
    activeTurmaOnly = false,
    internshipOnly = false
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
    const counts = await Promise.all(
      turmas.map(async (turma: any) => {
        if (internshipOnly) return internshipCounts.get(turma.id) || 0;
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
    modo: 'individual' | 'lote';
    alunoId?: string;
    matriculaId?: string;
    turmaId?: string;
    technicalOnly?: boolean;
    activeEnrollmentOnly?: boolean;
    activeTurmaOnly?: boolean;
    completedOnly?: boolean;
    enrollmentStatuses?: string[];
    internshipOnly?: boolean;
    referencePeriod?: string;
    moduleId?: string;
    moduleName?: string;
  }) {
    let query = supabase
      .from('matriculas')
      .select(`
        id, status, data_matricula, aluno_id, turma_id,
        parceiros!inner(nome, cpf_cnpj, data_nascimento, foto_url),
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
    if (!matriculas.length) {
      throw new Error('Nenhuma matrícula compatível foi localizada para esta emissão.');
    }

    if (input.documento === 'termo_estagio') {
      throw new Error(
        'O termo de estágio exige concedente, vigência, jornada, plano de atividades e supervisor. '
        + 'A emissão foi bloqueada porque esses dados ainda não possuem cadastro acadêmico completo.'
      );
    }

    if (input.documento === 'rematricula') {
      throw new Error(
        'Rematrícula é um processo acadêmico, não uma emissão documental. '
        + 'A geração isolada de código foi bloqueada até existir um fluxo que efetive e audite a rematrícula.'
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

    const records = shouldIssueValidation
      ? await Promise.all(
          matriculas.map((matricula: any) => {
            const validationType = input.documento as ValidatableDocumentType;
            return documentValidationService.issue({
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
              registerReissue: true,
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
          aluno:parceiros(id, nome, cpf_cnpj, rg, data_nascimento, foto_url),
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
            revogado_em: null,
            emitido_por: input.context.userId,
            quantidade_emissoes: record?.issueCount || 1,
            dados_emissao: {
              studentName: matricula.parceiros?.nome || '',
              studentCpf: matricula.parceiros?.cpf_cnpj || '',
              studentBirthDate: matricula.parceiros?.data_nascimento || '',
              studentPhotoUrl: matricula.parceiros?.foto_url || null,
              studentMatricula: formatMatricula(matricula.id, matricula.data_matricula, matricula.turmas?.polo_id),
              courseName: matricula.turmas?.cursos?.nome || '',
              className: matricula.turmas?.nome || '',
              unitName: matricula.turmas?.polos?.nome || '',
              enrollmentStatus: matricula.status || '',
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
          return {
            ...emission,
            dados_emissao: {
              ...(emission.dados_emissao || {}),
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
      })),
    };
  },
};
