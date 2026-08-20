import {
  createDocumentValidationQrDataUrl,
} from '../../../../../../shared/document-validation/document-validation.qr';
import {
  getDocumentValidationUrl,
} from '../../../../../../shared/document-validation/document-validation.url';
import type { DiarioPrintDocumentProps } from './diario-classe.types';
import type {
  DiarioPdfAcademicSnapshot,
  DiarioPdfCoverField,
  DiarioPdfRenderableData,
} from './diario-pdf.contract';
import {
  composeDiarioPdf,
  composeDiarioPdfWithManifest,
  type BuiltDiarioPdfWithManifest,
  type DiarioPdfResolvedAssets,
} from './diario-pdf';
import {
  loadPdfImage,
  type PdfImage,
} from './diario-pdf-image';
import {
  normalizeCanonicalInstitutionalHeader,
} from '../../../../../secretaria/shared/canonical-institutional-header-pdf';

export type { BuiltDiarioPdfWithManifest } from './diario-pdf';

const loadFirstImage = async (
  sources: Array<string | null | undefined>,
  label: string,
): Promise<PdfImage> => {
  for (const source of sources) {
    const image = await loadPdfImage(source);
    if (image) return image;
  }
  throw new Error(`${label} do Diário não pôde ser carregada.`);
};

const resolveBrowserAssets = async (
  props: DiarioPdfRenderableData,
): Promise<DiarioPdfResolvedAssets> => {
  const isBlank = props.exportMode === 'EM_BRANCO';
  const validationCode = props.validationCode?.trim() || '';
  const shouldRenderValidation = Boolean(
    !isBlank
    && props.template.imprimirValidacaoContracapa
    && validationCode,
  );
  const validationUrl = shouldRenderValidation
    ? getDocumentValidationUrl(validationCode)
    : null;
  const [logo, watermark, qrCodeImage] = await Promise.all([
    loadFirstImage(
      [props.institutionalIdentity.logoUrl, props.template.cabecalhoLogoUrl, '/LogoUniverso.png'],
      'O logo',
    ),
    loadPdfImage(props.institutionalIdentity.watermarkUrl),
    shouldRenderValidation
      ? createDocumentValidationQrDataUrl(validationCode, { size: 240 })
        .then((dataUrl) => loadPdfImage(dataUrl))
      : Promise.resolve(null),
  ]);

  if (shouldRenderValidation && !qrCodeImage) {
    throw new Error('Não foi possível carregar o QR Code obrigatório do Diário.');
  }

  const parsedValidationUrl = validationUrl ? new URL(validationUrl) : null;

  return {
    logo,
    watermark,
    qrCode: qrCodeImage && validationUrl
      ? {
          image: qrCodeImage,
          payload: validationUrl,
          generatedBy: 'TRUSTED_ADAPTER',
        }
      : null,
    validationEndpoint: parsedValidationUrl
      ? {
          origin: parsedValidationUrl.origin,
          pathname: parsedValidationUrl.pathname,
          generatedBy: 'TRUSTED_ADAPTER',
        }
      : null,
    validationUrl,
    institution: props.institutionalIdentity.institution,
  };
};

const COVER_FIELD_IDS = new Set([
  'curso',
  'modulo',
  'areaTematica',
  'disciplina',
  'turma',
  'professor',
]);

/**
 * Compatibilidade do editor web atual. Esta conversão não produz manifesto
 * assinável; ela apenas mantém prévia/download legado no mesmo core vetorial.
 */
const normalizeBrowserRenderableData = (
  props: DiarioPrintDocumentProps,
): DiarioPdfRenderableData => {
  if (!props.activeInstruments || !props.exportMode) {
    throw new Error('O Diário não possui instrumentos e modo de exportação completos.');
  }
  const institution = normalizeCanonicalInstitutionalHeader(
    (props.turma?.institutionalIdentity?.institution
      || props.turma?.polo
      || props.turma) as Record<string, unknown>,
  );
  const logoUrl = String(
    props.turma?.institutionalIdentity?.logoUrl
      || props.template.cabecalhoLogoUrl
      || '/LogoUniverso.png',
  );
  const watermarkUrl = props.watermark?.url
    ? String(props.watermark.url)
    : null;
  const capaCampos = (props.template.capaCampos || [])
    .filter((field) => COVER_FIELD_IDS.has(field.id))
    .map((field) => ({
      id: field.id,
      label: String(field.label || ''),
      x: Number(field.x),
      y: Number(field.y),
      width: Number(field.width),
      fontSize: Number(field.fontSize),
      visible: field.visible === true,
      color: String(field.color || '#071a33'),
      bold: field.bold === true,
      ...(field.borderTop === undefined ? {} : { borderTop: field.borderTop }),
      ...(field.align === undefined ? {} : { align: field.align }),
    })) as DiarioPdfCoverField[];

  return {
    template: {
      capaUrl: props.template.capaUrl,
      contracapaUrl: props.template.contracapaUrl,
      cabecalhoLogoUrl: props.template.cabecalhoLogoUrl || null,
      rodape: props.template.rodape,
      imprimirInstrucoes: props.template.imprimirInstrucoes,
      capaCampos,
      imprimirValidacaoContracapa: props.template.imprimirValidacaoContracapa === true,
      mensagemValidacao: String(props.template.mensagemValidacao || ''),
      qrCodeSize: Number(props.template.qrCodeSize || 28),
    },
    turma: {
      id: String(props.turma?.id || ''),
      cursoNome: String(props.turma?.cursoNome || ''),
      nome: String(props.turma?.nome || ''),
      codigo: String(props.turma?.codigo || ''),
    },
    disciplina: {
      id: String(props.disciplina?.id || ''),
      nome: String(props.disciplina?.nome || ''),
      professor: String(props.disciplina?.professor || ''),
      cargaHoraria: Number(props.disciplina?.cargaHoraria),
    },
    moduloNome: props.moduloNome,
    students: props.students.map(({ id, nome, matricula }) => ({ id, nome, matricula })),
    aulas: props.aulas.map((aula) => {
      const dataSource = String(aula.dataAula || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataSource)) {
        throw new Error(`A aula ${aula.id} não possui data acadêmica canônica.`);
      }
      return {
        id: aula.id,
        titulo: aula.titulo,
        cargaHoraria: aula.cargaHoraria,
        dataSource,
        sessoes: aula.sessoes.map(({ id, periodo, cargaHoraria }) => ({
          id,
          periodo,
          cargaHoraria,
        })),
      };
    }),
    attendanceMap: props.attendanceMap,
    gradesMap: props.gradesMap,
    praticasMap: props.praticasMap,
    observacoes: props.observacoes,
    activeInstruments: props.activeInstruments,
    exportMode: props.exportMode,
    validationCode: props.validationCode || null,
    validationPreview: props.validationPreview === true,
    institutionalIdentity: {
      institution,
      logoUrl,
      watermarkUrl,
    },
  };
};

export const buildDiarioPdfWithManifest = async (
  props: DiarioPdfAcademicSnapshot,
): Promise<BuiltDiarioPdfWithManifest> => {
  const assets = await resolveBrowserAssets(props);
  return composeDiarioPdfWithManifest(props, assets);
};

export const buildDiarioPdf = async (props: DiarioPrintDocumentProps) => {
  const renderable = normalizeBrowserRenderableData(props);
  const assets = await resolveBrowserAssets(renderable);
  return composeDiarioPdf(renderable, assets);
};
