# Asaas modules

This folder contains shared Asaas domain code used by the public Edge Functions.
The public endpoints remain stable:

- `asaas-checkout`
- `asaas-api`
- `asaas-webhook`
- `asaas-cancel-receivable`

## Modules

- `core`: runtime, HTTP, customer validation, payment status, money and checkout payload helpers.
- `ead`: EAD checkout rules. The charge value comes from the course registration.
- `livres`: Curso livre checkout rules. The charge value and financial adjustments come from the class.
- `especializacao`: Especializacao checkout rules, separated from livres for future custom rules.
- `tecnico`: Technical course checkout and cycle helpers.
- `avulsa`: Detached payment links for financial charges without enrollment/course.
- `webhook`: Shared webhook event and idempotency helpers.

## Boundaries

- Course checkout must not create detached payment links.
- Detached payment links without a customer are allowed only for `OUTROS_CREDITOS` without `matricula_id`.
- Payment creation, recovery by `externalReference`, and `CREATING` locks remain in the endpoint services until replay and concurrency tests cover them.
- Webhook remains a single endpoint and dispatches to handlers by payment context.
