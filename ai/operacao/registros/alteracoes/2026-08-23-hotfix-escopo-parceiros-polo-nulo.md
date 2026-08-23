# Hotfix de escopo de Parceiros com polo nulo — 2026-08-23

Estado: `APLICADO_SUPABASE_PRODUCAO`

## Objetivo

Fechar o bypass no qual um Gestor local era autorizado pelos helpers de
Parceiros quando `polo_id` era nulo, mesmo sem interseção entre os polos do
registro e o escopo efetivo do usuário.

## Autorização e ambiente

- Aplicação autorizada explicitamente pelo responsável na conversa em
  2026-08-23 com a instrução `aplique`.
- Projeto confirmado: `kfekgwyqozhicpfuunpo`.
- Operação executada exclusivamente pelo MCP Supabase.
- Migration remota: versão `20260823135522`, nome
  `close_null_partner_polo_gestor_scope`.
- Fonte local SHA-256:
  `9800fc9a23b5005ceac9285f945170ca52bf6037156d4accfb41cf00ef0acc99`.

## Mudança aplicada

- `is_partner_in_gestor_scope(uuid, uuid[])` e
  `is_partner_in_gestor_read_scope(uuid, uuid[])` agora exigem polo primário
  não nulo compatível ou interseção explícita e não nula em `polo_ids`.
- Gestor global continua autorizado, condicionado aos módulos existentes.
- Os helpers permanecem `STABLE`, `SECURITY DEFINER`, com `search_path = ''`.
- `anon` e `PUBLIC` não executam os helpers; `authenticated` e `service_role`
  preservam o grant mínimo necessário.
- Nenhuma policy, tabela ou dado operacional foi criado, alterado ou excluído.

## Preflight

A primeira checagem, antes do `apply_migration`, detectou seis usos inválidos de
`pg_catalog.coalesce`. Como `COALESCE` é expressão especial do PostgreSQL, a
fonte foi corrigida para `coalesce`, o contrato passou a proibir a regressão e
a contrarrevisão aprovou o novo hash. A tentativa de preflight falhou dentro de
transação e não criou entrada no ledger nem alterou o schema.

## Validação real

- Antes: Gestor local com um polo permitido recebia `true` para escopo nulo e
  via 6 Parceiros, 4 deles com `polo_id` nulo.
- Depois: o mesmo perfil recebe `false` para escopo nulo, continua recebendo
  `true` para o polo permitido e `false` para polo externo; passou a ver 2
  Parceiros e zero registro com polo primário nulo.
- Interseção válida em `polo_ids` continua autorizada; array somente com nulo
  é negado.
- Gestor global real preservou leitura e escrita para escopo nulo ou arbitrário.
- Identidade autenticada sem papel recebeu `false` e zero linha por RLS.
- Ledger passou de 716 para 717 migrations.
- Advisors permaneceram no baseline: segurança 470 (49 `INFO`, 421 `WARN`) e
  performance 252 (232 `INFO`, 20 `WARN`).
- Contrato local: 4/4 testes aprovados.
- Contrarrevisão final: nenhum achado Critical, Important ou Minor.

## Manifesto

- `supabase/migrations/20260822162200_close_null_partner_polo_gestor_scope.sql`
- `supabase/tests/partner_gestor_polo_scope_fail_closed.contract.test.ts`
- `ai/operacao/registros/alteracoes/2026-08-23-hotfix-escopo-parceiros-polo-nulo.md`

## Limites

Este hotfix aplicou somente a migration no Supabase. As alterações locais de
frontend, login e multiacesso analisadas no mesmo trabalho não foram publicadas
no GitHub ou na Vercel por esta autorização.
