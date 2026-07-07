# Mercado Pago adapter

This folder is reserved for the Mercado Pago implementation. Keep the same internal
boundaries used by Asaas so payment bugs can be isolated by provider and by
business flow.

## Modules

- `core`: shared Mercado Pago runtime, HTTP, credentials, status mapping and error normalization.

Checkout dispatch, route selection and webhook entrypoints live in
`../gateways`. Provider-specific Mercado Pago HTTP payloads stay here under
`core` until each business flow needs its own isolated module.

## Boundary

Do not share provider-specific HTTP payloads with other providers. The central
gateway route decides that Mercado Pago should be used; files in this folder
translate the gateway payment intent into Mercado Pago calls.
