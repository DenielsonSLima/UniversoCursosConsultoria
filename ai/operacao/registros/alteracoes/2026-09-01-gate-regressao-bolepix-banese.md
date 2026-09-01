# Gate de regressão BolePix Banese

Data: 2026-09-01  
Estado: validação local concluída; aguardando publicação

## Objetivo

Reconciliar o workspace com o `main` remoto depois dos PRs #106 e #107,
publicar somente diferenças reais e impedir que o contrato de intenção durável
antes do POST Banese deixe de ser exercitado pelo CI.

## Diagnóstico

- O `main` remoto estava em `5a7dc7d`, com CI e produção Vercel aprovados.
- Dos 249 caminhos alterados desde o `HEAD` local, 244 arquivos e duas remoções
  coincidiam byte a byte com o GitHub.
- Três arquivos divergiam: dois apenas por formatação e um fixture de teste com
  o mock de `claim_banese_api_submission_attempt` ausente no remoto.
- O gate remoto não executava os 68 testes `adapter-*`; a falha do fixture podia
  permanecer invisível mesmo com o workflow verde.
- Um teste-fonte local preservava a allowlist e as guardas CAS da recuperação
  dos 13 recebíveis auditados, mas ainda não estava versionado nem no CI.

## Mudança

1. O fixture Banese retorna sucesso para o claim durável usado antes do POST.
2. O teste contratual da recuperação auditada passa a permanecer versionado.
3. O workflow executa 68 testes do adapter e três testes de segurança da
   recuperação antes do build.

Nenhum código funcional de runtime, migration, Edge Function, payload,
documento ou regra financeira muda neste lote. A versão 4.8.21 registra o
reforço obrigatório de testes e CI.

## Manifesto explícito

Total: 8 arquivos.

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-01-gate-regressao-bolepix-banese.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `supabase/functions/banese/core/adapter-test-fixtures.ts`
- `supabase/tests/banese_incident_recovery_safety.contract.test.ts`

## Exclusões explícitas

- `FINANCEIRO TURMA 42 IMPORTACAO/` e `turma 42/` contêm fontes/artefatos de
  importação e continuam fora do GitHub.
- As migrations locais `20260827163000`, `20260827170000` e `20260827171000`
  não possuem lote nem evidência de aplicação no ledger e não serão publicadas.
- `supabase/functions/deno.lock` é artefato gerado fora do manifesto.
- As duas diferenças somente de formatação em testes de incident recovery
  permanecem excluídas para manter o commit atômico.

## Validação

- Gate BolePix completo: 71/71 testes aprovados, incluindo 68 contratos do
  adapter e três guardas da recuperação auditada.
- Teto de 500 linhas, controle operacional e versão 4.8.21 aprovados.
- Índice RAG reindexado após o patch final e contrato operacional reaprovado.
- CI e Preview: pendentes do PR.

## Evidência de produção

Pendente do PR, checks, Preview, merge e deployment deste manifesto.
