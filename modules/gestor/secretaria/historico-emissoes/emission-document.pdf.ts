import type { jsPDF } from 'jspdf';

import {
  createCanonicalPdfQr,
  drawCanonicalPdfText,
  drawCanonicalPdfWatermark,
  normalizeCanonicalPdfText,
  resolveCanonicalPdfPhoto,
  type CanonicalPdfImage,
} from '../shared/canonical-document-vector-pdf';
import type {
  CanonicalDocumentPdfBuildOptions,
  CanonicalDocumentPdfResult,
} from '../shared/canonical-document-pdf.types';
import { canonicalAsRecord, canonicalText } from '../shared/canonical-document-render.utils';
import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
  type CanonicalInstitutionalHeader,
} from '../shared/canonical-institutional-header-pdf';
import { DOCUMENT_TABS, isCertificateDocument } from './historico-emissoes.constants';
import {
  hasExplicitQrCodeField,
  isPublicDocumentValidationEnabled,
} from './document-validation-rendering';
import { snapshotFirst } from './voter-snapshot';
import { repairFichaVoterGrid } from '../../cadastros/ficha-matricula/voter-template-repair';
import type {
  AcademicComponentRow,
  EmissionLog,
  PreviewResources,
} from './historico-emissoes.types';

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const TEMPLATE_WIDTH_PX = 794;
const TEMPLATE_HEIGHT_PX = 1123;
const PAGE_LEFT_MM = 20;
const PAGE_RIGHT_MM = 20;
const PAGE_BOTTOM_MM = 18;
const BODY_TOP_MM = 87;
const CONTINUATION_BODY_TOP_MM = 66;
const BODY_FONT_SIZE = 10.5;
const BODY_LINE_HEIGHT = 1.55;
const DEFAULT_WATERMARK_SCALE = 50;

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;
type TemplateField = Record<string, any>;

interface VectorPage {
  bodyTemplate: string;
  body: string;
  fields: TemplateField[];
}

interface VectorDocument {
  source: EmissionPdfSource;
  pages: VectorPage[];
  institutionName: string;
  institutionHeader: CanonicalInstitutionalHeader;
  title: string;
  logo: CanonicalPdfImage | null;
  watermark: CanonicalPdfImage | null;
  watermarkConfig: Record<string, unknown>;
  qr: CanonicalPdfImage | null;
  fieldImages: Map<string, CanonicalPdfImage | null>;
}

export interface EmissionPdfSource {
  emission: EmissionLog;
  preview: PreviewResources;
}

export const getRegistrationWatermarkGeometry = (rawScale: unknown) => {
  const parsed = Number(rawScale);
  const scale = Number.isFinite(parsed)
    ? Math.min(100, Math.max(5, parsed))
    : DEFAULT_WATERMARK_SCALE;
  const width = PAGE_WIDTH_MM * scale / 100;
  const height = PAGE_HEIGHT_MM * scale / 100;
  return {
    scale,
    x: (PAGE_WIDTH_MM - width) / 2,
    y: (PAGE_HEIGHT_MM - height) / 2,
    width,
    height,
    textSize: 30 * scale / DEFAULT_WATERMARK_SCALE,
  };
};

const decodeHtmlEntities = (value: string) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));

/**
 * Converte somente a apresentação já resolvida do snapshot em texto PDF.
 * Não mede nem divide conteúdo em páginas: quebras e geometria continuam
 * vindo exclusivamente de `pageCount`, `data-page-break` e `absoluteFields`.
 */
export const emissionHtmlToVectorText = (html: string) => {
  const text = String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '· ')
    .replace(/<\/strong\s*>/gi, ': ')
    .replace(/<\/(?:p|div|section|article|header|footer|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<\/(?:td|th)\s*>/gi, '  ')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const splitExplicitTemplatePages = (html: string) => String(html || '')
  .split(/<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>/gi);

const assertNoResidualTemplateTokens = (value: string, context: string) => {
  const residual = value.match(/{{[^{}]+}}/g);
  if (residual?.length) {
    throw new Error(
      `${context} ainda contém variável não resolvida (${residual[0]}). `
      + 'A emissão foi bloqueada para não produzir um documento incompleto.',
    );
  }
};

const escapeTemplateValue = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatSnapshotDate = (value: unknown) => {
  const raw = String(value || '').split('T')[0];
  const parts = raw.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw || '—';
};

const formatSnapshotCpf = (value: unknown) => {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  return digits.length === 11
    ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
    : raw;
};

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
    ALUNO_TITULO_ELEITOR: snapshotText('studentVoterId', emission.aluno?.titulo_eleitor),
    ALUNO_TITULO_ZONA: snapshotText('studentVoterZone', emission.aluno?.titulo_eleitor_zona),
    ALUNO_TITULO_SECAO: snapshotText('studentVoterSection', emission.aluno?.titulo_eleitor_secao),
    ALUNO_TITULO_EMISSAO: formatSnapshotDate(snapshotValue('studentVoterIssueDate', emission.aluno?.titulo_eleitor_data_emissao)),
    ALUNO_TITULO_UF: snapshotText('studentVoterState', emission.aluno?.titulo_eleitor_uf),
    ALUNO_RESERVISTA: snapshotText('studentReservist', emission.aluno?.reservista),
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

  return Object.entries(replacements).reduce((result, [token, rawValue]) => {
    const value = ['FICHA_CAMPOS_EXTRAS', 'FICHA_ASSINATURAS'].includes(token)
      ? String(rawValue || '')
      : escapeValues
        ? escapeTemplateValue(rawValue)
        : String(rawValue || '');
    return result.split(`{{${token}}}`).join(value);
  }, String(source || ''));
};

const REGISTRATION_VECTOR_DOCUMENTS = new Set([
  'pasta_identificacao',
  'ficha_matricula',
]);

