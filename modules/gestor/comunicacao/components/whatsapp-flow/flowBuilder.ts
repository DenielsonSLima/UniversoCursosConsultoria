import {
  WhatsAppFlowDefinition,
  WhatsAppFlowNode,
  WhatsAppFlowOption,
} from '../whatsapp/whatsapp.types';

const option = (
  id: string,
  label: string,
  action: WhatsAppFlowOption['action'],
  details: Partial<WhatsAppFlowOption> = {},
): WhatsAppFlowOption => ({
  id,
  label,
  action,
  enabled: true,
  ...details,
});

const node = (
  id: string,
  name: string,
  message: string,
  options: WhatsAppFlowOption[],
): WhatsAppFlowNode => ({
  id,
  name,
  message,
  options,
  enabled: true,
});

export const DEFAULT_UNIVERSO_FLOW_DEFINITION: WhatsAppFlowDefinition = {
  version: 1,
  startNodeId: 'main_menu',
  nodes: [
    node('main_menu', 'Menu principal', 'Olá! Sou o *Uni*, assistente virtual da *Universo Cursos e Consultoria*.\nComo posso ajudar?', [
      option('main_student', 'Já sou aluno', 'goto', { targetNodeId: 'student_institution' }),
      option('main_enrollment', 'Quero me matricular', 'goto', { targetNodeId: 'enrollment_modality' }),
      option('main_finance', 'Financeiro', 'goto', {
        targetNodeId: 'finance_menu',
        sector: 'financeiro',
        poloMode: 'default',
        subject: 'Financeiro',
      }),
      option('main_courses', 'Cursos disponíveis', 'course_agent'),
      option('main_attendant', 'Falar com atendente', 'goto', { targetNodeId: 'attendant_sector' }),
    ]),
    node('student_institution', 'Instituição do aluno', 'Qual instituição você estuda?', [
      option('institution_universo', 'Universo Cursos e Consultoria', 'goto', {
        targetNodeId: 'student_polo',
        setInstitution: 'universo',
      }),
      option('institution_anhanguera', 'Anhanguera', 'redirect', { institution: 'anhanguera' }),
      option('institution_unopar', 'Unopar', 'redirect', { institution: 'unopar' }),
    ]),
    node('student_polo', 'Unidade do aluno', 'Qual unidade?', [
      option('student_polo_japoata', 'Japoatã', 'goto', { targetNodeId: 'student_help', poloMode: 'label', poloLabel: 'Japoatã' }),
      option('student_polo_propria', 'Propriá', 'goto', { targetNodeId: 'student_help', poloMode: 'label', poloLabel: 'Propriá' }),
      option('student_polo_aquidaba', 'Aquidabã', 'goto', { targetNodeId: 'student_help', poloMode: 'label', poloLabel: 'Aquidabã' }),
      option('student_polo_porto', 'Porto da Folha', 'goto', { targetNodeId: 'student_help', poloMode: 'label', poloLabel: 'Porto da Folha' }),
      option('student_polo_other', 'Outra', 'handoff', {
        sector: 'atendimento_geral',
        poloMode: 'none',
        subject: 'Aluno de outra unidade',
      }),
    ]),
    node('student_help', 'Ajuda ao aluno', 'Como podemos ajudar?', [
      option('student_grades', 'Nota e frequência', 'route', {
        sector: 'pedagogico_coordenacao',
        poloMode: 'inherit',
        subject: 'Nota e frequência',
      }),
      option('student_finance', 'Financeiro', 'goto', {
        targetNodeId: 'finance_menu',
        sector: 'financeiro',
        poloMode: 'inherit',
        subject: 'Financeiro do aluno',
      }),
      option('student_attendant', 'Falar com atendente', 'handoff', {
        sector: 'atendimento_geral',
        poloMode: 'inherit',
        subject: 'Atendimento ao aluno',
      }),
    ]),
    node('enrollment_modality', 'Modalidade da matrícula', 'Qual modalidade?', [
      option('modality_technical', 'Curso Técnico', 'goto', {
        targetNodeId: 'enrollment_city',
        rememberKey: 'modality',
        rememberValue: 'Curso Técnico',
      }),
      option('modality_graduation', 'Graduação', 'goto', {
        targetNodeId: 'enrollment_city',
        rememberKey: 'modality',
        rememberValue: 'Graduação',
      }),
      option('modality_postgraduate', 'Pós-graduação', 'goto', {
        targetNodeId: 'enrollment_city',
        rememberKey: 'modality',
        rememberValue: 'Pós-graduação',
      }),
      option('modality_free', 'Curso Livre', 'goto', {
        targetNodeId: 'enrollment_city',
        rememberKey: 'modality',
        rememberValue: 'Curso Livre',
      }),
    ]),
    node('enrollment_city', 'Cidade da matrícula', 'Em qual cidade?', [
      option('city_japoata', 'Japoatã', 'route', { sector: 'comercial_matriculas', poloMode: 'label', poloLabel: 'Japoatã', subject: '{{modality}} — Japoatã' }),
      option('city_propria', 'Propriá', 'route', { sector: 'comercial_matriculas', poloMode: 'label', poloLabel: 'Propriá', subject: '{{modality}} — Propriá' }),
      option('city_aquidaba', 'Aquidabã', 'route', { sector: 'comercial_matriculas', poloMode: 'label', poloLabel: 'Aquidabã', subject: '{{modality}} — Aquidabã' }),
      option('city_porto', 'Porto da Folha', 'route', { sector: 'comercial_matriculas', poloMode: 'label', poloLabel: 'Porto da Folha', subject: '{{modality}} — Porto da Folha' }),
      option('city_other', 'Outra cidade', 'route', { sector: 'comercial_matriculas', poloMode: 'none', subject: '{{modality}} — Outra cidade' }),
    ]),
    node('finance_menu', 'Financeiro', 'Como o Financeiro pode ajudar?', [
      option('finance_link', 'Boleto ou link de pagamento', 'finance_link'),
      option('finance_pix', 'PIX Copia e Cola', 'finance_pix'),
      option('finance_irpf', 'Declaração para IRPF', 'finance_irpf'),
      option('finance_attendant', 'Falar com atendente', 'handoff', {
        sector: 'financeiro',
        poloMode: 'inherit',
        subject: 'Atendimento financeiro',
      }),
    ]),
    node('attendant_sector', 'Setor do atendente', 'Qual setor você deseja?', [
      option('attendant_commercial', 'Comercial', 'route', { sector: 'comercial_matriculas', poloMode: 'default', subject: 'Comercial' }),
      option('attendant_secretary', 'Secretaria', 'route', { sector: 'secretaria', poloMode: 'default', subject: 'Secretaria' }),
      option('attendant_finance', 'Financeiro', 'route', { sector: 'financeiro', poloMode: 'default', subject: 'Financeiro' }),
      option('attendant_coordination', 'Coordenação', 'route', { sector: 'pedagogico_coordenacao', poloMode: 'default', subject: 'Coordenação' }),
      option('attendant_japoata', 'Polo Japoatã', 'route', { sector: 'atendimento_geral', poloMode: 'label', poloLabel: 'Japoatã', subject: 'Polo Japoatã' }),
      option('attendant_propria', 'Polo Propriá', 'route', { sector: 'atendimento_geral', poloMode: 'label', poloLabel: 'Propriá', subject: 'Polo Propriá' }),
      option('attendant_aquidaba', 'Polo Aquidabã', 'route', { sector: 'atendimento_geral', poloMode: 'label', poloLabel: 'Aquidabã', subject: 'Polo Aquidabã' }),
      option('attendant_porto', 'Polo Porto da Folha', 'route', { sector: 'atendimento_geral', poloMode: 'label', poloLabel: 'Porto da Folha', subject: 'Polo Porto da Folha' }),
      option('attendant_anhanguera', 'Anhanguera', 'redirect', { institution: 'anhanguera' }),
      option('attendant_unopar', 'Unopar', 'redirect', { institution: 'unopar' }),
    ]),
  ],
};

