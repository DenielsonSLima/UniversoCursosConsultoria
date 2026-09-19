import { canonicalAsRecord } from '../shared/canonical-document-render.utils';
import { canonicalText } from '../shared/canonical-document-render.utils';
import { snapshotFirst } from './voter-snapshot';
import type { EmissionLog } from './historico-emissoes.types';
import type { PreviewResources } from './historico-emissoes.types';
import { EmissionPdfSource, escapeTemplateValue, formatSnapshotDate, formatSnapshotCpf } from './emission-pdf-core';
import {
  formatRegistrationIssuerState,
  formatRegistrationReservist,
  formatRegistrationVoterId,
  replaceRegistrationIssuerState,
} from '../../cadastros/ficha-matricula/registration-document-formatters';

/**
 * Interpolação limitada ao snapshot já persistido para Pasta/Ficha. Não busca
 * dados, não calcula regra acadêmica/financeira e não cria paginação.
 */
export const resolveRegistrationSnapshotTemplate = (
  source: string,
  emission: EmissionLog,
  preview: PreviewResources,
  escapeValues = true,
) => {
  const data = canonicalAsRecord(emission.dados_emissao);
  const livePolo = canonicalAsRecord(preview.polo);
  const polo = canonicalAsRecord(snapshotFirst(data, 'institutionSnapshot', livePolo));
  const template = canonicalAsRecord(preview.template);
  const snapshotValue = (key: string, legacyValue: unknown = '') => snapshotFirst(
    data,
    key,
    legacyValue,
  );
  const snapshotText = (key: string, legacyValue: unknown = '') => canonicalText(
    snapshotValue(key, legacyValue),
  );
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const emittedDateParts = String(emission.emitido_em || '').split('T')[0].split('-');
  const dateInFull = emittedDateParts.length === 3
    ? `${Number(emittedDateParts[2])} de ${months[Number(emittedDateParts[1]) - 1]} de ${emittedDateParts[0]}`
    : formatSnapshotDate(emission.emitido_em);
  const studentAddress = [
    snapshotText('studentStreet'),
    snapshotText('studentAddressNumber'),
    snapshotText('studentAddressComplement'),
    snapshotText('studentDistrict'),
    [snapshotText('studentCity'), snapshotText('studentState')].filter(Boolean).join('/'),
  ].filter(Boolean).join(' - ');
  const poloAddress = [
    [canonicalText(polo.endereco), canonicalText(polo.numero)].filter(Boolean).join(', '),
    canonicalText(polo.bairro),
    [canonicalText(polo.cidade), canonicalText(polo.estado, polo.uf)].filter(Boolean).join('/'),
    canonicalText(polo.cep),
  ].filter(Boolean).join(' - ');
  const customFields = Array.isArray(template.enrollmentFormCustomFields)
    ? template.enrollmentFormCustomFields
      .map((field) => canonicalText(canonicalAsRecord(field).label))
      .filter(Boolean)
      .map((label) => `${escapeTemplateValue(label)}<br>`)
      .join('')
    : '';
  const signatures = template.enrollmentFormRequiresSignature === false
    ? ''
    : `
      <section style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px;text-align:center;font-size:8px;color:#0f172a;">
        <div style="border-top:1px solid #0f172a;padding-top:5px;">ASSINATURA DO ALUNO OU RESPONSÁVEL</div>
        <div style="border-top:1px solid #0f172a;padding-top:5px;">DEFERIMENTO DA DIRETORIA</div>
      </section>
    `;
  const replacements: Record<string, unknown> = {
    FICHA_TERMO: canonicalText(template.enrollmentFormTerm, 'Solicito minha matrícula e declaro verdadeiros os dados informados.'),
    FICHA_CAMPOS_EXTRAS: customFields,
    FICHA_ASSINATURAS: signatures,
    ALUNO_NOME: snapshotText('studentName', emission.aluno?.nome).toUpperCase(),
    ALUNO_FOTO_URL: snapshotText('studentPhotoUrl', emission.aluno?.foto_url),
    ALUNO_NOME_SOCIAL: snapshotText('studentSocialName'),
    ALUNO_CPF: formatSnapshotCpf(snapshotValue('studentCpf', emission.aluno?.cpf_cnpj)),
    ALUNO_DOCUMENTO_TIPO: snapshotText('studentDocumentType', 'RG'),
    ALUNO_TIPO_DOCUMENTO: snapshotText('studentDocumentType', 'RG'),
    ALUNO_RG: snapshotText('studentRg', emission.aluno?.rg),
    ALUNO_NASCIMENTO: formatSnapshotDate(snapshotValue('studentBirthDate', emission.aluno?.data_nascimento)),
    ALUNO_SEXO: snapshotText('studentSex', emission.aluno?.sexo),
    ALUNO_ESTADO_CIVIL: snapshotText('studentMaritalStatus'),
    ALUNO_RACA_COR: snapshotText('studentRaceColor'),
    ALUNO_NACIONALIDADE: snapshotText('studentNationality', emission.aluno?.nacionalidade),
    ALUNO_NATURALIDADE: snapshotText('studentBirthplace', emission.aluno?.naturalidade),
    ALUNO_MAE: snapshotText('studentMotherName', emission.aluno?.nome_mae),
    ALUNO_PAI: snapshotText('studentFatherName', emission.aluno?.nome_pai),
    ALUNO_PCD: snapshotText('studentPcd', 'NÃO'),
    ALUNO_PCD_TIPO: snapshotText('studentPcdType'),
    ALUNO_EMAIL: snapshotText('studentEmail'),
    ALUNO_TELEFONE: snapshotText('studentPhone'),
    ALUNO_ENDERECO: studentAddress,
    ALUNO_LOGRADOURO: snapshotText('studentStreet'),
    ALUNO_NUMERO: snapshotText('studentAddressNumber', 'S/N'),
    ALUNO_COMPLEMENTO: snapshotText('studentAddressComplement'),
    ALUNO_BAIRRO: snapshotText('studentDistrict'),
    ALUNO_CIDADE: snapshotText('studentCity'),
    ALUNO_UF: snapshotText('studentState'),
    ALUNO_CEP: snapshotText('studentZipCode'),
    ALUNO_RG_ORGAO: snapshotText('studentRgIssuer', emission.aluno?.orgao_emissor),
    ALUNO_RG_UF: snapshotText('studentRgState'),
    ALUNO_RG_EMISSAO: formatSnapshotDate(snapshotValue('studentRgIssueDate')),
    ALUNO_TITULO_ELEITOR: formatRegistrationVoterId(snapshotText('studentVoterId', emission.aluno?.titulo_eleitor)),
    ALUNO_TITULO_ZONA: snapshotText('studentVoterZone', emission.aluno?.titulo_eleitor_zona),
    ALUNO_TITULO_SECAO: snapshotText('studentVoterSection', emission.aluno?.titulo_eleitor_secao),
    ALUNO_TITULO_EMISSAO: formatSnapshotDate(snapshotValue('studentVoterIssueDate', emission.aluno?.titulo_eleitor_data_emissao)),
    ALUNO_TITULO_UF: snapshotText('studentVoterState', emission.aluno?.titulo_eleitor_uf),
    ALUNO_RESERVISTA: formatRegistrationReservist(
      snapshotText('studentReservist', emission.aluno?.reservista),
      snapshotText('studentSex', emission.aluno?.sexo),
    ),
    ALUNO_RESPONSAVEL: snapshotText('studentResponsibleName'),
    ALUNO_RESPONSAVEL_CPF: formatSnapshotCpf(snapshotValue('studentResponsibleCpf')),
    ALUNO_RESPONSAVEL_PARENTESCO: snapshotText('studentResponsibleRelation'),
    ALUNO_RESPONSAVEL_TELEFONE: snapshotText('studentResponsiblePhone'),
    ALUNO_OBSERVACOES: snapshotText('studentNotes'),
    ALUNO_MATRICULA: snapshotText('studentMatricula'),
    CURSO_NOME: snapshotText('courseName'),
    CURSO_MODALIDADE: snapshotText('courseModality'),
    CURSO_TURNO: snapshotText('classShift'),
    MATRICULA_STATUS: snapshotText('enrollmentStatus', emission.matricula?.status),
    TURMA_NOME: snapshotText('className', emission.matricula?.turma?.nome),
    POLO_NOME: snapshotText('unitName', canonicalText(polo.nomeFantasia, polo.nome, 'Universo Cursos e Consultoria')),
    POLO_CNPJ: canonicalText(polo.cnpj),
    POLO_ENDERECO_COMPLETO: poloAddress,
    POLO_TELEFONE: canonicalText(polo.telefone),
    POLO_EMAIL: canonicalText(polo.email),
    CIDADE_POLO: canonicalText(polo.cidade),
    POLO_UF: canonicalText(polo.estado, polo.uf),
    LOCAL_DOCUMENTO: [canonicalText(polo.cidade), canonicalText(polo.estado, polo.uf)].filter(Boolean).join('/'),
    DATA_ATUAL: dateInFull,
    DATA_EMISSAO: formatSnapshotDate(emission.emitido_em),
    DATA_GERACAO: formatSnapshotDate(emission.emitido_em),
  };

  const issuerState = formatRegistrationIssuerState(
    snapshotText('studentRgIssuer', emission.aluno?.orgao_emissor),
    snapshotText('studentRgState'),
  );
  const preparedSource = replaceRegistrationIssuerState(
    String(source || ''),
    escapeValues ? escapeTemplateValue(issuerState) : issuerState,
  );
  return Object.entries(replacements).reduce((result, [token, rawValue]) => {
    const value = ['FICHA_CAMPOS_EXTRAS', 'FICHA_ASSINATURAS'].includes(token)
      ? String(rawValue || '')
      : escapeValues
        ? escapeTemplateValue(rawValue)
        : String(rawValue || '');
    return result.split(`{{${token}}}`).join(value);
  }, preparedSource);
};

