export type CrachaTemplateVariant = 'estagio' | 'preceptor';

export const PRECEPTOR_CRACHA_LAYOUT_VERSION = 'CR80_VERTICAL_V1';

export interface CrachaTemplateFieldStyle {
  color?: string;
  fontSize?: string;
  fontStyle?: 'normal' | 'italic';
  fontWeight?: 'normal' | 'bold';
  lineHeight?: string;
  mixBlendMode?: 'multiply' | 'normal';
  objectFit?: 'contain' | 'cover';
  textAlign?: 'left' | 'center' | 'right';
  zIndex?: number;
}

export interface CrachaTemplateField {
  id: string;
  type: 'foto' | 'image' | 'qrcode' | 'text';
  value: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  page?: 'frente' | 'verso';
  style?: CrachaTemplateFieldStyle;
}

export interface CrachaTemplateModel {
  id?: string;
  layoutVersion?: string;
  nome?: string;
  nomeModelo?: string;
  cargoPadrao?: string;
  status?: string;
  startNumber?: number;
  hasVerso?: boolean;
  corPrimaria?: string;
  corSecundaria?: string;
  textoFrente?: string;
  textoVerso?: string;
  bgFrenteUrl?: string;
  bgVersoUrl?: string;
  ocultarDesignPadrao?: boolean;
  corTexto?: string;
  tamanhoFonteNome?: number;
  tamanhoFonteDados?: number;
  fotoWidth?: number;
  fotoHeight?: number;
  fields?: CrachaTemplateField[];
  qr?: Record<string, unknown>;
  tituloFrente?: string;
  subtituloFrente?: string;
  mensagemVerso?: string;
  rodape?: string;
  mostrarFoto?: boolean;
  mostrarPolo?: boolean;
  marcaDaguaHabilitada?: boolean;
  [key: string]: unknown;
}

const DEFAULT_STAGE_BACK_TEXT = 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.';

const DEFAULT_PRECEPTOR_BACK_TEXT = 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal e intransferível, destinado ao professor ou preceptor autorizado.\n2. Mantenha-o sempre visível nas atividades institucionais.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.';

const defaultPositions: Record<string, { x: number; y: number }> = {
  foto: { x: 27.5, y: 14 },
  nome: { x: 3.7, y: 47 },
  cargo: { x: 3.7, y: 53 },
  matricula: { x: 5.5, y: 60 },
  cpf: { x: 5.5, y: 66.2 },
  curso: { x: 5.5, y: 72.4 },
  qrcode: { x: 62, y: 60 },
};

const STAGE_FRONT_INFO_FIELD_VALUES: Record<string, string> = {
  matricula: 'MATRÍCULA\n{{ALUNO_MATRICULA}}',
  cpf: 'CPF\n{{ALUNO_CPF}}',
  curso: 'CURSO\n{{ALUNO_CURSO}}',
};

const PRECEPTOR_FRONT_INFO_FIELD_VALUES: Record<string, string> = {
  registro: 'REGISTRO\n{{PRECEPTOR_REGISTRO}}',
  area: 'ÁREA\n{{PRECEPTOR_AREA}}',
  polo: 'POLO\n{{POLO_NOME}}',
};

const STAGE_VARIABLES = [
  '{{ALUNO_NOME}}',
  '{{ALUNO_MATRICULA}}',
  '{{ALUNO_CPF}}',
  '{{ALUNO_CURSO}}',
  '{{POLO_NOME}}',
  '{{DATA_HOJE}}',
  '{{DATA_VALIDADE}}',
];

const PRECEPTOR_VARIABLES = [
  '{{PRECEPTOR_NOME}}',
  '{{PRECEPTOR_CARGO}}',
  '{{PRECEPTOR_AREA}}',
  '{{PRECEPTOR_REGISTRO}}',
  '{{POLO_NOME}}',
  '{{DATA_HOJE}}',
  '{{DATA_VALIDADE}}',
  '{{VALIDACAO_CODIGO}}',
];

const PRECEPTOR_TOKEN_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\{\{ALUNO_FOTO\}\}/g, ''],
  [/\{\{ALUNO_NOME\}\}/g, '{{PRECEPTOR_NOME}}'],
  [/\{\{ALUNO_MATRICULA\}\}/g, '{{PRECEPTOR_REGISTRO}}'],
  [/\{\{ALUNO_CPF\}\}/g, '{{PRECEPTOR_AREA}}'],
  [/\{\{ALUNO_CURSO\}\}/g, '{{POLO_NOME}}'],
];

