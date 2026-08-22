# Comunicação e Notificações

Status: CANÔNICO. Última revisão: 2026-08-12.

## O que este módulo faz

Reúne comunicação interna, atendimento, WhatsApp, automações, suporte público
e notificações push.

| Área | Código principal |
| --- | --- |
| Comunicação do Gestor | modules/gestor/comunicacao/ |
| Comunicação do Aluno | modules/aluno/comunicacao/ |
| Notificações do Aluno | modules/aluno/notificacoes/ |
| Push e app nativo | modules/aluno/native-app/ |
| Backend WhatsApp | supabase/functions/whatsapp-*/ |
| Suporte público | supabase/functions/public-student-support/ |
| Entrega de push | supabase/functions/push-notification-*/ |

## Regras de operação

- Atendimento e automações dependem de permissão por papel e polo.
- Mensagens automáticas precisam de regra, canal, destinatário e trilha de
  auditoria.
- Conteúdo de comunicação deve evitar expor dados financeiros ou acadêmicos
  desnecessários.
- Webhooks externos devem validar origem, assinatura e idempotência no backend.
- O navegador nunca recebe credenciais de WhatsApp, Firebase, APNs ou serviços
  de envio.

## Configuração

1. Configurar a conta e os canais autorizados na Matriz.
2. Cadastrar templates, fluxos e regras de automação no módulo próprio.
3. Configurar credenciais privadas somente no Vault ou em secrets das Edge
   Functions.
4. Configurar Firebase e APNs para push do aplicativo.
5. Testar com um destinatário controlado e sem dados sensíveis.

## Fontes principais

- modules/gestor/comunicacao/
- modules/shared/comunicacao/
- modules/aluno/notificacoes/
- modules/aluno/native-app/
- supabase/functions/whatsapp-*/
- supabase/functions/push-notification-*/
- supabase/functions/public-student-support/

## Validação recomendada

- Confirmar autorização do gestor por polo.
- Testar idempotência de webhook.
- Verificar que falhas de integração não duplicam mensagens.
- Validar preferências, consentimento e deep links do aluno.

