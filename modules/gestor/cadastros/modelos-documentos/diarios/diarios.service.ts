import { supabase } from '../../../../../lib/supabase';
import {
  DEFAULT_CAPA_CAMPOS,
  DEFAULT_CONTRACAPA_CAMPOS,
  DEFAULT_DIARIO_TEMPLATE,
} from './diarios-template-defaults';

export {
  DEFAULT_CAPA_CAMPOS,
  DEFAULT_CONTRACAPA_CAMPOS,
  DEFAULT_DIARIO_TEMPLATE,
} from './diarios-template-defaults';

export interface CapaCampo {
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
}

export interface DiarioTemplate {
  capaUrl: string | null;
  contracapaUrl: string | null;
  cabecalhoLogoUrl?: string | null;
  cabecalho: string;
  rodape: string;
  imprimirInstrucoes: boolean;
  orientacao: 'landscape';
  versao: number;
  capaCampos?: CapaCampo[];
  contracapaCampos?: CapaCampo[];
  imprimirValidacaoContracapa?: boolean;
  mensagemValidacao?: string;
  /** Compatibilidade legada; a largura canônica está em contracapaCampos. */
  qrCodeSize?: number;
}

export interface DiarioCurso {
  id: string;
  nome: string;
  modalidade: string;
}

const templateId = (key: string) => `diario_${key}`;
const LEGACY_SIGNATURE_FIELD_IDS = new Set([
  'signature_diretor',
  'signature_secretario',
  'contracapaDiretor',
  'contracapaSecretario',
]);
const REQUIRED_BACK_COVER_FIELD_IDS = new Set(
  DEFAULT_CONTRACAPA_CAMPOS.map((field) => field.id),
);
const DIARIO_MODALITIES = ['TECNICO', 'LIVRE', 'ESPECIALIZACAO'];
const LANDSCAPE_PAGE_WIDTH_MM = 297;
const LANDSCAPE_PAGE_HEIGHT_MM = 210;
const PDF_POINT_TO_MM = 0.3528;
const QR_LABEL_SAFE_MARGIN_MM = 1;
const SIGNATURE_SLOT_HEIGHT_PERCENT = 14;
const SUPPORTED_IMAGE_MIME_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const detectSupportedImageMimeType = (bytes: Uint8Array) => {
  if (
    bytes.length >= 8
    && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value)
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  return null;
};

const sanitizeDiarioTemplate = (
  template: Record<string, any>,
  injectEditorDefaults = true,
): DiarioTemplate => {
  const sanitized = { ...template };
  delete sanitized.diretorNome;
  delete sanitized.diretorCargo;
  delete sanitized.secretarioNome;
  delete sanitized.secretarioCargo;
  delete sanitized.diretorAssinaturaRole;
  delete sanitized.secretarioAssinaturaRole;
  delete sanitized.assinatura1Origem;
  delete sanitized.assinatura2Origem;
  const rawBackCoverFields = Array.isArray(sanitized.contracapaCampos)
    ? sanitized.contracapaCampos
    : (injectEditorDefaults ? DEFAULT_CONTRACAPA_CAMPOS : []);
  const currentBackCoverFields = rawBackCoverFields
    .filter((field: CapaCampo) => !LEGACY_SIGNATURE_FIELD_IDS.has(field.id));
  const currentBackCoverFieldsById = new Map(
    currentBackCoverFields.map((field: CapaCampo) => [field.id, field]),
  );
  sanitized.contracapaCampos = injectEditorDefaults
    ? [
      ...DEFAULT_CONTRACAPA_CAMPOS.map((field) => (
        currentBackCoverFieldsById.get(field.id) || field
      )),
      ...currentBackCoverFields.filter((field: CapaCampo) => (
        !REQUIRED_BACK_COVER_FIELD_IDS.has(field.id)
      )),
    ]
    : currentBackCoverFields;
  if (injectEditorDefaults) sanitized.imprimirValidacaoContracapa = true;
  const qrField = sanitized.contracapaCampos.find((field: CapaCampo) => (
    field.id === 'contracapaQrCode'
  ));
  if (qrField) {
    sanitized.qrCodeSize = Math.max(
      16,
      Math.min(50, Math.round((qrField.width / 100) * 297)),
    );
  }
  return sanitized as DiarioTemplate;
};