const resolveAcademicSnapshotTemplate = (
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

const resolveEmissionVectorTemplate = (
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

const pxToMmX = (value: unknown) => Number(value || 0) * PAGE_WIDTH_MM / TEMPLATE_WIDTH_PX;
const pxToMmY = (value: unknown) => Number(value || 0) * PAGE_HEIGHT_MM / TEMPLATE_HEIGHT_PX;

const getDocumentTitle = (emission: EmissionLog) => (
  emission.documento === 'boletim'
    ? 'Boletim Escolar — Cursos Técnicos'
    : DOCUMENT_TABS.find((tab) => tab.key === emission.documento)?.label || 'Documento'
);

const getConfiguredPages = (source: EmissionPdfSource): VectorPage[] => {
  const { emission, preview } = source;
  const template = canonicalAsRecord(preview.template);
  if (!Object.keys(template).length) {
    throw new Error(`O modelo oficial de ${getDocumentTitle(emission)} não possui geometria vetorial suficiente.`);
  }
  if (isCertificateDocument(emission.documento) || ['carteirinha', 'cracha_estagio'].includes(emission.documento)) {
    throw new Error(
      `${getDocumentTitle(emission)} ainda não possui geometria A4 vetorial canônica para esta exportação. `
      + 'A emissão foi bloqueada sem rasterizar a página.',
    );
  }

  const pageCount = Number(template.pageCount || 1);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 100) {
    throw new Error('O snapshot do modelo possui uma quantidade de páginas inválida.');
  }
  const absoluteFields = Array.isArray(template.absoluteFields)
    ? template.absoluteFields.filter((field): field is TemplateField => Boolean(field && typeof field === 'object'))
    : [];
  const highestFieldPage = absoluteFields.reduce((highest, field) => Math.max(
    highest,
    Math.floor(Math.max(0, Number(field.y || 0)) / TEMPLATE_HEIGHT_PX),
  ), 0);
  const bodyTemplates = splitExplicitTemplatePages(String(template.textContent || ''));
  const explicitBodies = bodyTemplates.map((bodyTemplate) => {
    const parsedBody = resolveEmissionVectorTemplate(source, bodyTemplate);
    assertNoResidualTemplateTokens(parsedBody, 'O conteúdo do modelo');
    return parsedBody;
  });
  const totalPages = Math.max(pageCount, highestFieldPage + 1, bodyTemplates.length);

  return Array.from({ length: totalPages }, (_, pageIndex) => ({
    bodyTemplate: bodyTemplates[pageIndex] || '',
    body: emissionHtmlToVectorText(explicitBodies[pageIndex] || ''),
    fields: absoluteFields.filter((field) => (
      Math.floor(Math.max(0, Number(field.y || 0)) / TEMPLATE_HEIGHT_PX) === pageIndex
    )),
  }));
};

const getFrozenPresentation = (source: EmissionPdfSource) => {
  const snapshot = canonicalAsRecord(source.emission.dados_emissao);
  return {
    institution: canonicalAsRecord(snapshotFirst(
      snapshot,
      'institutionSnapshot',
      source.preview.polo,
    )),
    watermark: canonicalAsRecord(snapshotFirst(
      snapshot,
      'watermarkSnapshot',
      source.preview.watermark,
    )),
  };
};

const prepareVectorDocument = async (
  source: EmissionPdfSource,
  imageCache: Map<string, Promise<CanonicalPdfImage | null>>,
): Promise<VectorDocument> => {
  const pages = getConfiguredPages(source);
  const { institution: polo, watermark } = getFrozenPresentation(source);
  const template = canonicalAsRecord(source.preview.template);
  const parseTemplate = (value: unknown, escapeValues = true) => (
    resolveEmissionVectorTemplate(source, value, escapeValues)
  );
  const resolveCached = (value: unknown) => {
    const url = String(value || '').trim();
    if (!url) return Promise.resolve(null);
    const cached = imageCache.get(url);
    if (cached) return cached;
    const request = resolveCanonicalPdfPhoto(url);
    imageCache.set(url, request);
    return request;
  };

  const fieldImageEntries = pages.flatMap((page) => page.fields)
    .filter((field) => field.type === 'image')
    .map((field) => {
      const sourceValue = parseTemplate(field.value, false);
      assertNoResidualTemplateTokens(sourceValue, `O campo “${field.id || 'imagem'}”`);
      return [field.id || `${field.x}:${field.y}`, sourceValue] as const;
    });
  const [logo, watermarkImage, qr, fieldAssets] = await Promise.all([
    resolveCached(polo.logoUrl || polo.logo_url),
    resolveCached(watermark.watermarkUrl || watermark.watermark_url),
    isPublicDocumentValidationEnabled(source.emission) && hasExplicitQrCodeField(template)
      ? createCanonicalPdfQr(source.emission.codigo)
      : Promise.resolve(null),
    Promise.all(fieldImageEntries.map(async ([key, url]) => [key, await resolveCached(url)] as const)),
  ]);

  return {
    source,
    pages,
    institutionName: canonicalText(polo.nomeFantasia, polo.nome, 'UNIVERSO CURSOS E CONSULTORIA'),
    institutionHeader: normalizeCanonicalInstitutionalHeader(polo),
    title: getDocumentTitle(source.emission),
    logo,
    watermark: watermarkImage,
    watermarkConfig: watermark,
    qr,
    fieldImages: new Map(fieldAssets),
  };
};

const drawImageContained = (
  pdf: jsPDF,
  image: CanonicalPdfImage,
  x: number,
  y: number,
  width: number,
  height: number,
  alias: string,
) => {
  const properties = pdf.getImageProperties(image.dataUrl);
  const scale = Math.min(width / properties.width, height / properties.height);
  const renderedWidth = properties.width * scale;
  const renderedHeight = properties.height * scale;
  pdf.addImage(
    image.dataUrl,
    image.format,
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
    alias,
    'FAST',
  );
};

const assertTextFits = (
  pdf: jsPDF,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  lineHeight: number,
  context: string,
) => {
  const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(text), width) as string[];
  const requiredHeight = lines.length * fontSize * 0.352778 * lineHeight;
  if (requiredHeight > height + 0.5) {
    throw new Error(
      `${context} ultrapassa a área canônica da página. Revise a paginação/geometria no modelo antes de emitir.`,
    );
  }
  return lines;
};