const SAFE_STAGE_STATIC_FIELD_IDS = new Set([
  'instrucoes',
  'verso_url_validador',
  'admissao_label',
  'emissao_label',
  'validade_label',
  'assinatura_linha',
  'assinatura_cargo',
  'assinatura_instituicao',
]);

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const asText = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value : fallback
);

const asNumber = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const asBoolean = (value: unknown, fallback: boolean) => (
  typeof value === 'boolean' ? value : fallback
);

const normalizeField = (value: unknown): CrachaTemplateField | null => {
  const field = asRecord(value);
  const type = field.type;
  if (
    typeof field.id !== 'string'
    || !['foto', 'image', 'qrcode', 'text'].includes(String(type))
  ) return null;

  return {
    id: field.id,
    type: type as CrachaTemplateField['type'],
    value: typeof field.value === 'string' ? field.value : '',
    x: asNumber(field.x, 0),
    y: asNumber(field.y, 0),
    width: field.width === undefined ? undefined : asNumber(field.width, 30),
    height: field.height === undefined ? undefined : asNumber(field.height, 15),
    page: field.page === 'verso' ? 'verso' : 'frente',
    style: asRecord(field.style) as CrachaTemplateFieldStyle,
  };
};

const cloneFields = (fields: unknown): CrachaTemplateField[] | undefined => {
  if (!Array.isArray(fields)) return undefined;
  return fields.map(normalizeField).filter((field): field is CrachaTemplateField => Boolean(field));
};

const getDefaultBackText = (variant: CrachaTemplateVariant) => (
  variant === 'preceptor' ? DEFAULT_PRECEPTOR_BACK_TEXT : DEFAULT_STAGE_BACK_TEXT
);

const createDefaultModel = (variant: CrachaTemplateVariant): CrachaTemplateModel => ({
  id: variant === 'preceptor' ? 'carteirinha_preceptor' : 'cracha',
  ...(variant === 'preceptor' ? { layoutVersion: PRECEPTOR_CRACHA_LAYOUT_VERSION } : {}),
  nome: variant === 'preceptor' ? 'Crachá de Preceptor' : 'Crachá de Estágio',
  nomeModelo: variant === 'preceptor' ? 'Crachá de Preceptor' : undefined,
  cargoPadrao: variant === 'preceptor' ? 'PRECEPTOR(A)' : 'ESTAGIÁRIO',
  startNumber: 1000,
  hasVerso: true,
  corPrimaria: '#0f172a',
  corSecundaria: '#10b981',
  textoFrente: variant === 'preceptor' ? 'PRECEPTOR(A)' : 'ESTAGIÁRIO',
  textoVerso: getDefaultBackText(variant),
  bgFrenteUrl: '',
  bgVersoUrl: '',
  ocultarDesignPadrao: false,
  corTexto: '#1e293b',
  tamanhoFonteNome: 8.5,
  tamanhoFonteDados: 6.8,
  fotoWidth: 45,
  fotoHeight: 28.5,
  ...(variant === 'preceptor' ? {
    tituloFrente: 'PRECEPTOR(A)',
    subtituloFrente: 'UNIVERSO CURSOS E CONSULTORIA',
    mensagemVerso: DEFAULT_PRECEPTOR_BACK_TEXT,
    rodape: 'Documento institucional · valide pelo QR Code',
    mostrarFoto: true,
    mostrarPolo: true,
    marcaDaguaHabilitada: true,
    qr: {
      habilitado: true,
      rotulo: 'Validar credencial',
      caminhoValidacao: '/validar-documento',
      modoValidade: 'POR_DIAS',
      diasValidade: 365,
    },
  } : {}),
});

