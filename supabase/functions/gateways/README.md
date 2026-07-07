# Gateway modules

This folder owns the provider-neutral banking flow.

## Public endpoint mapping

- `payment-checkout` -> `checkout/index.ts`
- `checkout-api` -> `checkout-api/index.ts`
- `payment-gateway-api` -> `api/index.ts`
- `payment-gateway-webhook` -> `webhook/index.ts`

## Modules

- `router.ts`: central route dispatcher for provider + payment method.
- `checkout`: public online checkout router.
- `checkout-api`: compatibility checkout for flows not fully migrated.
- `api`: banking integration configuration API.
- `webhook`: provider-neutral webhook entrypoint.
- `pix`, `boleto`, `cartao`: method dispatch to each provider adapter.