const drawBody = (pdf: jsPDF, body: string, titleVisible: boolean) => {
  if (!body) return;
  const startY = titleVisible ? BODY_TOP_MM : CONTINUATION_BODY_TOP_MM;
  const width = PAGE_WIDTH_MM - PAGE_LEFT_MM - PAGE_RIGHT_MM;
  const height = PAGE_HEIGHT_MM - PAGE_BOTTOM_MM - startY;
  pdf.setFont('times', 'normal');
  pdf.setFontSize(BODY_FONT_SIZE);
  pdf.setTextColor(15, 23, 42);
  const lines = assertTextFits(pdf, body, width, height, BODY_FONT_SIZE, BODY_LINE_HEIGHT, 'O conteúdo do documento');
  pdf.text(lines, PAGE_LEFT_MM, startY, {
    baseline: 'top',
    lineHeightFactor: BODY_LINE_HEIGHT,
  });
};

const BULLETIN_TABLE_TOKEN = '{{TABELA_BOLETIM_TECNICO}}';
const BULLETIN_BODY_GAP_MM = 2.5;
const BULLETIN_FOOTER_GAP_MM = 4;
const BULLETIN_TABLE_COLUMN_WIDTHS = [78, 14, 16, 30, 32] as const;
const BULLETIN_TABLE_HEADERS = [
  'Componente Curricular',
  'CH',
  'Nota',
  'Frequência',
  'Situação',
] as const;

const getBulletinBodyBottom = (
  fields: TemplateField[],
  pageIndex: number,
) => {
  const fieldTops = fields
    .map((field) => pxToMmY(Number(field.y || 0) - pageIndex * TEMPLATE_HEIGHT_PX))
    .filter((value) => Number.isFinite(value) && value > BODY_TOP_MM);
  return fieldTops.length
    ? Math.min(...fieldTops) - BULLETIN_FOOTER_GAP_MM
    : PAGE_HEIGHT_MM - PAGE_BOTTOM_MM;
};

const isBulletinHeading = (line: string) => (
  /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/u.test(line)
  && line === line.toLocaleUpperCase('pt-BR')
);

interface BulletinTextRun {
  text: string;
  bold: boolean;
}

const BULLETIN_BOLD_OPEN = '\u0001';
const BULLETIN_BOLD_CLOSE = '\u0002';

const bulletinHtmlToStyledParagraphs = (html: string): BulletinTextRun[][] => {
  const marked = decodeHtmlEntities(String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<(?:strong|b)\b[^>]*>/gi, BULLETIN_BOLD_OPEN)
    .replace(/<\/(?:strong|b)\s*>/gi, BULLETIN_BOLD_CLOSE)
    .replace(/<\/(?:p|div|section|article|header|footer|h[1-6]|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));

  return marked
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, lines) => line || (index > 0 && Boolean(lines[index - 1])))
    .map((line) => {
      if (!line) return [];
      const runs: BulletinTextRun[] = [];
      let bold = false;
      let buffer = '';
      const flush = () => {
        if (buffer) runs.push({ text: buffer, bold });
        buffer = '';
      };
      [...line].forEach((character) => {
        if (character === BULLETIN_BOLD_OPEN) {
          flush();
          bold = true;
        } else if (character === BULLETIN_BOLD_CLOSE) {
          flush();
          bold = false;
        } else {
          buffer += character;
        }
      });
      flush();
      return runs;
    });
};

const wrapBulletinRuns = (
  pdf: jsPDF,
  runs: BulletinTextRun[],
  width: number,
  forceBold: boolean,
) => {
  const lines: BulletinTextRun[][] = [];
  let currentLine: BulletinTextRun[] = [];
  let currentWidth = 0;

  const appendRun = (text: string, bold: boolean) => {
    const previous = currentLine.at(-1);
    if (previous?.bold === bold) {
      previous.text += text;
    } else {
      currentLine.push({ text, bold });
    }
  };

  const commitLine = () => {
    if (currentLine.length) lines.push(currentLine);
    currentLine = [];
    currentWidth = 0;
  };

  runs.forEach((run) => {
    const bold = forceBold || run.bold;
    run.text.split(/(\s+)/).filter(Boolean).forEach((token) => {
      const isSpace = /^\s+$/.test(token);
      if (isSpace && !currentLine.length) return;
      pdf.setFont('times', bold ? 'bold' : 'normal');
      const tokenWidth = pdf.getTextWidth(token);
      if (!isSpace && currentLine.length && currentWidth + tokenWidth > width) {
        commitLine();
      }
      if (isSpace && currentWidth + tokenWidth > width) {
        commitLine();
        return;
      }
      appendRun(token, bold);
      currentWidth += tokenWidth;
    });
  });
  commitLine();
  return lines;
};

const drawBulletinText = (
  pdf: jsPDF,
  html: string,
  startY: number,
  maximumY: number,
  context: string,
) => {
  const paragraphs = bulletinHtmlToStyledParagraphs(html);
  if (!paragraphs.length) return startY;

  let cursorY = startY;
  const width = PAGE_WIDTH_MM - PAGE_LEFT_MM - PAGE_RIGHT_MM;
  paragraphs.forEach((runs) => {
    if (!runs.length) {
      cursorY += 2;
      return;
    }
    const text = runs.map((run) => run.text).join('').trim();
    const heading = isBulletinHeading(text);
    const fontSize = heading ? 10.2 : 9.5;
    const lineHeight = heading ? 1.2 : 1.3;
    pdf.setFontSize(fontSize);
    pdf.setTextColor(15, 23, 42);
    const lines = wrapBulletinRuns(pdf, runs, width, heading);
    const height = lines.length * fontSize * 0.352778 * lineHeight;
    if (cursorY + height > maximumY + 0.01) {
      throw new Error(
        `${context} invade a faixa reservada aos campos inferiores do boletim. `
        + 'Revise a quantidade de componentes ou a geometria do modelo antes de emitir.',
      );
    }
    const lineHeightMm = fontSize * 0.352778 * lineHeight;
    lines.forEach((line, lineIndex) => {
      let cursorX = PAGE_LEFT_MM;
      line.forEach((run) => {
        pdf.setFont('times', run.bold ? 'bold' : 'normal');
        pdf.text(normalizeCanonicalPdfText(run.text), cursorX, cursorY + lineIndex * lineHeightMm, {
          baseline: 'top',
        });
        cursorX += pdf.getTextWidth(run.text);
      });
    });
    cursorY += height + (heading ? 2.2 : 1.25);
  });
  return cursorY;
};

