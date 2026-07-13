export type FlowSettings = {
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
};

export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  enabled: false,
  max_attempts: 2,
  welcome_message:
    "Olá! Sou o atendimento automático da Universo Cursos. Para proteger seus dados e localizar seu cadastro com segurança, informe seu CPF. Pode enviar com ou sem pontuação.",
  invalid_cpf_message:
    "Não consegui validar esse CPF. Envie novamente apenas os 11 números, ou no formato 000.000.000-00.",
  mismatch_message:
    "Por segurança, não consegui confirmar esse CPF com o telefone desta conversa. Vou encaminhar seu atendimento para nossa equipe conferir.",
  menu_message:
    "Cadastro confirmado, {{nome_aluno}}. Como posso ajudar?\n\n1 - Receber link/boleto de pagamento\n2 - Receber PIX copia e cola\n3 - Solicitar declaração de IRPF\n4 - Falar com atendente",
  receivable_choice_message:
    "Encontrei mais de uma parcela disponível. Responda com o número da parcela que deseja pagar:",
  no_receivables_message:
    "No momento não encontrei parcela aberta, vencida ou próxima do vencimento com dados de pagamento disponíveis. Vou encaminhar para nossa equipe conferir.",
  fallback_message:
    "Desculpe, não consegui entender sua resposta. Escolha uma das opções do menu ou digite 4 para falar com atendente.",
  handoff_message:
    "Certo. Vou encaminhar sua conversa para um atendente. Em breve alguém da equipe continuará o atendimento por aqui.",
  link_intro_message:
    "Claro. Segue o link de pagamento da parcela selecionada. Se já tiver pago, pode desconsiderar.",
  pix_intro_message:
    "Claro. Segue o PIX copia e cola da parcela selecionada. Vou enviar separado para facilitar a cópia.",
  irpf_not_eligible_message:
    "Não localizei vínculo em curso técnico para liberar a declaração de IRPF automaticamente por aqui. Vou encaminhar para nossa equipe conferir com cuidado.",
  irpf_year_choice_message:
    "Localizei declaração de IRPF disponível em mais de um ano-calendário. Responda com o número do ano que deseja receber:",
  irpf_no_years_message:
    "Localizei seu vínculo em curso técnico, mas não encontrei pagamentos quitados com ano disponível para IRPF. Vou encaminhar para nossa equipe conferir.",
  irpf_ready_message:
    "Encontrei sua declaração de IRPF. Vou enviar o link de validação em uma mensagem separada.",
  irpf_link_intro_message: "Acesse o link abaixo para consultar e validar sua declaração de IRPF:",
};

export const getFlowSettings = async (admin: any): Promise<FlowSettings> => {
  const { data, error } = await admin
    .from("whatsapp_flow_settings")
    .select("*")
    .eq("scope", "default")
    .maybeSingle();
  if (error) throw error;
  const next = { ...DEFAULT_FLOW_SETTINGS, ...(data || {}) };
  for (const key of Object.keys(next) as Array<keyof FlowSettings>) {
    if (typeof next[key] === "string") next[key] = String(next[key]).replace(/\\n/g, "\n") as never;
  }
  return next;
};