const createBackFields = (variant: CrachaTemplateVariant, backText?: string): CrachaTemplateField[] => {
  if (variant === 'preceptor') {
    return [
      { id: 'verso_qrcode', type: 'qrcode', value: 'QR_VALIDADOR_CRACHA', x: 27, y: 10, width: 46, height: 26, page: 'verso' },
      { id: 'verso_nome', type: 'text', value: 'NOME: {{PRECEPTOR_NOME}}', x: 3.7, y: 38, width: 92.6, page: 'verso', style: { fontSize: '6px', fontWeight: 'bold', color: '#1e293b', textAlign: 'center' } },
      { id: 'verso_registro', type: 'text', value: 'REGISTRO: {{PRECEPTOR_REGISTRO}}', x: 3.7, y: 43, width: 92.6, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' } },
      { id: 'verso_area', type: 'text', value: 'ÁREA: {{PRECEPTOR_AREA}}', x: 3.7, y: 47, width: 92.6, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' } },
      { id: 'verso_polo', type: 'text', value: 'POLO: {{POLO_NOME}}', x: 3.7, y: 51, width: 92.6, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' } },
      { id: 'verso_url_validador', type: 'text', value: 'www.universocc.com.br/validador', x: 3.7, y: 55.5, width: 92.6, page: 'verso', style: { fontSize: '4.5px', fontWeight: 'bold', color: '#dc2626', textAlign: 'center' } },
      { id: 'instrucoes', type: 'text', value: backText || DEFAULT_PRECEPTOR_BACK_TEXT, x: 5, y: 60, width: 90, page: 'verso', style: { fontSize: '4.2px', fontWeight: 'normal', color: '#64748b', textAlign: 'left' } },
      { id: 'emissao_label', type: 'text', value: 'EMISSÃO', x: 5, y: 86, page: 'verso', style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' } },
      { id: 'emissao_valor', type: 'text', value: '{{DATA_HOJE}}', x: 5, y: 89, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' } },
      { id: 'validade_label', type: 'text', value: 'VALIDADE', x: 55, y: 86, page: 'verso', style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' } },
      { id: 'validade_valor', type: 'text', value: '{{DATA_VALIDADE}}', x: 55, y: 89, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' } },
    ];
  }

  return [
    { id: 'verso_qrcode', type: 'qrcode', value: 'QR_VALIDADOR_CRACHA', x: 27, y: 10, width: 46, height: 26, page: 'verso' },
    { id: 'verso_nome', type: 'text', value: '{{ALUNO_NOME}}', x: 3.7, y: 38, width: 92.6, page: 'verso', style: { fontSize: '6px', fontWeight: 'bold', color: '#1e293b', textAlign: 'center' } },
    { id: 'verso_matricula', type: 'text', value: 'MATRÍCULA: {{ALUNO_MATRICULA}}', x: 3.7, y: 43, width: 92.6, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' } },
    { id: 'verso_cpf', type: 'text', value: 'CPF: {{ALUNO_CPF}}', x: 3.7, y: 47, width: 92.6, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' } },
    { id: 'verso_curso', type: 'text', value: 'CURSO: {{ALUNO_CURSO}}', x: 3.7, y: 51, width: 92.6, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' } },
    { id: 'verso_url_validador', type: 'text', value: 'www.universocc.com.br/validador', x: 3.7, y: 55.5, width: 92.6, page: 'verso', style: { fontSize: '4.5px', fontWeight: 'bold', color: '#dc2626', textAlign: 'center' } },
    { id: 'instrucoes', type: 'text', value: backText || DEFAULT_STAGE_BACK_TEXT, x: 5, y: 60, width: 90, page: 'verso', style: { fontSize: '4.2px', fontWeight: 'normal', color: '#64748b', textAlign: 'left' } },
    { id: 'emissao_label', type: 'text', value: 'EMISSÃO', x: 5, y: 86, page: 'verso', style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' } },
    { id: 'emissao_valor', type: 'text', value: '{{DATA_HOJE}}', x: 5, y: 89, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' } },
    { id: 'validade_label', type: 'text', value: 'VALIDADE', x: 55, y: 86, page: 'verso', style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' } },
    { id: 'validade_valor', type: 'text', value: '{{DATA_VALIDADE}}', x: 55, y: 89, page: 'verso', style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' } },
  ];
};

const createFrontFields = (
  model: CrachaTemplateModel,
  variant: CrachaTemplateVariant,
): CrachaTemplateField[] => {
  const positions = asRecord(model.posicoes);
  const position = (id: string) => asRecord(positions[id]);
  const dataFontSize = `${asNumber(model.tamanhoFonteDados, 6.8)}px`;
  const dataStyle = {
    fontSize: dataFontSize,
    lineHeight: '1.12',
    fontWeight: 'bold' as const,
    color: asText(model.corTexto, '#1e293b'),
  };
  const field = (id: string, fallback: { x: number; y: number }) => ({
    x: asNumber(position(id).x, fallback.x),
    y: asNumber(position(id).y, fallback.y),
  });

  if (variant === 'preceptor') {
    return [
      { id: 'foto', type: 'foto', value: '', ...field('foto', defaultPositions.foto), width: asNumber(model.fotoWidth, 45), height: asNumber(model.fotoHeight, 28.5), page: 'frente' },
      { id: 'nome', type: 'text', value: '{{PRECEPTOR_NOME}}', ...field('nome', defaultPositions.nome), page: 'frente', style: { fontWeight: 'bold', fontSize: `${asNumber(model.tamanhoFonteNome, 8.5)}px`, textAlign: 'center', color: asText(model.corTexto, '#1e293b') } },
      { id: 'cargo', type: 'text', value: '{{PRECEPTOR_CARGO}}', ...field('cargo', defaultPositions.cargo), page: 'frente', style: { fontWeight: 'bold', fontSize: `${asNumber(model.tamanhoFonteDados, 7.5)}px`, textAlign: 'center', color: asText(model.corSecundaria, '#10b981') } },
      { id: 'registro', type: 'text', value: PRECEPTOR_FRONT_INFO_FIELD_VALUES.registro, ...field('registro', defaultPositions.matricula), page: 'frente', style: dataStyle },
      { id: 'area', type: 'text', value: PRECEPTOR_FRONT_INFO_FIELD_VALUES.area, ...field('area', defaultPositions.cpf), page: 'frente', style: dataStyle },
      { id: 'polo', type: 'text', value: PRECEPTOR_FRONT_INFO_FIELD_VALUES.polo, ...field('polo', defaultPositions.curso), page: 'frente', style: dataStyle },
      { id: 'qrcode', type: 'qrcode', value: 'QR_VALIDADOR_CRACHA', ...field('qrcode', defaultPositions.qrcode), width: 22, height: 14, page: 'frente' },
    ];
  }

  return [
    { id: 'foto', type: 'foto', value: '{{ALUNO_FOTO}}', ...field('foto', defaultPositions.foto), width: asNumber(model.fotoWidth, 45), height: asNumber(model.fotoHeight, 28.5), page: 'frente' },
    { id: 'nome', type: 'text', value: '{{ALUNO_NOME}}', ...field('nome', defaultPositions.nome), page: 'frente', style: { fontWeight: 'bold', fontSize: `${asNumber(model.tamanhoFonteNome, 8.5)}px`, textAlign: 'center', color: asText(model.corTexto, '#1e293b') } },
    { id: 'cargo', type: 'text', value: asText(model.textoFrente, asText(model.cargoPadrao, 'ESTAGIÁRIO')), ...field('cargo', defaultPositions.cargo), page: 'frente', style: { fontWeight: 'bold', fontSize: `${asNumber(model.tamanhoFonteDados, 7.5)}px`, textAlign: 'center', color: asText(model.corSecundaria, '#10b981') } },
    { id: 'matricula', type: 'text', value: STAGE_FRONT_INFO_FIELD_VALUES.matricula, ...field('matricula', defaultPositions.matricula), page: 'frente', style: dataStyle },
    { id: 'cpf', type: 'text', value: STAGE_FRONT_INFO_FIELD_VALUES.cpf, ...field('cpf', defaultPositions.cpf), page: 'frente', style: dataStyle },
    { id: 'curso', type: 'text', value: STAGE_FRONT_INFO_FIELD_VALUES.curso, ...field('curso', defaultPositions.curso), page: 'frente', style: dataStyle },
    { id: 'qrcode', type: 'qrcode', value: 'QR_VALIDADOR_CRACHA', ...field('qrcode', defaultPositions.qrcode), width: 22, height: 14, page: 'frente' },
  ];
};

const normalizeStageFrontInfoField = (field: CrachaTemplateField) => {
  const normalizedId = field.id === 'polo' ? 'curso' : field.id;
  const normalizedValue = STAGE_FRONT_INFO_FIELD_VALUES[normalizedId];
  if (!normalizedValue) return field;

  return {
    ...field,
    id: normalizedId,
    value: normalizedValue,
    style: {
      ...(field.style || {}),
      lineHeight: field.style?.lineHeight || '1.12',
      fontWeight: field.style?.fontWeight || 'bold',
    },
  };
};

const sanitizePreceptorText = (value: string) => {
  const migrated = PRECEPTOR_TOKEN_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
  // O editor aceita texto livre, mas nenhum marcador fora da allowlist chega
  // à prévia ou ao snapshot do preceptor.
  return migrated.replace(
    /\{\{(?!(?:PRECEPTOR_NOME|PRECEPTOR_CARGO|PRECEPTOR_AREA|PRECEPTOR_REGISTRO|POLO_NOME|DATA_HOJE|DATA_VALIDADE|VALIDACAO_CODIGO)\}\})[^}]+}}/g,
    '',
  );
};

const sanitizePreceptorFields = (fields: CrachaTemplateField[]) => fields.map((field) => {
  if (field.type === 'foto') return { ...field, value: '' };
  if (field.type === 'qrcode') return { ...field, value: 'QR_VALIDADOR_CRACHA' };
  // O cargo padrão é a configuração editável do modelo. Mantê-lo como token
  // evita que um texto herdado do crachá de estágio vença a configuração
  // atual na prévia ou no PDF emitido.
  if (field.type === 'text' && field.id === 'cargo') {
    return { ...field, value: '{{PRECEPTOR_CARGO}}' };
  }
  if (field.type === 'text') return { ...field, value: sanitizePreceptorText(field.value) };
  return field;
});

export const getCrachaTemplateVariables = (variant: CrachaTemplateVariant) => (
  variant === 'preceptor' ? PRECEPTOR_VARIABLES : STAGE_VARIABLES
);

export const getCrachaTemplateLabel = (variant: CrachaTemplateVariant) => (
  variant === 'preceptor' ? 'Crachá de Preceptor' : 'Crachá de Estágio'
);

export const getCrachaUploadExtension = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && ['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

export const resolveCrachaFields = (
  model: CrachaTemplateModel | Record<string, unknown>,
  variant: CrachaTemplateVariant = 'estagio',
) => {
  const normalizedModel = model as CrachaTemplateModel;
  const persistedFields = cloneFields(normalizedModel.fields);
  if (persistedFields) {
    return variant === 'estagio'
      ? persistedFields.map(normalizeStageFrontInfoField)
      : sanitizePreceptorFields(persistedFields);
  }

  return [
    ...createFrontFields(normalizedModel, variant),
    ...createBackFields(variant, asText(normalizedModel.textoVerso, getDefaultBackText(variant))),
  ];
};

export const initializeCrachaModel = (
  modelo: CrachaTemplateModel | Record<string, unknown> | null | undefined,
  variant: CrachaTemplateVariant = 'estagio',
) => {
  const source = asRecord(modelo);
  const defaults = createDefaultModel(variant);
  const model: CrachaTemplateModel = {
    ...defaults,
    ...source,
    id: variant === 'preceptor' ? 'carteirinha_preceptor' : 'cracha',
    nome: asText(source.nome, asText(source.nomeModelo, String(defaults.nome))),
    cargoPadrao: asText(source.cargoPadrao, String(defaults.cargoPadrao)),
    textoFrente: asText(source.textoFrente, String(defaults.textoFrente)),
    textoVerso: asText(source.textoVerso, asText(source.mensagemVerso, String(defaults.textoVerso))),
    hasVerso: asBoolean(source.hasVerso, true),
    ...(variant === 'preceptor' ? { layoutVersion: PRECEPTOR_CRACHA_LAYOUT_VERSION } : {}),
  };

  return {
    ...model,
    fields: resolveCrachaFields(model, variant),
  };
};

const replaceStageTokensForPreceptor = (value: string) => sanitizePreceptorText(value)
  .replace(/ESTAGIÁRIO/gi, 'PRECEPTOR(A)');

const preceptorFieldValueFromStudentField = (field: CrachaTemplateField, fallbackBackText: string) => {
  const values: Record<string, string> = {
    foto: '',
    nome: '{{PRECEPTOR_NOME}}',
    cargo: '{{PRECEPTOR_CARGO}}',
    matricula: PRECEPTOR_FRONT_INFO_FIELD_VALUES.registro,
    cpf: PRECEPTOR_FRONT_INFO_FIELD_VALUES.area,
    curso: PRECEPTOR_FRONT_INFO_FIELD_VALUES.polo,
    verso_nome: 'NOME: {{PRECEPTOR_NOME}}',
    verso_matricula: 'REGISTRO: {{PRECEPTOR_REGISTRO}}',
    verso_cpf: 'ÁREA: {{PRECEPTOR_AREA}}',
    verso_curso: 'POLO: {{POLO_NOME}}',
    instrucoes: fallbackBackText,
  };
  if (values[field.id] !== undefined) return values[field.id];
  if (field.type === 'qrcode') return 'QR_VALIDADOR_CRACHA';
  if (field.type === 'foto') return '';
  if (field.type === 'text' && SAFE_STAGE_STATIC_FIELD_IDS.has(field.id)) {
    return replaceStageTokensForPreceptor(field.value);
  }
  // Mantém a geometria e o estilo do modelo de estágio, mas não herda texto
  // livre potencialmente pessoal (por exemplo, nome de aluno de uma arte).
  return field.type === 'text' ? '' : field.value;
};

const convertStageModelToPreceptor = (
  stageModel: CrachaTemplateModel | Record<string, unknown> | null | undefined,
  legacyModel: Record<string, unknown>,
) => {
  const stage = initializeCrachaModel(stageModel, 'estagio');
  const legacyMessage = asText(legacyModel.textoVerso, asText(legacyModel.mensagemVerso, DEFAULT_PRECEPTOR_BACK_TEXT));
  const fields = sanitizePreceptorFields(stage.fields.map((field) => ({
    ...field,
    value: preceptorFieldValueFromStudentField(field, legacyMessage),
  })));
  const legacyQr = asRecord(legacyModel.qr);
  const stageQr = asRecord(stage.qr);
  const legacyName = asText(legacyModel.nome, asText(legacyModel.nomeModelo));
  const hasExplicitCustomName = legacyName && !/carteirinha\s+de\s+preceptor/i.test(legacyName);

  return {
    ...stage,
    ...legacyModel,
    id: 'carteirinha_preceptor',
    layoutVersion: PRECEPTOR_CRACHA_LAYOUT_VERSION,
    nome: hasExplicitCustomName ? legacyName : 'Crachá de Preceptor',
    nomeModelo: hasExplicitCustomName ? legacyName : 'Crachá de Preceptor',
    cargoPadrao: asText(legacyModel.cargoPadrao, 'PRECEPTOR(A)'),
    textoFrente: asText(legacyModel.textoFrente, 'PRECEPTOR(A)'),
    textoVerso: legacyMessage,
    tituloFrente: asText(legacyModel.tituloFrente, 'PRECEPTOR(A)'),
    subtituloFrente: asText(legacyModel.subtituloFrente, 'UNIVERSO CURSOS E CONSULTORIA'),
    mensagemVerso: legacyMessage,
    rodape: asText(legacyModel.rodape, 'Documento institucional · valide pelo QR Code'),
    mostrarFoto: asBoolean(legacyModel.mostrarFoto, true),
    mostrarPolo: asBoolean(legacyModel.mostrarPolo, true),
    marcaDaguaHabilitada: asBoolean(legacyModel.marcaDaguaHabilitada, true),
    qr: { ...stageQr, ...legacyQr },
    fields,
  } satisfies CrachaTemplateModel;
};

export const hasPreceptorCrachaLayout = (model: unknown) => {
  const source = asRecord(model);
  return source.layoutVersion === PRECEPTOR_CRACHA_LAYOUT_VERSION
    && Array.isArray(source.fields);
};

/**
 * Converte apenas o modelo de preceptor legado. Os fundos e a geometria vêm
 * do modelo de estágio vigente para que a primeira versão já seja um clone
 * visual, mas os campos dinâmicos passam a usar somente dados do professor.
 */
export const createPreceptorCrachaModel = (
  model: CrachaTemplateModel | Record<string, unknown> | null | undefined,
  stageModel?: CrachaTemplateModel | Record<string, unknown> | null,
) => {
  const source = asRecord(model);
  if (hasPreceptorCrachaLayout(source)) return initializeCrachaModel(source, 'preceptor');
  return initializeCrachaModel(convertStageModelToPreceptor(stageModel, source), 'preceptor');
};

/** Mantém o envelope técnico seguro e remove qualquer status controlado pelo navegador. */
export const serializePreceptorCrachaModel = (model: CrachaTemplateModel | Record<string, unknown>) => {
  const prepared = createPreceptorCrachaModel(model);
  const { status: _status, ...content } = prepared;
  const hasPhoto = content.fields.some((field) => field.type === 'foto');
  const hasQr = content.fields.some((field) => field.type === 'qrcode');
  return {
    ...content,
    nomeModelo: asText(content.nome, 'Crachá de Preceptor'),
    tituloFrente: asText(content.textoFrente, 'PRECEPTOR(A)'),
    subtituloFrente: asText(content.subtituloFrente, 'UNIVERSO CURSOS E CONSULTORIA'),
    mensagemVerso: asText(content.textoVerso, DEFAULT_PRECEPTOR_BACK_TEXT),
    rodape: asText(content.rodape, 'Documento institucional · valide pelo QR Code'),
    mostrarFoto: hasPhoto,
    mostrarPolo: asBoolean(content.mostrarPolo, true),
    marcaDaguaHabilitada: asBoolean(content.marcaDaguaHabilitada, true),
    qr: { ...asRecord(content.qr), habilitado: hasQr },
  };
};