interface BulletinTableRowPlan {
  kind: 'header' | 'module' | 'component';
  values: string[];
  lines: string[][];
  height: number;
}

const getBulletinCellLines = (
  pdf: jsPDF,
  value: string,
  width: number,
  fontSize: number,
  bold: boolean,
  context: string,
) => {
  pdf.setFont('times', bold ? 'bold' : 'normal');
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(value),
    Math.max(1, width - 3),
  ) as string[];
  if (lines.length > 3) {
    throw new Error(`${context} não cabe na largura canônica da tabela do boletim.`);
  }
  return lines.length ? lines : ['—'];
};

const buildBulletinTablePlan = (
  pdf: jsPDF,
  components: AcademicComponentRow[],
) => {
  const plans: BulletinTableRowPlan[] = [];
  const headerFontSize = 6.7;
  const headerLines = BULLETIN_TABLE_HEADERS.map((value, index) => (
    getBulletinCellLines(
      pdf,
      value,
      BULLETIN_TABLE_COLUMN_WIDTHS[index],
      headerFontSize,
      true,
      `O cabeçalho “${value}”`,
    )
  ));
  plans.push({
    kind: 'header',
    values: [...BULLETIN_TABLE_HEADERS],
    lines: headerLines,
    height: Math.max(7, ...headerLines.map((lines) => lines.length * 2.65 + 2.2)),
  });

  let currentModule: string | null = null;
  components.forEach((component) => {
    const moduleName = canonicalText(component.moduleName, 'Módulo');
    if (moduleName !== currentModule) {
      const moduleLabel = moduleName.toLocaleUpperCase('pt-BR');
      const moduleLines = getBulletinCellLines(
        pdf,
        moduleLabel,
        BULLETIN_TABLE_COLUMN_WIDTHS.reduce((total, width) => total + width, 0),
        6.8,
        true,
        `O módulo “${moduleName}”`,
      );
      plans.push({
        kind: 'module',
        values: [moduleLabel],
        lines: [moduleLines],
        height: Math.max(6.2, moduleLines.length * 2.7 + 2),
      });
      currentModule = moduleName;
    }

    const workload = Number(component.cargaHoraria || 0);
    const values = [
      canonicalText(component.discipline, 'Componente não informado'),
      workload > 0 ? `${workload}h` : '—',
      component.nota === null || component.nota === undefined
        ? '—'
        : Number(component.nota).toFixed(1),
      component.frequencia === null || component.frequencia === undefined
        ? '—'
        : `${Number(component.frequencia).toFixed(0)}%`,
      canonicalText(component.situacao, 'Em análise'),
    ];
    const lines = values.map((value, index) => getBulletinCellLines(
      pdf,
      value,
      BULLETIN_TABLE_COLUMN_WIDTHS[index],
      6.8,
      false,
      `O valor “${value}”`,
    ));
    plans.push({
      kind: 'component',
      values,
      lines,
      height: Math.max(6.2, ...lines.map((cellLines) => cellLines.length * 2.7 + 2)),
    });
  });
  return plans;
};

const drawBulletinTableCell = (
  pdf: jsPDF,
  lines: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    align: 'left' | 'center';
    bold: boolean;
    fill?: [number, number, number];
    fontSize: number;
  },
) => {
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.2);
  if (options.fill) {
    pdf.setFillColor(...options.fill);
    pdf.rect(x, y, width, height, 'FD');
  } else {
    pdf.rect(x, y, width, height, 'S');
  }
  pdf.setFont('times', options.bold ? 'bold' : 'normal');
  pdf.setFontSize(options.fontSize);
  pdf.setTextColor(15, 23, 42);
  const lineHeightMm = options.fontSize * 0.352778 * 1.1;
  const textY = y + Math.max(1, (height - lines.length * lineHeightMm) / 2);
  pdf.text(
    lines,
    options.align === 'center' ? x + width / 2 : x + 1.5,
    textY,
    {
      align: options.align,
      baseline: 'top',
      lineHeightFactor: 1.1,
    },
  );
};

const drawBulletinTable = (
  pdf: jsPDF,
  components: AcademicComponentRow[],
  startY: number,
  maximumY: number,
) => {
  if (!components.length) {
    return drawBulletinText(
      pdf,
      '<p>Não há componentes curriculares disponíveis no momento.</p>',
      startY,
      maximumY,
      'A mensagem de componentes curriculares',
    );
  }

  const plan = buildBulletinTablePlan(pdf, components);
  const requiredHeight = plan.reduce((total, row) => total + row.height, 0);
  if (startY + requiredHeight > maximumY + 0.01) {
    throw new Error(
      'A tabela do boletim invade a faixa reservada aos campos inferiores. '
      + 'Revise a quantidade de componentes ou a geometria canônica antes de emitir.',
    );
  }

  const totalWidth = BULLETIN_TABLE_COLUMN_WIDTHS.reduce((total, width) => total + width, 0);
  let cursorY = startY;
  plan.forEach((row) => {
    if (row.kind === 'module') {
      drawBulletinTableCell(
        pdf,
        row.lines[0],
        PAGE_LEFT_MM,
        cursorY,
        totalWidth,
        row.height,
        { align: 'left', bold: true, fill: [241, 245, 249], fontSize: 6.8 },
      );
      cursorY += row.height;
      return;
    }

    let cursorX = PAGE_LEFT_MM;
    row.lines.forEach((lines, columnIndex) => {
      const width = BULLETIN_TABLE_COLUMN_WIDTHS[columnIndex];
      drawBulletinTableCell(
        pdf,
        lines,
        cursorX,
        cursorY,
        width,
        row.height,
        {
          align: columnIndex === 0 ? 'left' : 'center',
          bold: row.kind === 'header',
          fill: row.kind === 'header' ? [248, 250, 252] : undefined,
          fontSize: row.kind === 'header' ? 6.7 : 6.8,
        },
      );
      cursorX += width;
    });
    cursorY += row.height;
  });
  return cursorY;
};

