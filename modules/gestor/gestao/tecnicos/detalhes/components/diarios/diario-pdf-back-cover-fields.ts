import type { jsPDF } from 'jspdf';

import type { DiaryPdfSignatureSlot } from '../../../../../../shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts';
import {
  SIGNATURE_STAMP_COORDINATE_SCALE,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
} from '../../../../../../shared/assinatura-eletronica/signature-stamp-placement.ts';
import { moduloNumero } from './diario-print.utils.ts';
import type {
  DiarioPdfResolvedAssets,
  DiarioPdfTrustedQrAsset,
} from './diario-pdf-assets.ts';
import {
  hexToRgb,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  setTextColor,
  type DiarioPrintDocumentProps,
} from './diario-pdf-layout.ts';

const SIGNATURE_FIELDS = [
  ['PROFESSOR', 'contracapaAssinaturaProfessor'],
  ['COORDENADOR', 'contracapaAssinaturaCoordenador'],
] as const;

interface BackCoverField {
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
  borderTop: boolean;
  align: 'left' | 'center' | 'right';
  isImage: boolean;
  imageUrl: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const finite = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const rawBackCoverFields = (props: DiarioPrintDocumentProps): unknown => {
  const direct = (props.template as unknown as Record<string, unknown>).contracapaCampos;
  if (direct !== undefined) return direct;
  const source = asRecord((props as unknown as Record<string, unknown>).templateSource);
  return asRecord(source?.raw)?.contracapaCampos;
};

const parseField = (candidate: unknown, index: number): BackCoverField => {
  const raw = asRecord(candidate);
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  const x = finite(raw?.x);
  const y = finite(raw?.y);
  const width = finite(raw?.width);
  const fontSize = finite(raw?.fontSize);
  const color = typeof raw?.color === 'string' ? raw.color.trim() : '';
  const align = raw?.align ?? 'left';
  const isImage = raw?.isImage === true;
  const imageUrl = typeof raw?.imageUrl === 'string' ? raw.imageUrl.trim() : '';
  if (
    !id || id.length > 80 || x === null || y === null || width === null
    || fontSize === null || x < 0 || x > 100 || y < 0 || y > 100
    || width <= 0 || width > 100 || x + width > 100
    || fontSize < 4 || fontSize > 24 || !/^#[0-9a-f]{6}$/i.test(color)
    || typeof raw?.visible !== 'boolean' || typeof raw.bold !== 'boolean'
    || (align !== 'left' && align !== 'center' && align !== 'right')
    || (isImage && !imageUrl)
    || (isImage && raw.mixBlendMode !== undefined && raw.mixBlendMode !== 'normal')
  ) throw new Error(`O campo ${index + 1} da contracapa é inválido.`);
  return {
    id,
    label: typeof raw.label === 'string' ? raw.label : '',
    valuePlaceholder: typeof raw.valuePlaceholder === 'string' ? raw.valuePlaceholder : '',
    x, y, width, fontSize,
    visible: raw.visible,
    color,
    bold: raw.bold,
    borderTop: raw.borderTop === true,
    align,
    isImage,
    imageUrl,
  };
};

const resolveBackCoverFields = (props: DiarioPrintDocumentProps): BackCoverField[] => {
  const raw = rawBackCoverFields(props);
  if (!Array.isArray(raw)) {
    throw new Error('O modelo do Diário não possui os campos configurados da contracapa.');
  }
  const fields = raw.map(parseField);
  const ids = new Set<string>();
  fields.forEach((field) => {
    if (ids.has(field.id)) throw new Error(`O campo ${field.id} está duplicado na contracapa.`);
    ids.add(field.id);
  });
  return fields;
};

const fieldValue = (
  field: BackCoverField,
  props: DiarioPrintDocumentProps,
  validationUrl: string,
) => {
  if (field.id === 'contracapaTitulo') return '';
  if (field.id === 'contracapaCurso') return props.turma.cursoNome;
  if (field.id === 'contracapaTurma') return props.turma.nome || props.turma.codigo;
  if (field.id === 'contracapaDisciplina') return props.disciplina.nome;
  if (field.id === 'contracapaModulo') return moduloNumero(props.moduloNome);
  if (field.id === 'contracapaProfessor') return props.disciplina.professor;
  if (field.id === 'contracapaRegulamento') return props.template.mensagemValidacao;
  if (field.id === 'contracapaAutenticacao') {
    return `${props.validationCode}\n${validationUrl}`;
  }
  if (field.id.startsWith('contracapaAssinatura')) return '';
  return field.valuePlaceholder;
};

const textAnchor = (field: BackCoverField) => {
  const x = PAGE_WIDTH * field.x / 100;
  const width = PAGE_WIDTH * field.width / 100;
  if (field.align === 'center') return x + width / 2;
  if (field.align === 'right') return x + width;
  return x;
};

const drawBorder = (pdf: jsPDF, field: BackCoverField) => {
  if (!field.borderTop) return;
  const x = PAGE_WIDTH * field.x / 100;
  const y = PAGE_HEIGHT * field.y / 100;
  const width = PAGE_WIDTH * field.width / 100;
  pdf.setDrawColor(...hexToRgb(field.color));
  pdf.setLineWidth(0.25);
  pdf.line(x, y, x + width, y);
};

const drawTextField = (
  pdf: jsPDF,
  field: BackCoverField,
  value: string,
) => {
  const y = PAGE_HEIGHT * field.y / 100;
  const width = PAGE_WIDTH * field.width / 100;
  const baseline = y + field.fontSize * 0.3528;
  drawBorder(pdf, field);
  pdf.setFont('helvetica', field.bold ? 'bold' : 'normal');
  pdf.setFontSize(field.fontSize);
  setTextColor(pdf, field.color);
  const text = `${field.label}${value}`;
  const lines = pdf.splitTextToSize(text, width);
  pdf.text(lines, textAnchor(field), baseline, { align: field.align });
};

const drawQrField = (
  pdf: jsPDF,
  field: BackCoverField,
  qrCode: DiarioPdfTrustedQrAsset | null,
) => {
  if (!qrCode?.image) throw new Error('O QR Code da contracapa não foi resolvido.');
  const x = PAGE_WIDTH * field.x / 100;
  const y = PAGE_HEIGHT * field.y / 100;
  const size = PAGE_WIDTH * field.width / 100;
  if (y + size > PAGE_HEIGHT) throw new Error('O QR Code ultrapassa a contracapa.');
  drawBorder(pdf, field);
  pdf.addImage(
    qrCode.image.bytes,
    qrCode.image.format,
    x,
    y,
    size,
    size,
    'diario-validation-qr',
    'FAST',
  );
  pdf.setFont('helvetica', field.bold ? 'bold' : 'normal');
  pdf.setFontSize(field.fontSize);
  setTextColor(pdf, field.color);
  pdf.text(field.label, textAnchor(field), y + size + field.fontSize * 0.3528, {
    align: field.align,
  });
};

const drawImageFields = (
  pdf: jsPDF,
  fields: BackCoverField[],
  images: DiarioPdfResolvedAssets['backCoverImages'],
) => {
  const imageFields = fields.filter((field) => field.visible && field.isImage);
  const expectedIds = new Set(imageFields.map((field) => field.id));
  const unexpected = Object.keys(images).filter((fieldId) => !expectedIds.has(fieldId));
  if (unexpected.length) {
    throw new Error(`A contracapa recebeu recursos não declarados: ${unexpected.join(', ')}.`);
  }
  imageFields.forEach((field) => {
    const image = images[field.id];
    if (!image) throw new Error(`A imagem ${field.id} configurada não foi resolvida.`);
    const width = PAGE_WIDTH * field.width / 100;
    const properties = pdf.getImageProperties(image.bytes);
    const height = width * properties.height / properties.width;
    const x = PAGE_WIDTH * field.x / 100;
    const y = PAGE_HEIGHT * field.y / 100;
    if (y + height > PAGE_HEIGHT) throw new Error(`A imagem ${field.id} ultrapassa a contracapa.`);
    pdf.addImage(image.bytes, image.format, x, y, width, height, `diario-back-cover-${field.id}`, 'FAST');
  });
};

export const resolveBackCoverSignatureSlots = (
  props: DiarioPrintDocumentProps,
): readonly [DiaryPdfSignatureSlot, DiaryPdfSignatureSlot] => {
  const fields = resolveBackCoverFields(props);
  const slots = SIGNATURE_FIELDS.map(([role, fieldId]): DiaryPdfSignatureSlot => {
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (!field || !field.visible) throw new Error(`O campo ${fieldId} precisa estar visível.`);
    return {
      role,
      fieldId,
      pageTarget: 'DIARIO_BACK_COVER',
      coordinateSpace: 'PAGE_TOP_LEFT_BP_V1',
      xBp: Math.round(field.x * SIGNATURE_STAMP_COORDINATE_SCALE / 100),
      yBp: Math.round(field.y * SIGNATURE_STAMP_COORDINATE_SCALE / 100),
      widthBp: Math.round(field.width * SIGNATURE_STAMP_COORDINATE_SCALE / 100),
      heightBp: SIGNATURE_STAMP_MIN_HEIGHT_BP,
    };
  });
  return slots as [DiaryPdfSignatureSlot, DiaryPdfSignatureSlot];
};

export const drawConfiguredBackCoverFields = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  images: DiarioPdfResolvedAssets['backCoverImages'],
  qrCode: DiarioPdfTrustedQrAsset | null,
  validationUrl: string | null,
) => {
  if (!validationUrl) throw new Error('A URL de validação da contracapa não foi resolvida.');
  const fields = resolveBackCoverFields(props);
  fields.filter((field) => field.visible && !field.isImage).forEach((field) => {
    if (field.id === 'contracapaQrCode') drawQrField(pdf, field, qrCode);
    else drawTextField(pdf, field, fieldValue(field, props, validationUrl));
  });
  drawImageFields(pdf, fields, images);
};
