export type WhatsAppSector =
  | 'pedagogico_coordenacao'
  | 'financeiro'
  | 'comercial_matriculas'
  | 'secretaria'
  | 'atendimento_geral';

export type WhatsAppTicketStatus =
  | 'bot_triagem'
  | 'pendente_setor'
  | 'em_atendimento'
  | 'redirecionado_externo'
  | 'solucionada'
  | 'aguardando_avaliacao';

export type WhatsAppInstituicao = 'universo' | 'anhanguera' | 'unopar';

export interface WhatsAppConexao {
  id: string;
  nome: string;
  instituicao: WhatsAppInstituicao;
  telefone: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  is_default: boolean;
  is_matriz_financeira: boolean;
  status: 'ativo' | 'inativo';
  connection_mode?: 'cloud_api' | 'coexistence' | null;
  graph_version?: string | null;
  app_id?: string | null;
  app_secret?: string | null;
  verify_token?: string | null;
  token_configured?: boolean;
  embedded_signup_config_id?: string | null;
  business_portfolio_id?: string | null;
  app_secret_configured?: boolean;
  verify_token_configured?: boolean;
  webhook_verified_at?: string | null;
  waba_subscribed_at?: string | null;
  coexistence_verified_at?: string | null;
  contacts_sync_status?: 'not_requested' | 'requested' | 'receiving' | 'completed' | 'error';
  contacts_sync_request_id?: string | null;
  history_sync_status?: 'not_requested' | 'requested' | 'receiving' | 'completed' | 'declined' | 'error';
  history_sync_request_id?: string | null;
  history_sync_progress?: number | null;
  last_account_event?: string | null;
  last_account_event_at?: string | null;
  last_health_check_at?: string | null;
  last_error?: string | null;
  business_profile_cache?: Partial<WhatsAppBusinessProfile> | null;
  profile_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export const isWhatsAppConnectionOutboundReady = (
  connection?: WhatsAppConexao | null,
) =>
  Boolean(
    connection?.status === 'ativo' &&
    connection.phone_number_id &&
    connection.token_configured,
  );

export const isWhatsAppConnectionWebhookReady = (
  connection?: WhatsAppConexao | null,
) =>
  Boolean(
    isWhatsAppConnectionOutboundReady(connection) &&
    connection?.waba_id &&
    connection?.app_id &&
    connection.app_secret_configured &&
    connection.verify_token_configured &&
    connection.webhook_verified_at &&
    connection.waba_subscribed_at,
  );

export const isWhatsAppConnectionReady = (connection?: WhatsAppConexao | null) =>
  Boolean(
    isWhatsAppConnectionOutboundReady(connection) &&
    (
      connection?.connection_mode !== 'coexistence' ||
      (
        isWhatsAppConnectionWebhookReady(connection) &&
        connection.coexistence_verified_at
      )
    ),
  );

export interface WhatsAppConversation {
  id: string;
  aluno_id: string | null;
  contato_nome: string;
  contato_foto: string | null;
  telefone: string;
  status: 'aberta' | 'arquivada';
  ultimo_texto: string | null;
  ultima_data: string;
  unread_count: number;
  closed_at?: string | null;
  closed_reason?: string | null;