const drawAcademicBulletinBody = (
  pdf: jsPDF,
  visual: VectorDocument,
  page: VectorPage,
  pageIndex: number,
) => {
  const tokenCount = page.bodyTemplate.split(BULLETIN_TABLE_TOKEN).length - 1;
  if (tokenCount > 1) {
    throw new Error('O modelo do boletim contém mais de uma tabela acadêmica na mesma página.');
  }
  const [beforeTemplate, afterTemplate = ''] = page.bodyTemplate.split(BULLETIN_TABLE_TOKEN);
  const beforeHtml = resolveEmissionVectorTemplate(visual.source, beforeTemplate);
  const afterHtml = resolveEmissionVectorTemplate(visual.source, afterTemplate);
  assertNoResidualTemplateTokens(beforeHtml, 'O conteúdo anterior à tabela do boletim');
  assertNoResidualTemplateTokens(afterHtml, 'O conteúdo posterior à tabela do boletim');

  const maximumY = getBulletinBodyBottom(page.fields, pageIndex);
  if (maximumY <= BODY_TOP_MM) {
    throw new Error('Os campos inferiores do boletim invadem a área reservada ao conteúdo acadêmico.');
  }

  let cursorY = drawBulletinText(
    pdf,
    beforeHtml,
    BODY_TOP_MM,
    maximumY,
    'O cabeçalho acadêmico',
  );
  if (tokenCount === 1) {
    const components = visual.source.preview.academicData?.componentes;
    if (!Array.isArray(components)) {
      throw new Error('O payload canônico do boletim não retornou os componentes estruturados da tabela.');
    }
    cursorY = drawBulletinTable(
      pdf,
      components,
      cursorY + BULLETIN_BODY_GAP_MM,
      maximumY,
    );
  }
  drawBulletinText(
    pdf,
    afterHtml,
    cursorY + BULLETIN_BODY_GAP_MM,
    maximumY,
    'O resumo acadêmico',
  );
};

interface BalancedHtmlElement {
  openTag: string;
  inner: string;
  full: string;
}

const parseInlineStyle = (tag: string) => {
  const match = tag.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i);
  if (!match) return {} as Record<string, string>;
  return Object.fromEntries(match[2]
    .split(';')
    .map((declaration) => declaration.split(':'))
    .filter((parts) => parts.length >= 2)
    .map(([property, ...value]) => [property.trim().toLowerCase(), value.join(':').trim()]));
};

const extractBalancedElement = (
  html: string,
  tagName: 'section' | 'div' | 'h4' | 'strong',
  startIndex: number,
): BalancedHtmlElement | null => {
  const opening = new RegExp(`<${tagName}\\b[^>]*>`, 'ig');
  opening.lastIndex = startIndex;
  const openMatch = opening.exec(html);
  if (!openMatch || openMatch.index !== startIndex) return null;

  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'ig');
  tokenPattern.lastIndex = opening.lastIndex;
  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(html))) {
    if (/^<\//.test(token[0])) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return {
        openTag: openMatch[0],
        inner: html.slice(opening.lastIndex, token.index),
        full: html.slice(startIndex, tokenPattern.lastIndex),
      };
    }
  }
  return null;
};

const findBalancedElement = (
  html: string,
  tagName: 'section' | 'div' | 'h4' | 'strong',
  predicate: (element: BalancedHtmlElement) => boolean = () => true,
) => {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, 'ig');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const element = extractBalancedElement(html, tagName, match.index);
    if (element && predicate(element)) return element;
  }
  return null;
};

const collectDirectDivs = (html: string) => {
  const result: BalancedHtmlElement[] = [];
  const tokenPattern = /<\/?div\b[^>]*>/ig;
  let depth = 0;
  let start = -1;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(html))) {
    if (!/^<\//.test(token[0])) {
      if (depth === 0) start = token.index;
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth === 0 && start >= 0) {
      const element = extractBalancedElement(html, 'div', start);
      if (element) result.push(element);
      start = -1;
    }
  }
  return result;
};

const cssPixels = (value: string | undefined, fallback = 0) => {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const expandGridColumns = (value: string | undefined) => {
  const source = String(value || '').replace(
    /repeat\(\s*(\d+)\s*,\s*([^()]+)\)/gi,
    (_match, count, unit) => Array.from({ length: Number(count) }, () => unit.trim()).join(' '),
  );
  const columns = source
    .split(/\s+/)
    .map((part) => Number.parseFloat(part))
    .filter((part) => Number.isFinite(part) && part > 0);
  return columns.length ? columns : [1];
};

const parseGridRows = (value: string | undefined, cellCount: number, columnCount: number) => {
  const repeated = String(value || '').match(/repeat\(\s*(\d+)/i);
  if (repeated) return Math.max(1, Number(repeated[1]));
  return Math.max(1, Math.ceil(cellCount / columnCount));
};

const parseSpacing = (value: string | undefined) => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  const vertical = cssPixels(parts[0]);
  const horizontal = cssPixels(parts[1], vertical);
  return { vertical, horizontal };
};

const assertCellLines = (
  pdf: jsPDF,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  maxLines: number,
  context: string,
) => {
  const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(text), width) as string[];
  const requiredHeight = lines.length * fontSize * 0.352778 * 1.12;
  if (lines.length > maxLines || requiredHeight > height + 0.3) {
    throw new Error(
      `${context} ultrapassa a célula canônica do modelo. Revise a geometria ou o conteúdo antes de emitir.`,
    );
  }
  return lines;
};

