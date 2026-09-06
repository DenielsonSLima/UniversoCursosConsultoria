# Datas do pagamento e da confirmação

Estado: validação local concluída; publicação em produção autorizada em 06/09/2026.

## Diagnóstico e correção

A evidência bancária persistida e a RPC real do Caixa confirmaram que o
pagamento na virada do mês pertence ao dia bancário anterior à confirmação
pelo sistema. A Conciliação destacava somente o registro da confirmação.
A correção exibe as duas datas separadamente sem alterar competências,
valores, backend ou dados. O histórico não inventa confirmação ausente.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-06-datas-pagamento-confirmacao.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-25-parte-1.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.test.tsx`

- `scripts/test-caixa-report.mjs`

Total: 9 arquivos

## Validação

- Cinco testes de renderização aprovados: virada de mês, confirmação no dia
  seguinte, histórico sem registro, pagamento ausente e baixa manual.
- Componente inspecionado no Safari com dados fictícios em desktop e 390 px.
- Fluxo autenticado anterior reproduzido e datas conferidas via MCP Supabase.
- Publicação inclui apenas o manifesto; artefatos temporários ficam de fora.
- Revisão independente aprovada sem bloqueadores.
- Os cinco testes integram o comando test:caixa-report: 52 testes aprovados.
- TypeScript, lint focado, teto de linhas e build de produção aprovados.
- Preview, CI remoto e smoke autenticado pós-deploy serão conferidos na entrega.