export const DEFAULT_INSTITUTIONAL_FLOW_DEFINITION: WhatsAppFlowDefinition = {
  version: 1,
  startNodeId: 'institutional_menu',
  nodes: [
    node('institutional_menu', 'Menu principal', 'Olá! Como podemos ajudar?', [
      option('institutional_link', 'Boleto ou link de pagamento', 'finance_link'),
      option('institutional_pix', 'PIX Copia e Cola', 'finance_pix'),
      option('institutional_irpf', 'Declaração para IRPF', 'finance_irpf'),
      option('institutional_attendant', 'Falar com atendente', 'handoff', {
        sector: 'atendimento_geral',
        poloMode: 'default',
        subject: 'Atendimento geral',
      }),
    ]),
  ],
};

export const createFlowId = (prefix: string) => {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : `${Date.now()}${Math.random().toString(16).slice(2)}`.slice(-10);
  return `${prefix}_${suffix}`;
};

export const cloneFlowDefinition = (definition: WhatsAppFlowDefinition): WhatsAppFlowDefinition =>
  JSON.parse(JSON.stringify(definition));

export const renderFlowTemplate = (
  value: string | null | undefined,
  memory: Record<string, string>,
): string => String(value || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => (
  memory[key] || ''
)).trim();

export const defaultFlowDefinition = (
  flowType?: 'universo_main' | 'institutional',
): WhatsAppFlowDefinition =>
  cloneFlowDefinition(
    flowType === 'universo_main'
      ? DEFAULT_UNIVERSO_FLOW_DEFINITION
      : DEFAULT_INSTITUTIONAL_FLOW_DEFINITION,
  );

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const normalizeFlowDefinition = (
  value: unknown,
  flowType?: 'universo_main' | 'institutional',
): WhatsAppFlowDefinition => {
  if (!isObject(value) || !Array.isArray(value.nodes) || value.nodes.length === 0) {
    return defaultFlowDefinition(flowType);
  }

  const nodes = value.nodes
    .filter(isObject)
    .slice(0, 30)
    .map((rawNode): WhatsAppFlowNode => ({
      id: String(rawNode.id || createFlowId('step')).slice(0, 80),
      name: String(rawNode.name || 'Nova etapa').slice(0, 120),
      message: String(rawNode.message || '').slice(0, 4000),
      enabled: rawNode.enabled !== false,
      options: (Array.isArray(rawNode.options) ? rawNode.options : [])
        .filter(isObject)
        .slice(0, 12)
        .map((rawOption): WhatsAppFlowOption => ({
          id: String(rawOption.id || createFlowId('option')).slice(0, 80),
          label: String(rawOption.label || 'Nova opção').slice(0, 160),
          enabled: rawOption.enabled !== false,
          action: String(rawOption.action || 'handoff') as WhatsAppFlowOption['action'],
          targetNodeId: rawOption.targetNodeId ? String(rawOption.targetNodeId).slice(0, 80) : null,
          sector: rawOption.sector as WhatsAppFlowOption['sector'],
          poloMode: rawOption.poloMode as WhatsAppFlowOption['poloMode'],
          poloLabel: rawOption.poloLabel ? String(rawOption.poloLabel).slice(0, 120) : null,
          institution: rawOption.institution as WhatsAppFlowOption['institution'],
          subject: rawOption.subject ? String(rawOption.subject).slice(0, 180) : null,
          responseMessage: rawOption.responseMessage ? String(rawOption.responseMessage).slice(0, 4000) : null,
          rememberKey: rawOption.rememberKey ? String(rawOption.rememberKey).slice(0, 60) : null,
          rememberValue: rawOption.rememberValue ? String(rawOption.rememberValue).slice(0, 180) : null,
          setInstitution: rawOption.setInstitution as WhatsAppFlowOption['setInstitution'],
        })),
    }));

  const startNodeId = nodes.some((item) => item.id === value.startNodeId)
    ? String(value.startNodeId)
    : nodes[0].id;

  return { version: 1, startNodeId, nodes };
};

