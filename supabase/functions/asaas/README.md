# Asaas modules

This folder contains shared Asaas domain code used by the public Edge Functions.
The public endpoints remain stable:

- `payment-checkout`
- `checkout-api`
- `asaas-api`
- `asaas-webhook`
- `asaas-cancel-receivable`

## Modules

- `core`: runtime, HTTP, customer validation, payment status, money, payment method normalization and checkout payload helpers.
- `cursos`: shared online course checkout dispatch. It routes EAD, tecnico, livres and especializacao to their isolated Asaas modules.
- `ead`: EAD checkout rules. The charge value comes from the course registration, with separate files for payment methods, installments and installment-fee pass-through.
- `livres`: Curso livre checkout rules. The charge value and financial adjustments come from the class.
- `especializacao`: Especializacao checkout rules, separated from livres for future custom rules.
- `tecnico`: Technical course checkout and cycle helpers.
- `outros-creditos`: Detached payment links for financial charges without enrollment/course.
- `webhook`: Shared webhook event and idempotency helpers.

## Boundaries

- Course checkout must not create detached payment links.
- Detached payment links without a customer are allowed only for `OUTROS_CREDITOS` without `matricula_id`.
- EAD checkout enters through `payment-checkout` and routes by `gateways/<metodo>/<provedor>`.
- Non-EAD course checkout still uses the neutral `checkout-api` fallback until those modalities are migrated to the same gateway matrix.
- Webhook remains a single endpoint and dispatches to handlers by payment context.
