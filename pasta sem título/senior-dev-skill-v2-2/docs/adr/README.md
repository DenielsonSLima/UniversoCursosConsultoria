# ADR — Architecture Decision Records

> Registra o *porquê* de cada decisão técnica importante.
> Um agente de IA ou dev novo lê um ADR e entende o raciocínio — não precisa adivinhar.

---

## O que é um ADR?

É um documento curto (máximo 1 página) que responde:
- Qual era o problema ou decisão a tomar?
- Quais opções foram consideradas?
- O que foi decidido?
- Por que essa opção?
- Quais as consequências?

---

## Template

```markdown
# ADR-[número]: [Título da Decisão]

**Data:** YYYY-MM-DD
**Status:** Proposto | Aceito | Substituído por ADR-XXX | Descontinuado
**Decidido por:** [nomes ou "grupo sênior"]

## Contexto
[Qual problema precisávamos resolver? Por que essa decisão era necessária?]

## Opções Consideradas
1. [Opção A] — [prós e contras em 1 linha]
2. [Opção B] — [prós e contras em 1 linha]
3. [Opção C] — [prós e contras em 1 linha]

## Decisão
[O que foi escolhido e por quê — seja direto]

## Consequências
- ✅ [Benefício que essa decisão traz]
- ✅ [Outro benefício]
- ⚠️ [Trade-off ou limitação aceita]
- ⚠️ [Outro trade-off]
```

---

## ADRs Existentes

| # | Decisão | Status |
|---|---|---|
| [ADR-001](adr-001-supabase-vs-firebase.md) | Supabase em vez de Firebase | Aceito |
| [ADR-002](adr-002-tanstack-query-zustand.md) | TanStack Query + Zustand em vez de Redux | Aceito |
| [ADR-003](adr-003-multitenancy-row-level.md) | Multitenancy por RLS em vez de banco por empresa | Aceito |