export const getFlowDefinitionIssues = (
  definition: WhatsAppFlowDefinition,
): string[] => {
  const issues: string[] = [];
  const nodeById = new Map(definition.nodes.map((item) => [item.id, item]));
  const startNode = nodeById.get(definition.startNodeId);
  if (!startNode) issues.push('Escolha uma etapa inicial válida.');
  if (startNode && !startNode.enabled) issues.push('A etapa inicial precisa estar ativa.');

  definition.nodes.forEach((item) => {
    if (!item.name.trim()) issues.push('Todas as etapas precisam de um nome.');
    if (!item.message.trim()) issues.push(`Escreva a mensagem da etapa “${item.name || 'sem nome'}”.`);
    item.options.forEach((entry) => {
      if (!entry.label.trim()) issues.push(`Há uma opção sem texto em “${item.name}”.`);
      if (entry.action === 'goto') {
        const target = entry.targetNodeId ? nodeById.get(entry.targetNodeId) : null;
        if (!target) issues.push(`Escolha o destino da opção “${entry.label}”.`);
        if (target && !target.enabled) issues.push(`O destino de “${entry.label}” está inativo.`);
      }
      if (entry.action === 'redirect' && !['anhanguera', 'unopar'].includes(String(entry.institution || ''))) {
        issues.push(`Escolha a instituição de destino de “${entry.label}”.`);
      }
      if (['route', 'handoff', 'reply'].includes(entry.action) && !entry.sector) {
        issues.push(`Escolha o setor de destino de “${entry.label}”.`);
      }
      if (entry.action === 'reply' && !String(entry.responseMessage || '').trim()) {
        issues.push(`Escreva a resposta da opção “${entry.label}”.`);
      }
    });
  });

  return [...new Set(issues)];
};
