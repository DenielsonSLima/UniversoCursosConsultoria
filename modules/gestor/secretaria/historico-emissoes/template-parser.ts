import { formatMatricula } from '../../../../lib/academicUtils';
import { escapeHtmlText } from '../../../../lib/htmlSanitizer';
import { amountInWords } from '../../../shared/secretaria/document-template.helpers';
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
  const expiresAt = data.validade_ate ? new Date(data.validade_ate) : null;
  const validityDays = expiresAt
    ? Math.max(1, Math.ceil((expiresAt.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)))
    : null;
  const formattedValidity = expiresAt
    ? `${String(expiresAt.getDate()).padStart(2, '0')}/${String(expiresAt.getMonth() + 1).padStart(2, '0')}/${expiresAt.getFullYear()}`
    : 'Sem vencimento';
  const emissionData = data.dados_emissao || {};
  const academicData = [
    'boletim',
    'atestado_conclusao_tecnico',
    'transferencia',
    'historico_escolar',
  ].includes(data.documento)
    ? context.academicData
    : null;
  const academicStatus = (
    academicData?.situacaoAcademica
    || formatEnrollmentStatus(emissionData.enrollmentStatus || data.matricula?.status)
  ).toUpperCase();
  const completedHours = academicData?.cargaHorariaCumprida ?? Number(emissionData.courseHours || 0);
  const totalHours = academicData?.cargaHorariaTotal ?? Number(emissionData.courseHours || 0);
  const irpfTotal = Number(emissionData.irpfTotal || 0);
  const formattedIrpfTotal = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(irpfTotal);
  const studentAddress = [
    emissionData.studentStreet,
    emissionData.studentAddressNumber,
    emissionData.studentAddressComplement,
    emissionData.studentDistrict,
    [emissionData.studentCity, emissionData.studentState].filter(Boolean).join('/'),
  ].filter(Boolean).join(' - ');
  const poloAddress = [
    [
      context.poloInfo?.endereco,
      context.poloInfo?.numero,
    ].filter(Boolean).join(', '),
    context.poloInfo?.bairro,
    [
      context.poloInfo?.cidade,
      context.poloInfo?.estado || context.poloInfo?.uf,
    ].filter(Boolean).join('/'),
    context.poloInfo?.cep ? `CEP: ${context.poloInfo.cep}` : '',
  ].filter(Boolean).join(' - ');
  const enrollmentFormTerm = String(
    context.templateConfig?.enrollmentFormTerm
    || 'Solicito minha matrícula e declaro verdadeiros os dados informados.'
  )
    .split(/\r?\n/)
    .map((line) => escapeHtmlText(line))
    .join('<br>');
  const enrollmentFormCustomFields = Array.isArray(
    context.templateConfig?.enrollmentFormCustomFields
  )
    ? context.templateConfig.enrollmentFormCustomFields
    : [];
  const enrollmentFormCustomFieldsHtml = enrollmentFormCustomFields.length
    ? `
      <section style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-top:7px;">
        ${enrollmentFormCustomFields
          .filter((field: any) => String(field?.label || '').trim())
          .map((field: any) => `
            <div style="border-bottom:1px solid #0f172a;padding:0 3px 5px;font-size:9px;color:#475569;text-transform:uppercase;">
              ${escapeHtmlText(String(field.label).trim())}
            </div>
          `)
          .join('')}
      </section>
    `
    : '';
  const enrollmentFormSignaturesHtml =
    context.templateConfig?.enrollmentFormRequiresSignature === false
      ? ''
      : `
        <section style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px;text-align:center;font-size:8px;color:#0f172a;">
          <div style="border-top:1px solid #0f172a;padding-top:5px;">ASSINATURA DO ALUNO OU RESPONSÁVEL</div>
          <div style="border-top:1px solid #0f172a;padding-top:5px;">DEFERIMENTO DA DIRETORIA</div>
        </section>
      `;

  const replacements: Array<[RegExp, string]> = [
    [/{{FICHA_TERMO}}/g, enrollmentFormTerm],
    [/{{FICHA_CAMPOS_EXTRAS}}/g, enrollmentFormCustomFieldsHtml],
    [/{{FICHA_ASSINATURAS}}/g, enrollmentFormSignaturesHtml],
    [/{{ALUNO_NOME}}/g, (emissionData.studentName || data.aluno?.nome || '').toUpperCase()],
    [
      /{{ALUNO_FOTO_URL}}/g,
      emissionData.studentPhotoUrl || data.aluno?.foto_url || '/sem-foto-aluno.svg',
    ],
    [/{{ALUNO_NOME_SOCIAL}}/g, emissionData.studentSocialName || 'Não informado'],
    [/{{ALUNO_CPF}}/g, emissionData.studentCpf || data.aluno?.cpf_cnpj || 'Não informado'],
    [/{{ALUNO_DOCUMENTO_TIPO}}/g, 'RG'],
    [/{{ALUNO_RG}}/g, emissionData.studentRg || data.aluno?.rg || 'Não informado'],
    [/{{ALUNO_NASCIMENTO}}/g, formatDate(emissionData.studentBirthDate || data.aluno?.data_nascimento)],
    [/{{ALUNO_SEXO}}/g, emissionData.studentSex || 'Não informado'],
    [/{{ALUNO_ESTADO_CIVIL}}/g, emissionData.studentMaritalStatus || 'Não informado'],
    [/{{ALUNO_RACA_COR}}/g, emissionData.studentRaceColor || 'NÃO DECLARADA'],
    [/{{ALUNO_NACIONALIDADE}}/g, emissionData.studentNationality || 'Não informada'],
    [/{{ALUNO_NATURALIDADE}}/g, emissionData.studentBirthplace || 'Não informada'],
    [/{{ALUNO_MAE}}/g, emissionData.studentMotherName || 'Não informada'],
    [/{{ALUNO_PAI}}/g, emissionData.studentFatherName || 'Não informado'],
    [/{{ALUNO_PCD}}/g, emissionData.studentPcd || 'NÃO'],
    [/{{ALUNO_PCD_TIPO}}/g, emissionData.studentPcdType || 'Não se aplica'],
    [/{{ALUNO_EMAIL}}/g, emissionData.studentEmail || 'Não informado'],
    [/{{ALUNO_TELEFONE}}/g, emissionData.studentPhone || 'Não informado'],
    [/{{ALUNO_ENDERECO}}/g, studentAddress || 'Não informado'],
    [/{{ALUNO_LOGRADOURO}}/g, emissionData.studentStreet || 'Não informado'],
    [/{{ALUNO_NUMERO}}/g, emissionData.studentAddressNumber || 'S/N'],
    [/{{ALUNO_COMPLEMENTO}}/g, emissionData.studentAddressComplement || '—'],
    [/{{ALUNO_BAIRRO}}/g, emissionData.studentDistrict || 'Não informado'],
    [/{{ALUNO_CIDADE}}/g, emissionData.studentCity || 'Não informada'],
    [/{{ALUNO_UF}}/g, emissionData.studentState || '—'],
    [/{{ALUNO_CEP}}/g, emissionData.studentZipCode || 'Não informado'],
    [/{{ALUNO_TIPO_DOCUMENTO}}/g, emissionData.studentDocumentType || 'RG'],
    [/{{ALUNO_RG_ORGAO}}/g, emissionData.studentRgIssuer || 'Não informado'],
    [/{{ALUNO_RG_UF}}/g, emissionData.studentRgState || '—'],
    [/{{ALUNO_RG_EMISSAO}}/g, formatDate(emissionData.studentRgIssueDate)],
    [/{{ALUNO_TITULO_ELEITOR}}/g, emissionData.studentVoterId || 'Não informado'],
    [/{{ALUNO_RESERVISTA}}/g, emissionData.studentReservist || 'Não informado'],
    [/{{ALUNO_RESPONSAVEL}}/g, emissionData.studentResponsibleName || 'Não informado'],
    [/{{ALUNO_RESPONSAVEL_CPF}}/g, emissionData.studentResponsibleCpf || 'Não informado'],
    [/{{ALUNO_RESPONSAVEL_PARENTESCO}}/g, emissionData.studentResponsibleRelation || 'Não informado'],
    [/{{ALUNO_RESPONSAVEL_TELEFONE}}/g, emissionData.studentResponsiblePhone || 'Não informado'],
    [/{{ALUNO_OBSERVACOES}}/g, emissionData.studentNotes || ''],
    [
      /{{ALUNO_MATRICULA}}/g,
      emissionData.studentMatricula
      || formatMatricula(
        data.matricula_id,
        emissionData.enrollmentDate || data.emitido_em,
        data.polo_id,
      ),
    ],
    [/{{CURSO_NOME}}/g, emissionData.courseName || ''],
    [/{{CURSO_MODALIDADE}}/g, emissionData.courseModality || ''],
    [/{{CURSO_TURNO}}/g, emissionData.classShift || ''],
    [/{{MATRICULA_STATUS}}/g, formatEnrollmentStatus(emissionData.enrollmentStatus || data.matricula?.status)],
    [/{{TURMA_NOME}}/g, emissionData.className || ''],
    [/{{POLO_NOME}}/g, emissionData.unitName || context.poloInfo?.nome || 'Universo Cursos e Consultoria'],
    [/{{POLO_CNPJ}}/g, context.poloInfo?.cnpj || ''],
    [/{{POLO_ENDERECO_COMPLETO}}/g, poloAddress || 'Endereço não informado'],
    [/{{POLO_TELEFONE}}/g, context.poloInfo?.telefone || 'Não informado'],
    [/{{POLO_EMAIL}}/g, context.poloInfo?.email || 'Não informado'],
    [/{{CIDADE_POLO}}/g, context.poloInfo?.cidade || 'Aracaju'],
    [/{{LOCAL_DOCUMENTO}}/g, [context.poloInfo?.cidade, context.poloInfo?.estado || context.poloInfo?.uf].filter(Boolean).join('/')],
    [/{{DATA_ATUAL}}/g, dateInFull],
    [/{{HORA_ATUAL}}/g, currentTime],
    [/{{SITUACAO_ACADEMICA}}/g, academicStatus],
    [/{{DATA_GERACAO}}/g, `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()} às ${currentTime}`],
    [/{{VALIDADE_DIAS}}/g, validityDays === null ? 'Sem vencimento' : String(validityDays)],
    [/{{VALIDADE_DATA}}/g, formattedValidity],
    [/{{ANO_CALENDARIO}}/g, String(emissionData.calendarYear || data.periodo_referencia || '')],
    [/{{VALOR_TOTAL}}/g, formattedIrpfTotal],
    [/{{VALOR_EXTENSO}}/g, amountInWords(irpfTotal)],
    [/{{RESPONSAVEL_FINANCEIRO_NOME}}/g, (emissionData.responsibleName || emissionData.studentName || data.aluno?.nome || '').toUpperCase()],
    [/{{RESPONSAVEL_FINANCEIRO_CPF}}/g, emissionData.responsibleCpf || emissionData.studentCpf || data.aluno?.cpf_cnpj || 'Não informado'],
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
    [/{{TABELA_BOLETIM_TECNICO}}/g, academicData?.componentesTable || ''],
    [/{{TABELA_HISTORICO_ESCOLAR}}/g, academicData?.historicoTable || ''],
    [/{{CARGA_HORARIA_CUMPRIDA}}/g, String(completedHours)],
    [/{{CARGA_HORARIA_TOTAL}}/g, String(totalHours)],
    [/{{PERIODO_CURSO}}/g, academicData?.periodoCurso || emissionData.coursePeriod || '—'],
    [/{{OBSERVACOES_HISTORICO}}/g, academicData?.observacoesHistorico || '—'],
    [/{{INSTITUICAO_DESTINO}}/g, emissionData.destinationInstitution || 'A instituição de destino'],
    [/{{CARGA_HORARIA_TOTAL}}/g, String(totalHours)],
    [/{{DATA_CONCLUSAO}}/g, formatDate(emissionData.completionDate || academicData?.fimCurso || '')],
    [/{{MEDIA_GERAL}}/g, academicData?.mediaGeral === null || academicData?.mediaGeral === undefined
      ? '—'
      : academicData.mediaGeral.toFixed(1)],
    [/{{FREQUENCIA_GERAL}}/g, academicData?.frequenciaGeral === null || academicData?.frequenciaGeral === undefined
      ? '—'
      : `${academicData.frequenciaGeral.toFixed(0)}%`],
    [/{{MODULO_PERIODO}}/g, academicData?.moduleNames.join(', ') || '—'],
    [/{{ANO_LETIVO}}/g, String(new Date(data.emitido_em).getFullYear())],
  ];

  return replacements.reduce(
    (parsed, [pattern, value]) => parsed.replace(pattern, value),
    htmlText
  );
};