const drawRegistrationGrid = (
  pdf: jsPDF,
  html: string,
  x: number,
  y: number,
  width: number,
  height: number,
  context: string,
) => {
  const sectionStart = html.search(/<section\b/i);
  if (sectionStart < 0) return false;
  const section = extractBalancedElement(html, 'section', sectionStart);
  if (!section) return false;
  const sectionStyle = parseInlineStyle(section.openTag);
  const header = findBalancedElement(section.inner, 'h4');
  const sectionIsGrid = sectionStyle.display === 'grid';
  const grid = sectionIsGrid
    ? section
    : findBalancedElement(section.inner, 'div', (element) => (
      parseInlineStyle(element.openTag).display === 'grid'
    ));

  const hasBackground = Boolean(sectionStyle['background-color'] || sectionStyle.background);
  const hasBorder = Boolean(sectionStyle.border);
  pdf.setFillColor(255, 255, 255);
  if (sectionStyle.border?.includes('#94a3b8')) pdf.setDrawColor(148, 163, 184);
  else pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.22);
  const radius = sectionStyle['border-radius'] ? Math.min(2.2, pxToMmX(cssPixels(sectionStyle['border-radius']))) : 0;
  const panelStyle = hasBackground && hasBorder ? 'FD' : hasBackground ? 'F' : hasBorder ? 'S' : null;
  if (panelStyle && radius > 0) pdf.roundedRect(x, y, width, height, radius, radius, panelStyle);
  else if (panelStyle) pdf.rect(x, y, width, height, panelStyle);

  if (!grid) {
    const padding = parseSpacing(sectionStyle.padding || '6px 8px');
    const paddingX = pxToMmX(padding.horizontal);
    const paddingY = pxToMmY(padding.vertical);
    const text = emissionHtmlToVectorText(section.inner);
    if (!text) return true;
    pdf.setFont('times', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(15, 23, 42);
    const lines = assertTextFits(
      pdf,
      text,
      Math.max(1, width - paddingX * 2),
      Math.max(1, height - paddingY * 2),
      7,
      1.2,
      context,
    );
    pdf.text(lines, x + paddingX, y + paddingY, { baseline: 'top', lineHeightFactor: 1.2 });
    return true;
  }

  let gridY = y + pxToMmY(cssPixels(sectionStyle['margin-top']));
  let gridHeight = height - (gridY - y);
  if (gridHeight <= 0) {
    throw new Error(`${context} não possui área útil após a margem superior.`);
  }
  if (header) {
    const headerHeight = Math.min(gridHeight, pxToMmY(18));
    pdf.setFillColor(239, 246, 255);
    pdf.roundedRect(x, y, width, headerHeight, radius, radius, 'F');
    pdf.rect(x, y + Math.max(0, headerHeight - radius), width, Math.min(radius, headerHeight), 'F');
    pdf.setDrawColor(219, 234, 254);
    pdf.line(x, y + headerHeight, x + width, y + headerHeight);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.6);
    pdf.setTextColor(0, 26, 51);
    drawCanonicalPdfText(pdf, emissionHtmlToVectorText(header.inner).toUpperCase(), x + pxToMmX(7), y + pxToMmY(4), {
      maxWidth: width - pxToMmX(14),
      maxLines: 1,
    });
    gridY += headerHeight;
    gridHeight -= headerHeight;
  }

  const gridStyle = parseInlineStyle(grid.openTag);
  const inheritedTextAlignSource = gridStyle['text-align'] || sectionStyle['text-align'];
  const inheritedTextAlign = inheritedTextAlignSource === 'center' || inheritedTextAlignSource === 'right'
    ? inheritedTextAlignSource
    : 'left';
  const cells = collectDirectDivs(grid.inner);
  if (!cells.length) return false;
  const columns = expandGridColumns(gridStyle['grid-template-columns']);
  const rows = parseGridRows(gridStyle['grid-template-rows'], cells.length, columns.length);
  const gap = parseSpacing(gridStyle.gap);
  const padding = parseSpacing(gridStyle.padding || sectionStyle.padding);
  const gapX = pxToMmX(gap.horizontal);
  const gapY = pxToMmY(gap.vertical);
  const paddingX = pxToMmX(padding.horizontal);
  const paddingY = pxToMmY(padding.vertical);
  const availableWidth = width - paddingX * 2 - gapX * (columns.length - 1);
  const availableHeight = gridHeight - paddingY * 2 - gapY * (rows - 1);
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error(`${context} possui uma grade vetorial sem área útil.`);
  }
  const columnUnit = availableWidth / columns.reduce((total, current) => total + current, 0);
  const columnWidths = columns.map((column) => column * columnUnit);
  const rowHeight = availableHeight / rows;
  const occupied = Array.from({ length: rows }, () => Array(columns.length).fill(false));

  const locateCell = (span: number) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column <= columns.length - span; column += 1) {
        if (occupied[row].slice(column, column + span).every((value) => !value)) {
          for (let index = column; index < column + span; index += 1) occupied[row][index] = true;
          return { row, column };
        }
      }
    }
    return null;
  };

  cells.forEach((cell, cellIndex) => {
    const cellStyle = parseInlineStyle(cell.openTag);
    const spanMatch = cellStyle['grid-column']?.match(/span\s+(\d+)/i);
    const span = Math.min(columns.length, Math.max(1, Number(spanMatch?.[1] || 1)));
    const position = locateCell(span);
    if (!position) throw new Error(`${context} possui células além da grade canônica configurada.`);
    const cellX = x + paddingX
      + columnWidths.slice(0, position.column).reduce((total, current) => total + current, 0)
      + gapX * position.column;
    const cellY = gridY + paddingY + position.row * (rowHeight + gapY);
    const cellWidth = columnWidths
      .slice(position.column, position.column + span)
      .reduce((total, current) => total + current, 0)
      + gapX * (span - 1);
    const borderTop = String(cellStyle['border-top'] || '');
    const cellPadding = parseSpacing(cellStyle.padding);
    const paddingTop = pxToMmY(cssPixels(cellStyle['padding-top'], cellPadding.vertical));
    if (borderTop && !/\bnone\b/i.test(borderTop)) {
      const color = borderTop.match(/#([0-9a-f]{6})\b/i)?.[1];
      if (color) {
        pdf.setDrawColor(
          Number.parseInt(color.slice(0, 2), 16),
          Number.parseInt(color.slice(2, 4), 16),
          Number.parseInt(color.slice(4, 6), 16),
        );
      } else {
        pdf.setDrawColor(15, 23, 42);
      }
      pdf.setLineWidth(Math.max(0.1, pxToMmY(cssPixels(borderTop, 1))));
      pdf.line(cellX, cellY, cellX + cellWidth, cellY);
    }
    const strong = findBalancedElement(cell.inner, 'strong');
    const label = strong ? emissionHtmlToVectorText(strong.inner) : '';
    const value = emissionHtmlToVectorText(strong ? cell.inner.replace(strong.full, '') : cell.inner);
    const innerX = cellX + 0.2;
    const textWidth = Math.max(1, cellWidth - 0.4);
    const cellTextAlign = cellStyle['text-align'] === 'center' || cellStyle['text-align'] === 'right'
      ? cellStyle['text-align']
      : inheritedTextAlign;
    let cursorY = cellY + paddingTop;

    if (label) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(4.8);
      pdf.setTextColor(15, 23, 42);
      const labelLines = assertCellLines(
        pdf,
        label.toUpperCase(),
        textWidth,
        Math.max(0.5, cellY + rowHeight - cursorY),
        4.8,
        2,
        `${context}, rótulo ${cellIndex + 1}`,
      );
      const labelX = cellTextAlign === 'center'
        ? cellX + cellWidth / 2
        : cellTextAlign === 'right'
          ? cellX + cellWidth - 0.2
          : innerX;
      pdf.text(labelLines, labelX, cursorY, {
        align: cellTextAlign,
        baseline: 'top',
        lineHeightFactor: 1.1,
      });
      cursorY += labelLines.length * 4.8 * 0.352778 * 1.1 + 0.45;
    }
    if (value) {
      pdf.setFont('times', 'normal');
      pdf.setFontSize(6.2);
      pdf.setTextColor(51, 65, 85);
      const valueHeight = Math.max(0.5, cellY + rowHeight - cursorY);
      const valueLines = assertCellLines(pdf, value, textWidth, valueHeight, 6.2, 2, `${context}, valor ${cellIndex + 1}`);
      const valueX = cellTextAlign === 'center'
        ? cellX + cellWidth / 2
        : cellTextAlign === 'right'
          ? cellX + cellWidth - 0.2
          : innerX;
      pdf.text(valueLines, valueX, cursorY, {
        align: cellTextAlign,
        baseline: 'top',
        lineHeightFactor: 1.12,
      });
    }
  });
  return true;
};