  // Campos de Comunicação Multisetorial
  conexao_id?: string | null;
  setor?: WhatsAppSector | null;
  polo_id?: string | null;
  polo_nome?: string | null;
  atendente_id?: string | null;
  atendente_nome?: string | null;
  instituicao?: WhatsAppInstituicao | null;
  status_atendimento?: WhatsAppTicketStatus | null;
  sub_assunto?: string | null;
  tempo_primeira_resposta_seg?: number | null;
  tempo_total_atendimento_seg?: number | null;
  csat_score?: number | null;
  csat_comentario?: string | null;
  csat_requested_at?: string | null;
  data_inicio_atendimento?: string | null;
  data_fim_atendimento?: string | null;
}

export interface WhatsAppRoutingPolo {
  id: string;
  nome: string;
  cidade: string | null;
}

export interface WhatsAppFlowSettings {
  id?: string;
  scope?: string;
  conexao_id?: string;
  flow_type?: 'universo_main' | 'institutional';
  routing_config?: WhatsAppFlowRoutingConfig;
  enabled: boolean;
  max_attempts: number;
  auto_close_enabled: boolean;
  auto_close_hours: number;
  welcome_message: string;
  invalid_cpf_message: string;
  mismatch_message: string;
  menu_message: string;
  receivable_choice_message: string;
  no_receivables_message: string;
  fallback_message: string;
  handoff_message: string;
  link_intro_message: string;
  pix_intro_message: string;
  irpf_not_eligible_message: string;
  irpf_year_choice_message: string;
  irpf_no_years_message: string;
  irpf_ready_message: string;
  irpf_link_intro_message: string;
  updated_at?: string;
}

export type WhatsAppFlowActionType =
  | 'goto'
  | 'route'
  | 'finance_link'
  | 'finance_pix'
  | 'finance_irpf'
  | 'course_agent'
  | 'redirect'
  | 'handoff'
  | 'reply';

export type WhatsAppFlowPoloMode = 'inherit' | 'default' | 'label' | 'none';

export interface WhatsAppFlowOption {
  id: string;
  label: string;
  enabled: boolean;
  action: WhatsAppFlowActionType;
  targetNodeId?: string | null;
  sector?: WhatsAppSector | null;
  poloMode?: WhatsAppFlowPoloMode;
  poloLabel?: string | null;
  institution?: WhatsAppInstituicao | null;
  subject?: string | null;
  responseMessage?: string | null;
  rememberKey?: string | null;
  rememberValue?: string | null;
  setInstitution?: WhatsAppInstituicao | null;
}

export interface WhatsAppFlowNode {
  id: string;
  name: string;
  message: string;
  enabled: boolean;
  options: WhatsAppFlowOption[];
}

export interface WhatsAppFlowDefinition {
  version: 1;
  startNodeId: string;
  nodes: WhatsAppFlowNode[];
}

export interface WhatsAppFlowRoutingConfig extends Record<string, unknown> {
  flow_builder?: WhatsAppFlowDefinition;
}

export interface WhatsAppFlowSession {
  id: string;
  conversa_id: string;
  telefone: string;
  aluno_id: string | null;
  status: 'awaiting_cpf' | 'menu' | 'course_agent' | 'choosing_receivable' | 'choosing_irpf_year' | 'awaiting_csat' | 'handoff' | 'closed';
  verified_at: string | null;
  attempts: number;
  selected_payment_method: 'link' | 'pix' | null;
  handoff_required: boolean;
  data: any;
  updated_at: string;
  contato_nome?: string;
  aluno_nome?: string;
}

export interface WhatsAppMessage {
  id: string;
  conversa_id: string;
  aluno_id: string | null;
  meta_message_id: string | null;
  direcao: 'entrada' | 'saida' | 'status';
  remetente_tipo: 'aluno' | 'gestor' | 'sistema';
  remetente_nome: string;
  conteudo: string;
  message_type: string;
  status: string | null;
  raw_payload?: any;
  lida: boolean;
  created_at: string;
}

export type WhatsAppMediaKind = 'image' | 'audio' | 'document';

export interface WhatsAppMediaFile {
  base64: string;
  type: string;
  name: string;
}

export interface WhatsAppContact {
  id: string;
  nome: string;
  tipo: string;
  email: string | null;
  telefone: string | null;
  cpfCnpj: string | null;
  cidade: string | null;
  status: string | null;
  foto: string | null;
  poloNome: string;
  matriculas: WhatsAppContactEnrollment[];
}

export interface WhatsAppContactEnrollment {
  id: string;
  status: string;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string;
  cursoId: string;
  cursoNome: string;
  modalidade: string;
}

export interface WhatsAppBusinessProfile {
  about: string;
  address: string;
  description: string;
  email: string;
  websites: string[];
  vertical: string;
  profilePictureUrl: string | null;
}

export interface WhatsAppUsageSummary {
  usage_month: string;
  monthly_limit: number;
  currency: string;
  meta_balance: number | null;
  meta_balance_source: string | null;
  meta_synced_at: string | null;
  marketing_sent: number;
  marketing_rate: number;
  marketing_cost: number;
  marketing_available: number | null;
  marketing_percent: number;
  billing_sent: number;
  billing_rate: number;
  billing_cost: number;
  billing_available: number | null;
  billing_percent: number;
  service_sent: number;
  service_rate: number;
  service_cost: number;
  service_percent: number;
  total_sent: number;
  spent: number;
  remaining: number;
  spent_percent: number;
  alert_level: 'none' | 'initial' | 'warning' | 'critical';
  alert_title: string | null;
  alert_message: string | null;
  alert_threshold_percent: number | null;
  alert_threshold_amount: number | null;
}