export const REGISTRATION_VECTOR_DOCUMENTS = new Set([
  'pasta_identificacao',
  'ficha_matricula',
]);

export const resolveAcademicSnapshotTemplate = (
  source: EmissionPdfSource,
  value: unknown,
  escapeValues = true,
) => {
  const { emission, preview } = source;
  const snapshot = canonicalAsRecord(emission.dados_emissao);
  const academic = preview.academicData;
  const polo = canonicalAsRecord(preview.polo);
  const emittedDateParts = String(emission.emitido_em || '').split('T')[0].split('-');
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const dateInFull = emittedDateParts.length === 3
    ? `${Number(emittedDateParts[2])} de ${months[Number(emittedDateParts[1]) - 1]} de ${emittedDateParts[0]}`
    : formatSnapshotDate(emission.emitido_em);
  const replacements: Record<string, unknown> = {
    ALUNO_NOME: canonicalText(snapshot.studentName, emission.aluno?.nome).toUpperCase(),
    ALUNO_CPF: formatSnapshotCpf(snapshot.studentCpf ?? emission.aluno?.cpf_cnpj),
    ALUNO_RG: canonicalText(snapshot.studentRg, emission.aluno?.rg),
    ALUNO_MATRICULA: canonicalText(snapshot.studentMatricula, emission.matricula_id),
    CURSO_NOME: canonicalText(snapshot.courseName),
    TURMA_NOME: canonicalText(snapshot.className, emission.matricula?.turma?.nome),
    POLO_NOME: canonicalText(snapshot.unitName, polo.nomeFantasia, polo.nome),
    CIDADE_POLO: canonicalText(polo.cidade),
    POLO_UF: canonicalText(polo.estado, polo.uf),
    DATA_ATUAL: dateInFull,
    DATA_EMISSAO: formatSnapshotDate(emission.emitido_em),
    DATA_CONCLUSAO: formatSnapshotDate(academic?.fimCurso),
    MODULO_PERIODO: academic?.moduleNames.join(', ') || '—',
    ANO_LETIVO: emittedDateParts[0] || '',
    TABELA_BOLETIM_TECNICO: academic?.componentesTable || '',
    MEDIA_GERAL: academic?.mediaGeral === null || academic?.mediaGeral === undefined
      ? '—'
      : academic.mediaGeral.toFixed(1),
    FREQUENCIA_GERAL: academic?.frequenciaGeral === null || academic?.frequenciaGeral === undefined
      ? '—'
      : `${academic.frequenciaGeral.toFixed(0)}%`,
    SITUACAO_ACADEMICA: canonicalText(academic?.situacaoAcademica, snapshot.enrollmentStatus, 'Em análise').toUpperCase(),
  };

  return Object.entries(replacements).reduce((result, [token, rawValue]) => {
    const replacement = token === 'TABELA_BOLETIM_TECNICO' || !escapeValues
      ? String(rawValue || '')
      : escapeTemplateValue(rawValue);
    return result.split(`{{${token}}}`).join(replacement);
  }, String(value || ''));
};

export const resolveEmissionVectorTemplate = (
  source: EmissionPdfSource,
  value: unknown,
  escapeValues = true,
) => (
  REGISTRATION_VECTOR_DOCUMENTS.has(source.emission.documento)
    ? resolveRegistrationSnapshotTemplate(
        String(value || ''),
        source.emission,
        source.preview,
        escapeValues,
      )
    : source.emission.documento === 'boletim'
      ? resolveAcademicSnapshotTemplate(source, value, escapeValues)
      : String(value || '')
);
