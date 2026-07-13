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
}

export interface WhatsAppFlowSettings {
  id?: string;
  scope?: string;
  enabled: boolean;
  max_attempts: number;
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

export interface WhatsAppFlowSession {
  id: string;
  conversa_id: string;
  telefone: string;
  aluno_id: string | null;
  status: 'awaiting_cpf' | 'menu' | 'choosing_receivable' | 'choosing_irpf_year' | 'handoff' | 'closed';
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
}
