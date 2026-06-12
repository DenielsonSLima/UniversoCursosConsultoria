# ADR-003: Multitenancy por RLS em vez de Banco por Empresa

**Data:** 2024-01-01
**Status:** Aceito
**Decidido por:** Grupo de Desenvolvedores Sênior

## Contexto

O sistema atende múltiplas empresas. Precisávamos decidir como isolar os dados entre elas.

## Opções Consideradas

1. **Banco separado por empresa** — isolamento físico total, mas: custo alto, migrações em N bancos, escalabilidade limitada
2. **Schema separado por empresa** — isolamento de schema no mesmo banco, mas: complexidade operacional alta, difícil de gerenciar com Supabase
3. **RLS com organization_id** — mesmo banco, mesmo schema, isolamento lógico via PostgreSQL RLS — padrão SaaS moderno

## Decisão

**RLS com `organization_id`** em todas as tabelas de dados de cliente.

## Consequências

- ✅ Uma migração atualiza todos os tenants
- ✅ Custo de infraestrutura: uma instância Supabase serve N empresas
- ✅ RLS no PostgreSQL é battle-tested — Google, GitHub usam modelo similar
- ✅ Supabase Auth integra com RLS via `auth.uid()` nativamente
- ✅ Realtime respeita RLS — eventos chegam filtrados por organização
- ⚠️ Toda tabela de dados DEVE ter `organization_id` — disciplina de design obrigatória
- ⚠️ Bug de RLS expõe dados de todas as empresas — testes de isolamento são obrigatórios
- ⚠️ Operações que precisam de acesso cross-tenant exigem `SECURITY DEFINER`