const assertVectorDiaryTemplate = (template: DiarioTemplate) => {
  if (String(template.capaUrl || '').trim()) {
    throw new Error(
      'Este modelo histórico usa uma capa de página inteira. Remova a capa raster antes de editar ou salvar; o Diário oficial aceita somente a capa vetorial configurável.',
    );
  }
  const fields = template.contracapaCampos || [];
  if (template.imprimirValidacaoContracapa !== true) {
    throw new Error('A página 2 de validação e assinaturas é obrigatória no Diário oficial.');
  }
  const unsupportedImage = fields.find((field) => (
    field.isImage && field.mixBlendMode && field.mixBlendMode !== 'normal'
  ));
  if (unsupportedImage) {
    throw new Error(
      `A imagem ${unsupportedImage.id} usa um modo de mesclagem exclusivo do navegador. Salve-a novamente como PNG transparente sem mesclagem.`,
    );
  }
  const fieldIds = new Set<string>();
  fields.forEach((field) => {
    if (!field.id || fieldIds.has(field.id)) {
      throw new Error(`O campo ${field.id || 'sem identificação'} está duplicado ou inválido na contracapa.`);
    }
    fieldIds.add(field.id);
    if (
      !Number.isFinite(field.x) || !Number.isFinite(field.y)
      || !Number.isFinite(field.width) || !Number.isFinite(field.fontSize)
      || field.x < 0 || field.y < 0 || field.width <= 0
      || field.x + field.width > 100 || field.y > 100
    ) {
      throw new Error(`O campo ${field.id} precisa caber completamente nos limites da página 2.`);
    }
    if (
      !field.isImage
      && field.id !== 'contracapaQrCode'
      && !field.id.startsWith('contracapaAssinatura')
      && field.y + (field.fontSize * PDF_POINT_TO_MM * 100 / LANDSCAPE_PAGE_HEIGHT_MM) > 100
    ) {
      throw new Error(`O campo ${field.id} ultrapassa o limite inferior da página 2.`);
    }
  });
  for (const id of REQUIRED_BACK_COVER_FIELD_IDS) {
    if (!fields.some((field) => field.id === id)) {
      throw new Error(`A contracapa está incompleta: falta o campo ${id}.`);
    }
  }
  const qrField = fields.find((field) => field.id === 'contracapaQrCode');
  const qrSizeMm = Number(qrField?.width) * LANDSCAPE_PAGE_WIDTH_MM / 100;
  const qrHeightPercent = qrSizeMm * 100 / LANDSCAPE_PAGE_HEIGHT_MM;
  const qrLabelHeightPercent = (
    (Number(qrField?.fontSize) * PDF_POINT_TO_MM + QR_LABEL_SAFE_MARGIN_MM)
    * 100 / LANDSCAPE_PAGE_HEIGHT_MM
  );
  if (
    !qrField || qrField.visible !== true
    || !Number.isFinite(qrField.x) || !Number.isFinite(qrField.y)
    || !Number.isFinite(qrField.width)
    || qrSizeMm < 20 || qrSizeMm > 70
    || qrField.x < 0 || qrField.x + qrField.width > 100
    || qrField.y < 0 || qrField.y + qrHeightPercent + qrLabelHeightPercent > 100
  ) {
    throw new Error(
      'O QR Code e seu rótulo precisam estar visíveis, medir entre 20 mm e 70 mm e caber completamente na página 2.',
    );
  }
  const signatureFields = [
    'contracapaAssinaturaProfessor',
    'contracapaAssinaturaCoordenador',
  ].map((id) => {
    const field = fields.find((candidate) => candidate.id === id);
    if (
      !field || field.visible !== true || field.width < 38 || field.width > 90
      || field.x < 0 || field.x + field.width > 100
      || field.y < 0 || field.y + SIGNATURE_SLOT_HEIGHT_PERCENT > 100
    ) {
      throw new Error(
        `O campo ${id} precisa estar visível, ter largura entre 38% e 90% e caber na área segura da página.`,
      );
    }
    return field;
  });
  const [professorSlot, coordinatorSlot] = signatureFields;
  const horizontallyOverlaps = (
    professorSlot.x < coordinatorSlot.x + coordinatorSlot.width
    && professorSlot.x + professorSlot.width > coordinatorSlot.x
  );
  const verticallyOverlaps = (
    professorSlot.y < coordinatorSlot.y + SIGNATURE_SLOT_HEIGHT_PERCENT
    && professorSlot.y + SIGNATURE_SLOT_HEIGHT_PERCENT > coordinatorSlot.y
  );
  if (horizontallyOverlaps && verticallyOverlaps) {
    throw new Error('As áreas de assinatura do Professor e do Coordenador não podem se sobrepor.');
  }
};

const resolveTemplateKey = async (cursoIdOrModality: string) => {
  if (DIARIO_MODALITIES.includes(cursoIdOrModality)) return cursoIdOrModality;
  const { data, error } = await supabase
    .from('cursos')
    .select('modalidade')
    .eq('id', cursoIdOrModality)
    .maybeSingle();
  if (error) throw error;
  const key = String(data?.modalidade || '').trim();
  if (!DIARIO_MODALITIES.includes(key)) {
    throw new Error('A modalidade do curso não possui Modelo de Diário configurável.');
  }
  return key;
};

