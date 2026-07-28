const DEFAULT_BACK_TEXT = 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.';

const defaultPositions: Record<string, { x: number; y: number }> = {
  foto: { x: 27.5, y: 14 },
  nome: { x: 3.7, y: 47 },
  cargo: { x: 3.7, y: 53 },
  matricula: { x: 5.5, y: 60 },
  cpf: { x: 5.5, y: 66.2 },
  curso: { x: 5.5, y: 72.4 },
  qrcode: { x: 62, y: 60 },
};

const frontInfoFieldValues: Record<string, string> = {
  matricula: 'MATRÍCULA\n{{ALUNO_MATRICULA}}',
  cpf: 'CPF\n{{ALUNO_CPF}}',
  curso: 'CURSO\n{{ALUNO_CURSO}}',
};

const createDefaultModel = () => ({
  id: 'cracha',
  nome: 'Crachá de Estágio',
  cargoPadrao: 'ESTAGIÁRIO',
  status: 'ativo',
  startNumber: 1000,
  hasVerso: true,
  corPrimaria: '#0f172a',
  corSecundaria: '#10b981',
  textoFrente: 'ESTAGIÁRIO',
  textoVerso: DEFAULT_BACK_TEXT,
  bgFrenteUrl: '',
  bgVersoUrl: '',
  ocultarDesignPadrao: false,
  corTexto: '#1e293b',
  tamanhoFonteNome: 8.5,
  tamanhoFonteDados: 6.8,
  fotoWidth: 45,
  fotoHeight: 28.5,
});

export const getCrachaUploadExtension = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && ['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

const createBackFields = (backText?: string) => [
  {
    id: 'verso_qrcode', type: 'qrcode', value: 'QR_VALIDADOR_CRACHA',
    x: 27, y: 10, width: 46, height: 26, page: 'verso',
  },
  {
    id: 'verso_nome', type: 'text', value: '{{ALUNO_NOME}}', x: 3.7, y: 38,
    width: 92.6, page: 'verso',
    style: { fontSize: '6px', fontWeight: 'bold', color: '#1e293b', textAlign: 'center' },
  },
  {
    id: 'verso_matricula', type: 'text', value: 'MATRÍCULA: {{ALUNO_MATRICULA}}',
    x: 3.7, y: 43, width: 92.6, page: 'verso',
    style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' },
  },
  {
    id: 'verso_cpf', type: 'text', value: 'CPF: {{ALUNO_CPF}}',
    x: 3.7, y: 47, width: 92.6, page: 'verso',
    style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' },
  },
  {
    id: 'verso_curso', type: 'text', value: 'CURSO: {{ALUNO_CURSO}}',
    x: 3.7, y: 51, width: 92.6, page: 'verso',
    style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' },
  },
  {
    id: 'verso_url_validador', type: 'text', value: 'www.universocc.com.br/validador',
    x: 3.7, y: 55.5, width: 92.6, page: 'verso',
    style: { fontSize: '4.5px', fontWeight: 'bold', color: '#dc2626', textAlign: 'center' },
  },
  {
    id: 'instrucoes', type: 'text', value: backText || DEFAULT_BACK_TEXT,
    x: 5, y: 60, width: 90, page: 'verso',
    style: { fontSize: '4.2px', fontWeight: 'normal', color: '#64748b', textAlign: 'left' },
  },
  {
    id: 'emissao_label', type: 'text', value: 'EMISSÃO', x: 5, y: 86, page: 'verso',
    style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' },
  },
  {
    id: 'emissao_valor', type: 'text', value: '{{DATA_HOJE}}', x: 5, y: 89, page: 'verso',
    style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' },
  },
  {
    id: 'validade_label', type: 'text', value: 'VALIDADE', x: 55, y: 86, page: 'verso',
    style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' },
  },
  {
    id: 'validade_valor', type: 'text', value: '{{DATA_VALIDADE}}', x: 55, y: 89, page: 'verso',
    style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' },
  },
];

const normalizeFrontInfoField = (field: any) => {
  const normalizedId = field.id === 'polo' ? 'curso' : field.id;
  const normalizedValue = frontInfoFieldValues[normalizedId];
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

const createFrontFields = (model: any) => {
  const positions = model.posicoes || defaultPositions;
  const dataFontSize = `${model.tamanhoFonteDados || 6.8}px`;
  const dataStyle = {
    fontSize: dataFontSize,
    lineHeight: '1.12',
    fontWeight: 'bold',
    color: model.corTexto || '#1e293b',
  };

  return [
    {
      id: 'foto', type: 'foto', value: '{{ALUNO_FOTO}}',
      x: positions.foto?.x ?? 27.5, y: positions.foto?.y ?? 14,
      width: model.fotoWidth || 45, height: model.fotoHeight || 28.5, page: 'frente',
    },
    {
      id: 'nome', type: 'text', value: '{{ALUNO_NOME}}',
      x: positions.nome?.x ?? 3.7, y: positions.nome?.y ?? 47, page: 'frente',
      style: {
        fontWeight: 'bold', fontSize: `${model.tamanhoFonteNome || 8.5}px`,
        textAlign: 'center', color: model.corTexto || '#1e293b',
      },
    },
    {
      id: 'cargo', type: 'text', value: model.textoFrente || model.cargoPadrao || 'ESTAGIÁRIO',
      x: positions.cargo?.x ?? 3.7, y: positions.cargo?.y ?? 53, page: 'frente',
      style: {
        fontWeight: 'bold', fontSize: `${model.tamanhoFonteDados || 7.5}px`,
        textAlign: 'center', color: model.corSecundaria || '#10b981',
      },
    },
    {
      id: 'matricula', type: 'text', value: frontInfoFieldValues.matricula,
      x: positions.matricula?.x ?? 5.5, y: positions.matricula?.y ?? 60,
      page: 'frente', style: { ...dataStyle },
    },
    {
      id: 'cpf', type: 'text', value: frontInfoFieldValues.cpf,
      x: positions.cpf?.x ?? 5.5, y: positions.cpf?.y ?? 66.2,
      page: 'frente', style: { ...dataStyle },
    },
    {
      id: 'curso', type: 'text', value: frontInfoFieldValues.curso,
      x: positions.curso?.x ?? positions.polo?.x ?? 5.5,
      y: positions.curso?.y ?? positions.polo?.y ?? 72.4,
      page: 'frente', style: { ...dataStyle },
    },
    {
      id: 'qrcode', type: 'qrcode', value: 'QR_VALIDADOR_CRACHA',
      x: positions.qrcode?.x ?? 62, y: positions.qrcode?.y ?? 60,
      width: 22, height: 14, page: 'frente',
    },
  ];
};

export const resolveCrachaFields = (model: any) => {
  const backFields = createBackFields(model.textoVerso);
  const allowValidationQrCode = model.validationPublic !== false;
  const isValidationElement = (field: any) => (
    field.type === 'qrcode'
    || field.id === 'verso_url_validador'
    || field.id === 'validade_label'
    || field.id === 'validade_valor'
  );

  if (!Array.isArray(model.fields)) {
    return [...createFrontFields(model), ...backFields].filter(
      (field) => allowValidationQrCode || !isValidationElement(field),
    );
  }

  return model.fields
    .map(normalizeFrontInfoField)
    .filter((field: any) => allowValidationQrCode || !isValidationElement(field));
};

export const initializeCrachaModel = (modelo: any) => {
  const model = modelo || createDefaultModel();
  return { ...model, fields: resolveCrachaFields(model) };
};
