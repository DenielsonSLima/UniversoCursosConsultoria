# Banese adapter

This folder is reserved for the Banese implementation. Keep the same internal
boundaries used by Asaas so payment bugs can be isolated by provider and by
business flow.

## Modules

- `core`: shared Banese runtime, HTTP, credentials, status mapping and error normalization.

Checkout dispatch, route selection and webhook entrypoints live in
`../gateways`. Banese real checkout remains blocked in `../gateways/router.ts`
and in `../gateways/api/index.ts` until Pix/Boleto are homologated end to end,
including payload generation per charge, display of the bank return, and
conciliation.

## Boundary

Banese Card is the bank/provider name. Its local documentation covers Pix/SAB
Guias and boleto/cobranca, but the CREDIT_CARD payment method is not supported
in this flow. Card routes must stay with Asaas or Mercado Pago.

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
- `NossoNumero` is mandatory: 8 digits plus the check digit, unique per convenio.
- The API returns `NumeroCodigoBarras` and `NumeroLinhaDigitavel`, not a hosted
  checkout URL. The checkout flow must not be enabled until the student-facing
  boleto display/download and payment polling are implemented.

### Pix / SAB Guias

- REST/JSON with OAuth `client_credentials` and certificate/CRT access token step.
- Sandbox base URL: `https://apipix-h.banese.b.br/guias/v1`.
- Production base URL: `https://apipix.banese.b.br/guias/v1`.
- Sandbox token URL: `https://apipix-h.banese.b.br/security/v3/oauth/token`.
- Production token URL: `https://apipix.banese.b.br/security/v3/oauth/token`.
- Scope for future-dated guia creation: `sab.guiasmanutencao,cobv.write,payloadlocation.read`.
- Main creation endpoint from the manual: `POST /manutencao/guiaVencimentoFuturo`.
- The creation payload requires a 48-digit `codigoBarra` per charge. Do not fake
  this value; it must come from the homologated Banese/SAB Guias layout.
- The creation response returns `brCodeEMV` for Pix copy-paste and `base64` for
  the QR image. Query responses may return `dsUrl` and `qrCode`.
- Webhook endpoint: `/manutencao/webhook/{chave}`.
- Required `Terminal` header according to the available manual:
  - Sandbox: `99000090054`.
  - Production: `99000090049`.
- Confirm with Banese whether the certificate endpoint is really spelled
  `/manutencao/cerificado`, as written in the manual, or `/manutencao/certificado`.