const loadLandscapeWatermark = async (poloId: string) => {
  if (!poloId) throw new Error('O polo emissor do Diário não foi identificado.');
  const { data, error } = await supabase
    .from('documentos_templates')
    .select('conteudo')
    .eq('id', `watermark_landscape_${poloId}`)
    .maybeSingle();
  if (error) throw error;
  const landscape = data?.conteudo as Record<string, unknown> | null;
  const url = String(landscape?.url || '').trim();
  const opacity = Number(landscape?.opacity);
  const scale = Number(landscape?.scale);
  const rotate = landscape?.rotate;
  if (
    !url
    || !Number.isFinite(opacity) || opacity < 0 || opacity > 1
    || !Number.isFinite(scale) || scale < 10 || scale > 100
    || typeof rotate !== 'boolean'
  ) {
    throw new Error('A marca d’água em paisagem do Diário não está configurada corretamente.');
  }
  return { url, opacity, scale, rotate };
};

const loadTemplateContent = async (cursoIdOrModality: string) => {
  const key = await resolveTemplateKey(cursoIdOrModality);
  const { data, error } = await supabase
    .from('documentos_templates')
    .select('conteudo')
    .eq('id', templateId(key))
    .maybeSingle();
  if (error) throw error;
  return { key, content: data?.conteudo as Record<string, any> | null };
};

export const diariosService = {
  async getCursos(): Promise<DiarioCurso[]> {
    return [
      { id: 'TECNICO', nome: 'Cursos Técnicos', modalidade: 'TECNICO' },
      { id: 'LIVRE', nome: 'Cursos Livres', modalidade: 'LIVRE' },
      { id: 'ESPECIALIZACAO', nome: 'Cursos de Especialização', modalidade: 'ESPECIALIZACAO' },
    ];
  },

  async getTemplate(cursoIdOrModality: string): Promise<DiarioTemplate> {
    const { content } = await loadTemplateContent(cursoIdOrModality);
    const parsedConteudo = sanitizeDiarioTemplate(content || {});
    const template = sanitizeDiarioTemplate({
      ...DEFAULT_DIARIO_TEMPLATE,
      ...parsedConteudo,
      capaCampos: parsedConteudo.capaCampos || DEFAULT_CAPA_CAMPOS,
    });
    return template;
  },

  async getTemplateForEmission(cursoIdOrModality: string): Promise<DiarioTemplate> {
    const { key, content } = await loadTemplateContent(cursoIdOrModality);
    if (!content) {
      throw new Error(`O Modelo de Diário ${key} não foi configurado em Modelos Documentos.`);
    }
    const template = sanitizeDiarioTemplate(content, false);
    assertVectorDiaryTemplate(template);
    const coverIds = new Set((template.capaCampos || []).map((field) => field.id));
    if (
      !['curso', 'modulo', 'areaTematica', 'disciplina', 'turma', 'professor']
        .every((fieldId) => coverIds.has(fieldId))
    ) {
      throw new Error(`O Modelo de Diário ${key} está incompleto e precisa ser salvo novamente.`);
    }
    return template;
  },

  async saveTemplate(cursoIdOrModality: string, conteudo: DiarioTemplate): Promise<void> {
    const sanitized = sanitizeDiarioTemplate(
      conteudo as unknown as Record<string, any>,
    );
    assertVectorDiaryTemplate(sanitized);
    let key = cursoIdOrModality;
    if (cursoIdOrModality && !['TECNICO', 'LIVRE', 'ESPECIALIZACAO'].includes(cursoIdOrModality)) {
      const { data } = await supabase
        .from('cursos')
        .select('modalidade')
        .eq('id', cursoIdOrModality)
        .maybeSingle();
      if (data?.modalidade) {
        key = data.modalidade;
      }
    }

    const { error } = await supabase
      .from('documentos_templates')
      .upsert({
        id: templateId(key),
        conteudo: sanitized,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
  },

  async uploadImage(
    cursoId: string,
    kind: string,
    file: File,
  ): Promise<string> {
    if (kind === 'capa') {
      throw new Error(
        'Upload de capa completa foi desativado: configure os campos da capa vetorial no editor.',
      );
    }
    const canonicalExtension = SUPPORTED_IMAGE_MIME_TYPES.get(file.type.toLowerCase());
    if (!canonicalExtension) {
      throw new Error('Use uma imagem PNG, JPEG ou WEBP. SVG, GIF e outros formatos não são aceitos no PDF oficial.');
    }
    if (file.size > 12 * 1024 * 1024) {
      throw new Error('A imagem deve possuir no máximo 12 MB.');
    }
    const detectedMimeType = detectSupportedImageMimeType(
      new Uint8Array(await file.slice(0, 12).arrayBuffer()),
    );
    if (detectedMimeType !== file.type.toLowerCase()) {
      throw new Error('O conteúdo do arquivo não corresponde a uma imagem PNG, JPEG ou WEBP válida.');
    }

    const path = `templates/diarios/${cursoId}/${kind}-${Date.now()}.${canonicalExtension}`;
    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(path, file, {
        cacheControl: '31536000',
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;
    return supabase.storage.from('documentos').getPublicUrl(data.path).data.publicUrl;
  },

  async getLandscapeWatermark(poloId: string) {
    return loadLandscapeWatermark(poloId);
  },

  async getLandscapeWatermarkForEmission(poloId: string) {
    return loadLandscapeWatermark(poloId);
  },
};
