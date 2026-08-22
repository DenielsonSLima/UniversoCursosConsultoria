# WhatsApp, Push e Serviços Externos

Status: CANÔNICO. Última revisão: 2026-08-12.

## WhatsApp e atendimento

O backend de WhatsApp é composto pelas funções com prefixo whatsapp- em
supabase/functions/. Elas cuidam de configuração, perfil, mídia, automações,
webhook e envio. A interface administrativa fica em
modules/gestor/comunicacao/.

Configurar número, provedor, templates e automações somente na área
administrativa autorizada e no Vault. Webhooks precisam validar origem,
assinatura e idempotência.

## Push

As funções push-notification-* enviam notificações e mantêm recursos
relacionados. O aplicativo registra dispositivos em modules/aluno/native-app/.
Firebase e APNs são configurações privadas de plataforma.

## Cloudflare Turnstile

Turnstile protege fluxos públicos e nativos. A chave de site pode ser pública;
o segredo de validação fica somente no backend. A rota nativa de desafio é
isolada para não carregar o portal comum.

## Google, OpenAI e outros

Integrações de OAuth, IA, mídia ou APIs externas seguem o mesmo padrão:

- frontend recebe apenas identificadores ou chaves públicas quando necessário;
- segredos ficam fora do repositório;
- chamadas com privilégio saem de Edge Function ou backend;
- logs e documentação não incluem payloads pessoais, tokens ou chaves.

