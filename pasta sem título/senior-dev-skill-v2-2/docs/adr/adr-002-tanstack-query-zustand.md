# ADR-002: TanStack Query + Zustand em vez de Redux

**Data:** 2024-01-01
**Status:** Aceito
**Decidido por:** Grupo de Desenvolvedores Sênior

## Contexto

Precisávamos de gerenciamento de estado no frontend para:
- Dados do servidor (listas, registros, contadores) com cache
- Estado de UI (empresa ativa, filtros, navegação)
- Sincronização com Realtime do Supabase

## Opções Consideradas

1. **Redux Toolkit** — padrão consolidado, mas verboso para dados de servidor, exige boilerplate para cache
2. **TanStack Query + Zustand** — TanStack Query para servidor, Zustand para UI — cada ferramenta faz uma coisa bem
3. **Context API + useReducer** — sem dependências externas, mas sem cache, sem retry, sem deduplicação

## Decisão

**TanStack Query para dados do servidor + Zustand para estado de UI.**

Separar as duas responsabilidades elimina a mistura de dados de servidor com estado de UI que causa bugs em Redux mal configurado.

## Consequências

- ✅ Cache automático de dados do servidor sem boilerplate
- ✅ Deduplicação de requests — mesma query em 2 componentes = 1 fetch
- ✅ Background refetch, retry, refetchOnFocus prontos
- ✅ Zustand leve (< 1kb) para estado de UI sem overhead
- ✅ Integração direta com Supabase Realtime via `invalidateQueries`
- ⚠️ Dois sistemas para aprender — curva inicial maior que Redux
- ⚠️ Distinção clara de "o que é estado de servidor vs estado de UI" exige disciplina
