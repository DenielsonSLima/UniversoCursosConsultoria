# Mercado Pago adapter

This folder is reserved for the Mercado Pago implementation. Keep the same internal
boundaries used by Asaas so payment bugs can be isolated by provider and by
business flow.

## Modules

- `core`: shared Mercado Pago runtime, HTTP, credentials, status mapping and error normalization.
- `ead`: EAD checkout behavior through Mercado Pago.
- `tecnico`: technical course enrollment, installments and monthly payment behavior.
- `livres`: free course checkout behavior.
- `especializacao`: specialization checkout behavior.
- `outros-creditos`: detached financial links from Financeiro > Outros Creditos.
- `webhook`: Mercado Pago webhook validation, idempotency and event translation.

## Boundary

Do not share provider-specific HTTP payloads with other providers. The central
gateway route decides that Mercado Pago should be used; files in this folder
translate the generic payment intent into Mercado Pago calls.
