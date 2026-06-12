# ADR-001: Supabase em vez de Firebase

**Data:** 2024-01-01
**Status:** Aceito
**Decidido por:** Grupo de Desenvolvedores Sênior

## Contexto

Precisávamos de um backend gerenciado para um sistema multi-empresa com:
- Banco de dados relacional (dados financeiros com integridade referencial)
- Autenticação de usuários
- Isolamento de dados por empresa (multitenancy)
- Atualizações em tempo real
- Funções serverless para lógica de negócio segura

## Opções Consideradas

1. **Firebase (Firestore)** — banco NoSQL, ótima integração, mas sem SQL nativo, sem transações complexas, sem RLS granular por linha
2. **Supabase** — PostgreSQL real, RLS nativa, Edge Functions (Deno), Realtime via WebSocket, open source
3. **Backend próprio (NestJS + PostgreSQL)** — controle total, mas alta complexidade operacional, sem Realtime pronto, sem Auth pronto

## Decisão

**Supabase**, por ser a única opção que oferece PostgreSQL com RLS nativa — requisito crítico para multitenancy seguro — combinado com Auth, Realtime e Edge Functions prontos.

## Consequências

- ✅ RLS nativa do PostgreSQL garante isolamento entre empresas a nível de banco
- ✅ SQL puro para lógica financeira — transações atômicas, integridade referencial
- ✅ Auth, Realtime e Edge Functions sem infraestrutura própria
- ✅ Open source — pode ser auto-hospedado se necessário
- ⚠️ Edge Functions rodam em Deno (não Node) — algumas bibliotecas npm não funcionam direto
- ⚠️ Vendor lock-in moderado — migrar é possível mas custoso
