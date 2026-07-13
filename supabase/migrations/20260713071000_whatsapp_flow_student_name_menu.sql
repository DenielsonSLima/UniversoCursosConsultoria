UPDATE public.whatsapp_flow_settings
SET
  menu_message = 'Cadastro confirmado, {{nome_aluno}}. Como posso ajudar?

1 - Receber link/boleto de pagamento
2 - Receber PIX copia e cola
3 - Solicitar declaração de IRPF
4 - Falar com atendente',
  updated_at = now()
WHERE scope = 'default'
  AND menu_message IN (
    'Cadastro confirmado. Como posso ajudar?

1 - Receber link/boleto de pagamento
2 - Receber PIX copia e cola
3 - Solicitar declaração de IRPF
4 - Falar com atendente',
    'Cadastro localizado. Escolha uma opção:

1 - Receber link/boleto de pagamento
2 - Receber PIX copia e cola
3 - Solicitar declaração de IRPF
4 - Falar com atendente',
    'Cadastro localizado. Escolha uma opção:

1 - Receber link/boleto de pagamento
2 - Receber PIX copia e cola
3 - Falar com atendente'
  );
