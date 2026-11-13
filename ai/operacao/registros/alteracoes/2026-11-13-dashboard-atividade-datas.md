# Datas da atividade recente

## Problema e comportamento

A atividade recente abreviava duração como “5h” e convertia a data financeira sem hora em timestamp. A correção mostra DD/MM/AAAA para pagamentos e duração legível para matrícula/documento com offset real. Dados inválidos ou ausentes mostram “Data não informada”.

A nova RPC `get_dashboard_recent_activity_v2` preserva filtros, guards, grants, limites e a chave legada de ordenação. A RPC original permanece intacta para clientes antigos. `created_at` de cobrança sem data serve somente à ordenação.

## Autorização e publicação

O usuário pediu o ajuste e, após a confirmação de envio dos sete arquivos e PR draft, respondeu “Autorizo produção”. A entrega acrescenta os registros operacionais e a versão exigidos pelo CI. Nenhuma mutação de dados financeiros ou acadêmicos faz parte do lote.

Base: main `690f19cc20118bee2d0d423075b2cf800293846c` (Caixa 4.8.337 já integrado). Entrega: 4.8.338, revisão 347. A versão 4.8.336 permanece reservada ao lote paralelo de e-mail/login.

## Validação

- Regressão antes do patch: oito testes falharam, incluindo DATE exibida como “18h”.
- Depois: 23 testes Node/PGlite passaram, com execução da migration real e da RPC legada em banco isolado.
- Apresentação passou em UTC, America/Sao_Paulo, Pacific/Kiritimati e America/New_York; cobre dia inválido, ano bissexto, meia-noite real, offsets, horário de verão e valores futuros.
- Serviço preserva a ordem e a data textual; PostgreSQL cobre escopo, widget, permissões acadêmicas/financeiras/biblioteca, anon e limites.
- Build completo, ESLint e limite de linhas passaram antes da preparação operacional; executar os gates finais na PR.
- Migration aplicada pelo MCP: `20261113184005` / `dashboard_activity_civil_dates`.
- Consulta real somente leitura: 20 atividades, mesma ordem e conteúdo, precisão preservada; três pagamentos com datas civis.
- Hash da função original permaneceu `73f9ead0c90c856e8217c92c006739ce`; anon sem EXECUTE, authenticated/service_role com EXECUTE, search_path vazio e ausência de identidade recusada.
- Nenhum registro foi alterado. Migrations aplicadas anteriores permanecem imutáveis.

## Limites e sequência de entrega

Smoke visual/autenticado permanece pendente: Chromium local não iniciou sockets e o navegador remoto não alcançou o servidor local. HTTP, build e testes não substituem esse smoke. A PR nasce draft e só deve ser integrada após os gates e revisão; a migration precede o frontend. Evidências finais de CI, Preview e produção ficam na PR.

## Manifesto explícito

Total: 13 arquivos.

- `modules/gestor/dashboard/dashboard.presentation.ts`
- `modules/gestor/dashboard/dashboard.service.ts`
- `supabase/migrations/20261113184005_dashboard_activity_civil_dates.sql`
- `modules/gestor/dashboard/dashboard-activity.presentation.test.ts`
- `modules/gestor/dashboard/dashboard-activity.service.test.mjs`
- `supabase/tests/dashboard_recent_activity.isolated.test.mjs`
- `.github/workflows/dashboard-activity-dates.yml`
- `ai/operacao/registros/alteracoes/2026-11-13-dashboard-atividade-datas.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
