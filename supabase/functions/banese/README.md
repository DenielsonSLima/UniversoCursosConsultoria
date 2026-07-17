# Banese adapter

This folder is reserved for the Banese implementation. Keep the same internal
boundaries used by Asaas so payment bugs can be isolated by provider and by
business flow.

## Modules

- `core`: shared Banese runtime, HTTP, credentials, status mapping and error
  normalization.
- `internal`: geradores proprios e modulares de boleto/carne em PDF.

Checkout dispatch and route selection live in `../gateways`. Boleto is enabled
only in sandbox for the July/2026 homologation. The adapter allocates a unique
`NossoNumero`, stores the bank-returned digitable line/barcode and opens the
authenticated student finance page. Production routes remain unchanged.

The bank confirmed on 2026-07-16 that agreement `15528` returns only the
digitable line and barcode in homologation. In production, BolePix will be
activated on the same boleto and the boleto API will also return its Pix QR.
Do not create a second Pix charge, simulate these values or fall back silently
to another provider.

Discount, fine and interest are sent in the registered title and are never
derived only for display. After `POST`, the adapter immediately reads the title
back and persists an immutable `gateway_financial_terms` snapshot only when the
bank response matches the request. Existing pending sandbox titles may be
repaired idempotently with `PUT` to the same `NossoNumero`, followed by another
read; production repair remains blocked until homologation is formally closed.

Banese also confirmed that a payment webhook exists, but explicitly recommended
active boleto queries as the primary and more stable reconciliation mechanism.
The webhook route stays fail-closed until Banese provides its authentication,
payload, retry and event identity contract. The current reconciliation only
settles locally after status code `3` is accompanied by complete effective
payment details with matching amount and a valid payment date; this conservative
rule protects against temporarily inconsistent bank responses. The amount
check uses the bank-confirmed discount, fine and interest for the effective
payment date, including cent rounding, rather than requiring the nominal value.
An isolated
worker claims up to ten stale titles with `SKIP LOCKED` and polls the bank every
five minutes; its request is authenticated with a random Vault secret.

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
  checkout URL. The student portal renders both values in an authenticated
  boleto view and the gestor API can reconcile a receivable by polling Banese.
- The bank requires a homologation mass of 10 future-dated boletos with varied
  values above R$ 10.00 before production release.

### Pix / SAB Guias reference

The PDF found outside the official homologation package describes a separate
SAB Guias integration. According to Banese's direct answer, this separate flow
is not required to add BolePix to agreement `15528`: production activation is
performed by the bank and the boleto creation response will include the QR.
Keep the notes below only as technical reference; do not call these endpoints
for the current boleto flow without an explicit new contract from Banese.

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
- The manual mentions `/manutencao/webhook/{chave}`, but it is not treated as
  the confirmed webhook contract of the boleto API.
- Required `Terminal` header according to the available manual:
  - Sandbox: `99000090054`.
  - Production: `99000090049`.
- Confirm with Banese whether the certificate endpoint is really spelled
  `/manutencao/cerificado`, as written in the manual, or `/manutencao/certificado`.
