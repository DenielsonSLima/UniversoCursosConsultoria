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
import { poloInstitutionalService } from '../../../../../../shared/polo-institutional/polo-institutional.service';
import type { PoloInstitutionalData } from '../../../../../../shared/polo-institutional/polo-institutional.types';

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

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const getConfiguredBackCoverFields = (props: DiarioPdfRenderableData) => {
  const direct = (props.template as BrowserRenderableTemplate).contracapaCampos;
  if (Array.isArray(direct)) return direct;
  const source = asRecord((props as unknown as Record<string, unknown>).templateSource);
  const raw = asRecord(source?.raw);
  return Array.isArray(raw?.contracapaCampos)
    ? raw.contracapaCampos as BrowserBackCoverField[]
    : [];
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
  const backCoverImageFields = getConfiguredBackCoverFields(props).filter((field) => (
    field.visible === true && field.isImage === true
  ));
  const [
    logo,
    watermark,
    coverBackground,
    backCoverBackground,
    backCoverImageEntries,
    qrCodeImage,
  ] = await Promise.all([
    loadFirstImage(
      [props.institutionalIdentity.logoUrl, props.template.cabecalhoLogoUrl],
      'O logo',
    ),
    loadPdfImage(props.institutionalIdentity.watermarkUrl),
    props.template.capaUrl
      ? loadFirstImage([props.template.capaUrl], 'A capa configurada')
      : Promise.resolve(null),
    props.template.contracapaUrl
      ? loadFirstImage([props.template.contracapaUrl], 'A arte decorativa da contracapa')
      : Promise.resolve(null),
    Promise.all(backCoverImageFields.map(async (field) => {
      const fieldId = String(field.id || '').trim();
      const imageUrl = String(field.imageUrl || '').trim();
      if (!fieldId || !imageUrl) {
        throw new Error('Uma imagem visível da contracapa está sem identificação ou URL.');
      }
      return [
        fieldId,
        await loadFirstImage([imageUrl], `A imagem ${fieldId} da contracapa`),
      ] as const;
    })),
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
    coverBackground,
    backCoverBackground,
    backCoverImages: Object.fromEntries(backCoverImageEntries),
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

type BrowserDiarioInstitutionalSource = PoloInstitutionalData & Record<string, unknown>;
type BrowserBackCoverField = {
  id: string;
  label: string;
  valuePlaceholder: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  visible: boolean;
  color: string;
  bold: boolean;
  borderTop?: boolean;
  align?: 'left' | 'center' | 'right';
  isImage?: boolean;
  imageUrl?: string;
  mixBlendMode?: 'normal' | 'multiply' | 'screen';
};
type BrowserRenderableTemplate = DiarioPdfRenderableData['template'] & {
  contracapaCampos: BrowserBackCoverField[];
};

const resolveBrowserInstitutionalSource = async (
  props: DiarioPrintDocumentProps,
): Promise<BrowserDiarioInstitutionalSource> => {
  const poloId = String(props.turma?.poloId || '').trim();
  if (!poloId) {
    throw new Error('O polo emissor do Diário não foi identificado.');
  }

  try {
    const data = await poloInstitutionalService.getByPoloId(poloId);
    if (!data) {
      throw new Error('A identidade institucional do polo emissor não foi encontrada.');
    }
    return data as BrowserDiarioInstitutionalSource;
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'A identidade institucional do polo emissor não foi encontrada.'
    ) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : 'erro desconhecido';
    throw new Error(
      `Não foi possível carregar a identidade institucional do Diário: ${detail}`,
      { cause: error },
    );
  }
};

/**
 * Compatibilidade do editor web atual. Esta conversão não produz manifesto
 * assinável; ela apenas mantém prévia/download legado no mesmo core vetorial.
 */
const normalizeBrowserRenderableData = (
  props: DiarioPrintDocumentProps,
  institutionalSource: BrowserDiarioInstitutionalSource,
): DiarioPdfRenderableData => {
  if (!props.activeInstruments || !props.exportMode) {
    throw new Error('O Diário não possui instrumentos e modo de exportação completos.');
  }
  const institution = normalizeCanonicalInstitutionalHeader(
    institutionalSource,
  );
  const logoUrl = String(
    props.turma?.institutionalIdentity?.logoUrl
      || institutionalSource.logo_url
      || props.template.cabecalhoLogoUrl
      || '',
  ).trim();
  if (!logoUrl) {
    throw new Error('O logo institucional do Diário não foi configurado.');
  }
  const watermarkUrl = String(props.watermark?.url || '').trim();
  if (!watermarkUrl) {
    throw new Error('A marca d’água em paisagem do Diário não foi configurada.');
  }
  const watermarkOpacity = Number(props.watermark?.opacity);
  const watermarkScale = Number(props.watermark?.scale);
  const watermarkRotate = props.watermark?.rotate;
  if (
    !Number.isFinite(watermarkOpacity)
    || !Number.isFinite(watermarkScale)
    || typeof watermarkRotate !== 'boolean'
  ) {
    throw new Error('A apresentação da marca d’água do Diário está incompleta.');
  }
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
  const contracapaCampos = (props.template.contracapaCampos || []).map((field) => ({
    id: String(field.id || ''),
    label: String(field.label || ''),
    valuePlaceholder: String(field.valuePlaceholder || ''),
    x: Number(field.x),
    y: Number(field.y),
    width: Number(field.width),
    fontSize: Number(field.fontSize),
    visible: field.visible === true,
    color: String(field.color || '#071a33'),
    bold: field.bold === true,
    ...(field.borderTop === undefined ? {} : { borderTop: field.borderTop }),
    ...(field.align === undefined ? {} : { align: field.align }),
    ...(field.isImage === undefined ? {} : { isImage: field.isImage }),
    ...(field.imageUrl === undefined ? {} : { imageUrl: String(field.imageUrl) }),
    ...(field.mixBlendMode === undefined ? {} : { mixBlendMode: field.mixBlendMode }),
  })) as BrowserBackCoverField[];
  const template: BrowserRenderableTemplate = {
    capaUrl: props.template.capaUrl,
    contracapaUrl: props.template.contracapaUrl,
    cabecalhoLogoUrl: props.template.cabecalhoLogoUrl || null,
    rodape: props.template.rodape,
    imprimirInstrucoes: props.template.imprimirInstrucoes,
    capaCampos,
    contracapaCampos,
    imprimirValidacaoContracapa: props.template.imprimirValidacaoContracapa === true,
    mensagemValidacao: String(props.template.mensagemValidacao || ''),
    qrCodeSize: Number(props.template.qrCodeSize || 28),
  };

  return {
    template,
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
      watermark: {
        url: watermarkUrl,
        opacity: watermarkOpacity,
        scale: watermarkScale,
        rotate: watermarkRotate,
      },
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
  const institutionalSource = await resolveBrowserInstitutionalSource(props);
  const renderable = normalizeBrowserRenderableData(props, institutionalSource);
  const assets = await resolveBrowserAssets(renderable);
  return composeDiarioPdf(renderable, assets);
};
