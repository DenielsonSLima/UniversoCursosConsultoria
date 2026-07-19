import { formatMatricula } from '../../../../lib/academicUtils';
import type { AcademicPreviewData, EmissionLog } from './historico-emissoes.types';

interface TemplateParserContext {
  academicData: AcademicPreviewData | null;
  poloInfo: any;
  templateConfig: any;
}

const formatDate = (value?: string) => {
  if (!value) return 'Não informada';
  const parts = value.split('T')[0].split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
};
const formatEnrollmentStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (!normalized) return 'NÃO INFORMADA';
  if (normalized.includes('CONCLU')) return 'CONCLUÍDO(A)';
  if (normalized.includes('TRANC')) return 'TRANCADO(A)';
  if (normalized.includes('SUSP')) return 'SUSPENSO(A)';
  if (normalized.includes('INATIV')) return 'INATIVO(A)';
  if (normalized.includes('ATIV')) return 'ATIVO(A)';
  if (normalized.includes('EXCL') || normalized.includes('CANCEL')) return 'CANCELADO(A)';
  return normalized;
};

export const parseEmissionTemplate = (
  htmlText: string,
  data: EmissionLog,
  context: TemplateParserContext
) => {
  if (!htmlText) return '';
  const today = new Date(data.emitido_em);
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const dateInFull = `${today.getDate()} de ${months[today.getMonth()]} de ${today.getFullYear()}`;
  const currentTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  const validityDays = context.templateConfig?.validityDays || 30;
  const expiresAt = data.validade_ate
    ? new Date(data.validade_ate)
    : new Date(today.getTime() + validityDays * 24 * 60 * 60 * 1000);
  const formattedValidity = `${String(expiresAt.getDate()).padStart(2, '0')}/${String(expiresAt.getMonth() + 1).padStart(2, '0')}/${expiresAt.getFullYear()}`;
  const emissionData = data.dados_emissao || {};
  const academicData = ['transferencia', 'historico_escolar'].includes(data.documento)
    ? context.academicData
    : null;
  const academicStatus = (
    academicData?.situacaoAcademica
    || formatEnrollmentStatus(emissionData.enrollmentStatus || data.matricula?.status)
  ).toUpperCase();
  const completedHours = academicData?.cargaHorariaCumprida ?? Number(emissionData.courseHours || 0);
  const totalHours = academicData?.cargaHorariaTotal ?? Number(emissionData.courseHours || 0);

  const replacements: Array<[RegExp, string]> = [
    [/{{ALUNO_NOME}}/g, (emissionData.studentName || data.aluno?.nome || '').toUpperCase()],
    [/{{ALUNO_CPF}}/g, emissionData.studentCpf || data.aluno?.cpf_cnpj || 'Não informado'],
    [/{{ALUNO_DOCUMENTO_TIPO}}/g, 'RG'],
    [/{{ALUNO_RG}}/g, data.aluno?.rg || 'Não informado'],
    [/{{ALUNO_NASCIMENTO}}/g, formatDate(emissionData.studentBirthDate || data.aluno?.data_nascimento)],
    [/{{ALUNO_MATRICULA}}/g, emissionData.studentMatricula || formatMatricula(data.matricula_id, data.emitido_em, data.polo_id)],
    [/{{CURSO_NOME}}/g, emissionData.courseName || ''],
    [/{{TURMA_NOME}}/g, emissionData.className || ''],
    [/{{POLO_NOME}}/g, emissionData.unitName || context.poloInfo?.nome || 'Universo Cursos e Consultoria'],
    [/{{POLO_CNPJ}}/g, context.poloInfo?.cnpj || ''],
    [/{{CIDADE_POLO}}/g, context.poloInfo?.cidade || 'Aracaju'],
    [/{{DATA_ATUAL}}/g, dateInFull],
    [/{{HORA_ATUAL}}/g, currentTime],
    [/{{SITUACAO_ACADEMICA}}/g, academicStatus],
    [/{{DATA_GERACAO}}/g, `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()} às ${currentTime}`],
    [/{{VALIDADE_DIAS}}/g, String(validityDays)],
    [/{{VALIDADE_DATA}}/g, formattedValidity],
    [/{{nome_aluno}}/g, (emissionData.studentName || data.aluno?.nome || '').toUpperCase()],
    [/{{cpf}}/g, emissionData.studentCpf || data.aluno?.cpf_cnpj || 'Não informado'],
    [/{{curso_nome}}/g, emissionData.courseName || ''],
    [/{{carga_horaria}}/g, String(emissionData.courseHours || '')],
    [/{{data_conclusao}}/g, formatDate(emissionData.completionDate)],
    [/{{certificado_numero}}/g, emissionData.certificateNumber || '—'],
    [/{{pagina_livro}}/g, emissionData.registryPage || '—'],
    [/{{livro}}/g, emissionData.registryBook || '—'],
    [/{{validacao_sistec}}/g, emissionData.sistecValidation || '—'],
    [/{{ensino_medio_estabelecimento}}/g, emissionData.highSchoolInstitution || 'Não informado'],
    [/{{ensino_medio_localidade_uf}}/g, emissionData.highSchoolLocation || 'Não informado'],
    [/{{ensino_medio_ano_conclusao}}/g, emissionData.highSchoolCompletionYear || 'Não informado'],
    [/{{TABELA_COMPONENTES_CURRICULARES}}/g, academicData?.componentesTable || ''],
    [/{{TABELA_HISTORICO_ESCOLAR}}/g, academicData?.historicoTable || ''],
    [/{{CARGA_HORARIA_CUMPRIDA}}/g, String(completedHours)],
    [/{{CARGA_HORARIA_TOTAL}}/g, String(totalHours)],
    [/{{PERIODO_CURSO}}/g, academicData?.periodoCurso || emissionData.coursePeriod || '—'],
    [/{{OBSERVACOES_HISTORICO}}/g, academicData?.observacoesHistorico || '—'],
    [/{{INSTITUICAO_DESTINO}}/g, emissionData.destinationInstitution || 'A instituição de destino'],
  ];

  return replacements.reduce(
    (parsed, [pattern, value]) => parsed.replace(pattern, value),
    htmlText
  );
};