const drawField = (
  pdf: jsPDF,
  visual: VectorDocument,
  field: TemplateField,
  pageIndex: number,
) => {
  const fieldKey = field.id || `${field.x}:${field.y}`;
  const x = pxToMmX(field.x);
  const y = pxToMmY(Number(field.y || 0) - pageIndex * TEMPLATE_HEIGHT_PX);
  const width = Math.max(1, pxToMmX(field.width || 120));
  const height = Math.max(1, field.height
    ? pxToMmY(field.height)
    : PAGE_HEIGHT_MM - PAGE_BOTTOM_MM - y);
  if (x < 0 || y < 0 || x + width > PAGE_WIDTH_MM + 0.5 || y + height > PAGE_HEIGHT_MM + 0.5) {
    throw new Error(`O campo “${fieldKey}” está fora da geometria A4 canônica do modelo.`);
  }

  const style = canonicalAsRecord(field.style);
  if (canonicalText(style.border)) {
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, width, height, 1.3, 1.3, 'S');
  }

  if (field.type === 'image') {
    const image = visual.fieldImages.get(fieldKey) || null;
    if (image) {
      drawImageContained(pdf, image, x, y, width, height, `secretaria-field-${visual.source.emission.id}-${fieldKey}`);
    } else {
      pdf.setDrawColor(203, 213, 225);
      pdf.rect(x, y, width, height, 'S');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.2);
      pdf.setTextColor(148, 163, 184);
      pdf.text('IMAGEM INDISPONÍVEL', x + width / 2, y + height / 2, { align: 'center', baseline: 'middle' });
    }
    return;
  }

  if (field.type === 'qrcode') {
    if (!isPublicDocumentValidationEnabled(visual.source.emission)) return;
    if (!visual.qr) throw new Error('O modelo exige QR Code, mas o ativo de validação não foi preparado.');
    const qrSize = Math.min(width, Math.max(1, height - 7));
    drawImageContained(
      pdf,
      visual.qr,
      x + (width - qrSize) / 2,
      y,
      qrSize,
      qrSize,
      `secretaria-qr-${visual.source.emission.id}`,
    );
    pdf.setFont('helvetica', 'bold');
    const codeFontSize = 5.8;
    const codeLineHeight = 1.2;
    const codeY = y + qrSize + 1;
    const codeHeight = Math.max(0, y + height - codeY);
    pdf.setFontSize(codeFontSize);
    pdf.setTextColor(29, 78, 216);
    const codeLines = assertTextFits(
      pdf,
      visual.source.emission.codigo,
      width,
      codeHeight,
      codeFontSize,
      codeLineHeight,
      `O código de validação do campo “${fieldKey}”`,
    );
    pdf.text(codeLines, x + width / 2, codeY, {
      align: 'center',
      baseline: 'top',
      lineHeightFactor: codeLineHeight,
    });
    return;
  }

  if (field.type !== 'text') return;
  const fieldValue = REGISTRATION_VECTOR_DOCUMENTS.has(visual.source.emission.documento)
    && (field.id === 'ficha_documentos' || field.id === 'pasta_documentos')
    ? repairFichaVoterGrid(field.value)
    : field.value;
  const parsed = resolveEmissionVectorTemplate(visual.source, fieldValue);
  assertNoResidualTemplateTokens(parsed, `O campo “${fieldKey}”`);
  if (drawRegistrationGrid(pdf, parsed, x, y, width, height, `O campo “${fieldKey}”`)) return;
  const text = emissionHtmlToVectorText(parsed);
  if (!text) return;
  const configuredFontSize = Number.parseFloat(String(style.fontSize || '10'));
  const fontSize = Math.min(13, Math.max(5.5, Number.isFinite(configuredFontSize) ? configuredFontSize * 0.75 : 7.5));
  const padding = canonicalText(style.padding) ? 1.5 : 0;
  const textWidth = Math.max(1, width - padding * 2);
  const textHeight = Math.max(1, height - padding * 2);
  pdf.setFont(String(style.fontWeight || '').match(/bold|[7-9]00/) ? 'times' : 'times', String(style.fontWeight || '').match(/bold|[7-9]00/) ? 'bold' : 'normal');
  pdf.setFontSize(fontSize);
  pdf.setTextColor(15, 23, 42);
  const lines = assertTextFits(pdf, text, textWidth, textHeight, fontSize, 1.25, `O campo “${fieldKey}”`);
  const align = style.textAlign === 'center' || style.textAlign === 'right' ? style.textAlign : 'left';
  const textX = align === 'center' ? x + width / 2 : align === 'right' ? x + width - padding : x + padding;
  pdf.text(lines, textX, y + padding, {
    align,
    baseline: 'top',
    lineHeightFactor: 1.25,
  });
};

