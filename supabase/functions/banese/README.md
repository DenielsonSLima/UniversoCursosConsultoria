# Banese adapter

This folder is reserved for the Banese implementation. Keep the same internal
boundaries used by Asaas so payment bugs can be isolated by provider and by
business flow.

## Modules

- `core`: shared Banese runtime, HTTP, credentials, status mapping and error normalization.
- `ead`: EAD Pix/boleto behavior through Banese.
- `tecnico`: technical course Pix/boleto behavior.
- `livres`: free course Pix/boleto behavior.
- `especializacao`: specialization Pix/boleto behavior.
- `outros-creditos`: detached financial links from Financeiro > Outros Creditos.
- `webhook`: Banese webhook validation, idempotency and event translation.

## Boundary

Banese currently routes only Pix and boleto in the gateway configuration. Card
routes should stay with Asaas or Mercado Pago unless the Banese card adapter is
explicitly implemented later.

## Public API references

Local reference material from the ACBr forum is stored in
`Documentos/forum banese api`. The implementation must use those files only as
technical reference; the official API contract is the Banese PDF/manual.

### Boleto

- REST/JSON with OAuth `client_credentials`.
- Sandbox base URL: `https://sandbox.banese.b.br/cobranca/v1`.
- Production base URL: `https://webapi.banese.b.br/cobranca/v1`.
- Sandbox token URL: `https://sandbox.banese.b.br/autenticacao/oauth/v1/token`.
- Production token URL: `https://webapi.banese.b.br/autenticacao/oauth/v1/token`.
- Scope: `boletos`.
- Main creation endpoint: `POST /convenios/{id_convenio}/boletos`.

### Pix / SAB Guias

- REST/JSON with OAuth `client_credentials` and certificate/CRT access token step.
- Sandbox base URL: `https://apipix-h.banese.b.br/guias/v1`.
- Production base URL: `https://apipix.banese.b.br/guias/v1`.
- Sandbox token URL: `https://apipix-h.banese.b.br/security/v3/oauth/token`.
- Production token URL: `https://apipix.banese.b.br/security/v3/oauth/token`.
- Webhook endpoint: `/manutencao/webhook/{chave}`.
- Required `Terminal` header according to the available manual:
  - Sandbox: `99000090054`.
  - Production: `99000090049`.
- Confirm with Banese whether the certificate endpoint is really spelled
  `/manutencao/cerificado`, as written in the manual, or `/manutencao/certificado`.
