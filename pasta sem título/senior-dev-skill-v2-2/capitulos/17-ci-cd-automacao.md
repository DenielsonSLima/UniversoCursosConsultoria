# Capítulo 17 — CI/CD e Automação de Padrões

**Duração:** 20 min | **Nível:** Avançado | **Pré-requisito:** Cap. 10, 15

> Uma regra que depende de memória humana vai falhar.
> Uma regra automatizada no pipeline falha ruidosamente e cedo.
> Este capítulo transforma o checklist do Cap. 15 em código que roda sozinho.

---

## Filosofia

```
❌ "Lembre de verificar o service_role antes do PR"
✅ Pipeline que bloqueia o PR se service_role aparecer no frontend

❌ "Confira se todas as tabelas têm RLS"
✅ Query SQL que roda no CI e falha se encontrar tabela sem RLS

❌ "Tsc não pode ter erros"
✅ npm run typecheck no CI — PR não mergeia com erro de tipo
```

O objetivo não é substituir julgamento humano — é eliminar os erros que
não precisam de julgamento humano para ser detectados.

---

## Pipeline Completo (GitHub Actions)

```yaml
# .github/workflows/ci.yml

name: CI — Padrões de Engenharia

on:
  pull_request:
    branches: [main, develop]

jobs:
  # ─── 1. Qualidade de Código ────────────────────────────────────────────
  qualidade:
    name: TypeScript + Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci

      # ✅ Zero erros de tipo — sem `any`, sem cast inválido
      - name: TypeScript strict
        run: npm run typecheck
        # Equivale a: tsc --noEmit --strict

      # ✅ Regras de lint (ESLint com regras do time)
      - name: ESLint
        run: npm run lint

  # ─── 2. Segurança — Regras #1 e #2 ────────────────────────────────────
  seguranca:
    name: Segurança — service_role e chamadas diretas
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # ✅ REGRA #2 — service_role nunca no frontend
      - name: Verificar service_role no frontend
        run: |
          if grep -rn "SERVICE_ROLE\|service_role" src/ --include="*.ts" --include="*.tsx"; then
            echo "❌ FALHA: service_role encontrado no frontend! Violação da Regra #2."
            echo "   service_role só pode existir em supabase/functions/"
            exit 1
          fi
          echo "✅ service_role ausente do frontend"

      # ✅ REGRA #1 — componentes .tsx não devem importar supabase diretamente
      - name: Verificar imports diretos de supabase em componentes
        run: |
          VIOLATIONS=$(grep -rn "from.*supabase" src/ --include="*.tsx" \
            | grep -v "\.service\.\|\.hooks\.\|supabase/client\|__tests__" || true)
          if [ -n "$VIOLATIONS" ]; then
            echo "❌ FALHA: imports do Supabase em arquivos .tsx que não são service/hooks:"
            echo "$VIOLATIONS"
            echo "   Componentes não devem chamar Supabase diretamente. Use services/hooks."
            exit 1
          fi
          echo "✅ Nenhum import direto de Supabase em componentes"

  # ─── 3. Banco de Dados — Regras #3 e #4 ───────────────────────────────
  banco:
    name: Banco — RLS e organization_id
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:15.1.0.117
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1

      - name: Iniciar Supabase local
        run: supabase start

      - name: Aplicar migrações
        run: supabase db reset

      # ✅ REGRA #4 — RLS habilitada em todas as tabelas de cliente
      - name: Verificar RLS em todas as tabelas
        run: |
          TABLES_SEM_RLS=$(psql "$DATABASE_URL" -t -c "
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
            AND tablename NOT IN ('schema_migrations', 'supabase_functions')
            AND rowsecurity = false;
          " | tr -d ' \n')

          if [ -n "$TABLES_SEM_RLS" ]; then
            echo "❌ FALHA: Tabelas sem RLS encontradas: $TABLES_SEM_RLS"
            echo "   Toda tabela de dados de cliente deve ter RLS habilitada."
            exit 1
          fi
          echo "✅ Todas as tabelas têm RLS habilitada"

      # ✅ REGRA #3 — tabelas relevantes têm organization_id
      - name: Verificar organization_id nas tabelas de cliente
        run: |
          TABLES_SEM_ORG=$(psql "$DATABASE_URL" -t -c "
            SELECT t.tablename
            FROM pg_tables t
            LEFT JOIN information_schema.columns c
              ON c.table_name = t.tablename
              AND c.column_name = 'organization_id'
              AND c.table_schema = 'public'
            WHERE t.schemaname = 'public'
            AND t.tablename NOT IN (
              'organizations', 'organization_members',
              'schema_migrations', 'supabase_functions'
            )
            AND c.column_name IS NULL;
          " | grep -v '^$' || true)

          if [ -n "$TABLES_SEM_ORG" ]; then
            echo "⚠️  AVISO: Tabelas sem organization_id: $TABLES_SEM_ORG"
            echo "   Verifique se estas tabelas deveriam ter isolamento por empresa."
          fi
          echo "✅ Verificação de organization_id concluída"

  # ─── 4. Testes ──────────────────────────────────────────────────────────
  testes:
    name: Testes Automatizados
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - uses: supabase/setup-cli@v1

      - name: Iniciar Supabase
        run: supabase start

      - name: Aplicar migrações
        run: supabase db reset

      # ✅ Testes unitários com cobertura
      - name: Testes unitários
        run: npm run test:coverage

      # ✅ Garante cobertura mínima em lógica crítica
      - name: Verificar cobertura mínima
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 70" | bc -l) )); then
            echo "❌ FALHA: Cobertura de testes $COVERAGE% abaixo do mínimo de 70%"
            exit 1
          fi
          echo "✅ Cobertura: $COVERAGE%"

  # ─── 5. Build de Produção ───────────────────────────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [qualidade, seguranca, testes]  # só roda se os anteriores passaram
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

---

## Regras de Merge

Configure no GitHub (Settings → Branches → Branch protection):

```
Branch: main
✅ Require status checks to pass before merging:
   - qualidade
   - seguranca
   - banco
   - testes
   - build