const drawVectorPage = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  visual: VectorDocument,
  page: VectorPage,
  pageIndex: number,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'F');
  const watermarkRecord = visual.watermarkConfig;
  const watermarkGeometry = getRegistrationWatermarkGeometry(
    watermarkRecord.watermarkScale ?? watermarkRecord.watermark_scale,
  );
  drawCanonicalPdfWatermark(pdf, GState, {
    enabled: Boolean(watermarkRecord.watermarkUrl || watermarkRecord.watermark_url),
    imageUrl: visual.watermark?.dataUrl || null,
    label: canonicalText(watermarkRecord.nome, watermarkRecord.label, visual.institutionName),
    opacity: Number(watermarkRecord.watermarkOpacity ?? watermarkRecord.watermark_opacity ?? 0.1),
  }, {
    x: watermarkGeometry.x,
    y: watermarkGeometry.y,
    width: watermarkGeometry.width,
    height: watermarkGeometry.height,
    textSize: watermarkGeometry.textSize,
    rotate: watermarkRecord.watermarkRotate === false ? 0 : 35,
  });
  drawCanonicalInstitutionalHeader(pdf, visual.institutionHeader, visual.logo, {
    orientation: 'portrait',
    alias: `secretaria-logo-${visual.source.emission.polo_id}`,
  });

  if (pageIndex === 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 26, 51);
    pdf.setFontSize(16);
    const title = visual.title.toUpperCase();
    pdf.text(title, PAGE_WIDTH_MM / 2, 68, {
      align: 'center',
      baseline: 'top',
    });
    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(0.6);
    const underlineWidth = Math.min(
      PAGE_WIDTH_MM - PAGE_LEFT_MM - PAGE_RIGHT_MM,
      pdf.getTextWidth(title),
    );
    pdf.line(
      PAGE_WIDTH_MM / 2 - underlineWidth / 2,
      76,
      PAGE_WIDTH_MM / 2 + underlineWidth / 2,
      76,
    );
  }

  if (visual.source.emission.documento === 'boletim') {
    drawAcademicBulletinBody(pdf, visual, page, pageIndex);
  } else {
    drawBody(pdf, page.body, pageIndex === 0);
  }
  page.fields.forEach((field) => drawField(pdf, visual, field, pageIndex));
};

/**
 * Compositor oficial da Secretaria. Cada item preserva exatamente o número de
 * páginas e as coordenadas recebidas no snapshot; não há captura de DOM,
 * rasterização A4 nem criação de páginas no navegador por overflow.
 */
export const createEmissionDocumentsPdf = async (
  sources: readonly EmissionPdfSource[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> => {
  if (!sources.length) throw new Error('Nenhuma emissão foi selecionada para gerar o PDF.');

  const imageCache = new Map<string, Promise<CanonicalPdfImage | null>>();
  const visuals: VectorDocument[] = [];
  for (let index = 0; index < sources.length; index += 1) {
    visuals.push(await prepareVectorDocument(sources[index], imageCache));
  }

  const { jsPDF, GState } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  pdf.setProperties({
    title: sources.length > 1 ? `Documentos da Secretaria - lote com ${sources.length}` : getDocumentTitle(sources[0].emission),
    subject: 'Documento institucional oficial emitido pela Secretaria',
    author: 'Universo Cursos e Consultoria',
    creator: 'Universo Cursos e Consultoria',
  });

  let renderedPages = 0;
  visuals.forEach((visual, documentIndex) => {
    visual.pages.forEach((page, pageIndex) => {
      if (renderedPages > 0) pdf.addPage('a4', 'portrait');
      drawVectorPage(
        pdf,
        GState as unknown as PdfGStateConstructor,
        visual,
        page,
        pageIndex,
      );
      renderedPages += 1;
    });
    options.onProgress?.({ current: documentIndex + 1, total: visuals.length });
  });

  const first = sources[0].emission;
  return {
    blob: pdf.output('blob'),
    fileName: sources.length > 1
      ? `${first.documento}-lote-${sources.length}-documentos.pdf`
      : `emissao-${first.documento}-${first.codigo}.pdf`,
  };
};
