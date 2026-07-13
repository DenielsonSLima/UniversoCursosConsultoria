import { WhatsAppFlowSettings } from '../whatsapp/whatsapp.types';

export type FlowTabId = 'geral' | 'cobranca' | 'documentos';

export type FlowMessageField = keyof Pick<WhatsAppFlowSettings,
  'welcome_message' |
  'invalid_cpf_message' |
  'mismatch_message' |
  'menu_message' |
  'receivable_choice_message' |
  'no_receivables_message' |
  'fallback_message' |
  'handoff_message' |
  'link_intro_message' |
  'pix_intro_message' |
  'irpf_not_eligible_message' |
  'irpf_year_choice_message' |
  'irpf_no_years_message' |
  'irpf_ready_message' |
  'irpf_link_intro_message'
>;

export type FlowGroup = {
  title: string;
  description: string;
  fields: Array<{ field: FlowMessageField; label: string; help: string; rows?: number }>;
};

export const flowTabs: Array<{ id: FlowTabId; label: string; summary: string }> = [
  { id: 'geral', label: 'Atendimento geral', summary: 'CPF, menu e atendente' },
  { id: 'cobranca', label: 'Cobrança', summary: 'Boleto, PIX e parcelas' },
  { id: 'documentos', label: 'Documentos', summary: 'IRPF curso técnico' },
];

export const flowGroupsByTab: Record<FlowTabId, FlowGroup[]> = {
  geral: [
    {
      title: 'Identificação segura',
      description: 'Primeiro contato do robô. Valida CPF e bloqueia dados financeiros quando telefone e CPF não conferem.',
      fields: [
        { field: 'welcome_message', label: 'Pedir CPF', help: 'Mensagem enviada quando o aluno chama no WhatsApp.', rows: 3 },
        { field: 'invalid_cpf_message', label: 'CPF inválido', help: 'Quando o CPF vem incompleto ou com menos de 11 dígitos.', rows: 3 },
        { field: 'mismatch_message', label: 'Telefone e CPF não conferem', help: 'Quando o CPF não pertence ao telefone da conversa.', rows: 3 },
      ],
    },
    {
      title: 'Menu e atendimento humano',
      description: 'Menu central depois da validação. Mantém cobrança, IRPF e atendente em caminhos separados.',
      fields: [
        { field: 'menu_message', label: 'Menu principal', help: 'Use {{nome_aluno}} para chamar a pessoa pelo nome depois da confirmação.', rows: 6 },
        { field: 'fallback_message', label: 'Quando não entender', help: 'Resposta enviada quando o aluno digita algo fora do menu.', rows: 3 },
        { field: 'handoff_message', label: 'Encaminhar atendente', help: 'Mensagem antes de pausar o robô naquela conversa.', rows: 3 },
      ],
    },
  ],
  cobranca: [
    {
      title: 'Parcelas e pagamento',
      description: 'Usa somente contas a receber existentes. Link e PIX saem separados para facilitar copiar.',
      fields: [
        { field: 'receivable_choice_message', label: 'Mais de uma parcela', help: 'Antes da lista numerada de parcelas abertas ou vencidas.', rows: 3 },
        { field: 'link_intro_message', label: 'Antes do link/boleto', help: 'Mensagem 1. A próxima mensagem terá somente o link.', rows: 3 },
        { field: 'pix_intro_message', label: 'Antes do PIX', help: 'Mensagem 1. A próxima mensagem terá somente o PIX copia e cola.', rows: 3 },
        { field: 'no_receivables_message', label: 'Sem cobrança disponível', help: 'Quando não houver parcela com link ou PIX para enviar.', rows: 3 },
      ],
    },
  ],
  documentos: [
    {
      title: 'IRPF de curso técnico',
      description: 'Disponível somente para alunos com vínculo técnico. O robô mostra anos-calendário com pagamentos quitados.',
      fields: [
        { field: 'irpf_year_choice_message', label: 'Escolha do ano', help: 'Quando houver mais de um ano-calendário disponível.', rows: 3 },
        { field: 'irpf_ready_message', label: 'IRPF localizado', help: 'Mensagem antes do link de validação.', rows: 3 },
        { field: 'irpf_link_intro_message', label: 'Antes do link', help: 'Mensagem curta. O link vai separado em seguida.', rows: 3 },
        { field: 'irpf_no_years_message', label: 'Sem anos disponíveis', help: 'Aluno técnico sem pagamento quitado disponível para IRPF.', rows: 3 },
        { field: 'irpf_not_eligible_message', label: 'Não elegível', help: 'Quando não há vínculo de curso técnico no cadastro.', rows: 3 },
      ],
    },
  ],
};