✅ Require at least 1 approving review
✅ Dismiss stale reviews when new commits are pushed
✅ Require review from Code Owners
```

---

## CODEOWNERS — Guardião por Área

```
# .github/CODEOWNERS

# Padrões de engenharia — qualquer mudança no Skill exige revisão do grupo sênior
/senior-dev-skill-v2/   @grupo-senior

# Banco de dados — migrações exigem revisão de quem conhece o schema
/supabase/migrations/   @dev-backend-senior

# Edge Functions — código de servidor exige revisão de segurança
/supabase/functions/    @dev-backend-senior

# Módulo financeiro — alto impacto, revisão obrigatória
/src/modules/financeiro/ @dev-senior-financeiro @grupo-senior
```

---

## Automação de Tipos do Banco

Execute sempre que o schema mudar. Pode ser automatizado como hook de migração:

```bash
#!/bin/bash
# scripts/gen-types.sh — rodar após toda migração

echo "Gerando tipos TypeScript a partir do schema..."
supabase gen types typescript --local > src/types/database.types.ts

echo "Verificando se tipos compilam..."
npx tsc --noEmit

echo "✅ Tipos atualizados em src/types/database.types.ts"
```

---

## Script de Verificação Local (pré-commit)

Adicione ao `package.json` para rodar localmente antes de commitar:

```json
{
  "scripts": {
    "pre-commit": "npm run typecheck && npm run lint && npm run test",
    "ci:check-security": "grep -rn 'SERVICE_ROLE' src/ && echo 'FALHA' || echo 'OK'",
    "ci:check-rls": "psql $DATABASE_URL -c \"SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false\""
  }
}
```

---

## O que o CI Não Substitui

O pipeline automatiza verificações mecânicas. Ele **não substitui**:

| Automatizado (CI) | Humano (Code Review) |
|---|---|
| `any` no TypeScript | Lógica de negócio correta |
| service_role no frontend | Casos de borda não testados |
| Tabelas sem RLS | Nomenclatura semântica |
| Cobertura de testes | Legibilidade e manutenibilidade |
| Build quebrado | Decisões de arquitetura |
| Lint violations | Conformidade com o BRD |

---

## Perguntas de Revisão

1. O CI passou em tudo mas o code review encontrou service_role numa Edge Function
   chamando uma API externa com segredos hardcoded. O CI deveria ter pego isso?
   → Não. Segredos em Edge Functions são válidos — o problema é hardcoded vs variável de ambiente. Isso é revisão humana.

2. Um agente de IA gerou código e quer fazer deploy direto. É possível sem o CI?
   → Não. Todo código passa pelo pipeline, independente da origem. CI trata humanos e agentes de IA igualmente.

3. O pipeline de RLS está dando falso positivo em uma tabela de configuração
   que intencionalmente não tem RLS. Como resolver?
   → Adicione essa tabela à lista de exclusões no script e documente no comentário do SQL por que RLS não se aplica.
