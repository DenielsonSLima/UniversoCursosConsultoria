# Sugestão do vencimento do próximo ciclo técnico

Data: 2026-09-01
Estado: publicação concluída em produção; smoke visual delegado

## Objetivo

Preencher o vencimento inicial do próximo ciclo com um mês após o último
boleto mensal do ciclo anterior, preservando o dia observado sempre que o mês
permitir. A sugestão continua editável e a data confirmada pelo gestor permanece
soberana na prévia, criação das cobranças e emissão BolePix.

## Diagnóstico

- O campo individual do segundo ciclo iniciava vazio no código local.
- A regra financeira da turma possui uma primeira data sugerida, mas ela não
  representa necessariamente o último boleto real da matrícula.
- Na matrícula exibida pelo usuário, a consulta somente leitura confirmou 12
  mensalidades do ciclo anterior, de 15/10/2025 a 15/09/2026. Portanto, a
  sugestão correta para o primeiro item do ciclo seguinte é 15/10/2026.
- A função canônica `public.data_vencimento_mensal` já limita dias 29–31 ao
  último dia existente no mês seguinte.

## Contrato da solução

- O backend obtém a maior `data_vencimento` somente entre parcelas que
  pertencem ao ciclo anterior.
- O vínculo aceita o run canônico e o mesmo legado já reconhecido pela
  elegibilidade: snapshot do ciclo, origem `ciclo-N-parc-*` ou
  `SISTEMA_ANTERIOR` no primeiro ciclo.
- Cobranças avulsas, matrícula e rematrícula não entram na data-base.
- Parcelas com número fora da quantidade estrutural do ciclo também ficam de
  fora, inclusive em históricos `SISTEMA_ANTERIOR`.
- Sem parcela anterior confiável, a sugestão é `null`; o sistema não inventa
  uma data da turma.
- A interface usa a data somente como valor inicial do input. O `onChange`
  continua livre e a prévia/generation recebem a data efetivamente escolhida.
- O diálogo é chaveado pela matrícula para nunca reaproveitar uma data editada
  caso a linha ativa seja trocada sem desmontagem intermediária.
- A publicação respeita a ordem obrigatória de backend primeiro e frontend
  depois, pois o parser passa a exigir o novo campo canônico, ainda que nulo.

## Validação local

- A consulta somente leitura no banco real confirmou 15/09/2026 como último
  boleto da matrícula mostrada e 15/10/2026 como resultado do helper canônico.
- 57 testes focados aprovaram o contrato SQL, os ciclos manuais adjacentes, o
  parser e o input controlado/editável.
- TypeScript, ESLint focado e `check:file-lines` foram aprovados.
- O build Vite isolado foi aprovado com 3.959 módulos transformados.
- Duas revisões independentes foram concluídas. Um risco de parcela legada
  extra e um risco de estado React reaproveitado foram encontrados, corrigidos
  e reaprovados; o parecer final não possui achado crítico ou importante.
- O smoke autenticado da prévia permanece delegado ao usuário após o frontend
  compatível chegar à produção; nenhuma emissão real foi feita na validação.

## Validação remota

- Projeto Supabase confirmado: `kfekgwyqozhicpfuunpo`.
- Migration registrada como `20260902024657`, com o nome
  `suggest_manual_cycle_due_from_last_boleto`.
- A matrícula de referência retornou estado `ELEGIVEL` e sugestão 15/10/2026.
- Uma prévia somente leitura com 20/10/2026 confirmou `INDIVIDUAL` como fonte e
  preservou a data escolhida em todo o payload, sem criar recebível ou título.
- A função auxiliar permanece sem execução para `anon`, `authenticated` e
  `service_role`; os advisors não apontaram alerta relacionado ao ajuste.

## Evidência de publicação

- PR #118 integrada por squash na `main` no commit
  `e68a419291e750fb702bb233fd808ea929833459`.
- Controle de versão `33584940578` e qualidade `33584940530` aprovados,
  incluindo contratos financeiros/BolePix e build de produção.
- Preview Vercel `D9x5QoVqhSZ7AqcBjwpS8stZnaTE` concluída com sucesso.
- Produção Vercel `7i64nsXQKfSU8cVtCwmGMBaTrsLC` pronta; o domínio
  `universocc.com.br` respondeu HTTP 200 e serviu o bundle da versão 4.8.26.
- Nenhuma cobrança real foi emitida durante a validação; o teste autenticado de
  emissão permanece sob responsabilidade manual do usuário.

## Limites

- Este lote não altera valores, desconto, juros, multa, quantidade de parcelas
  ou payload BolePix.
- A aplicação e a publicação foram autorizadas explicitamente pelo usuário em
  2026-09-01; o teste final de emissão será executado manualmente por ele.
- `LOTE_ATIVO.md` permanece apontando para o lote paralelo de carnês e baixa
  rápida, que não será sobrescrito por esta correção financeira independente.

## Manifesto explícito

- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `ai/operacao/registros/alteracoes/2026-09-01-sugestao-vencimento-proximo-ciclo-tecnico.md`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `supabase/migrations/20260902024657_suggest_manual_cycle_due_from_last_boleto.sql`
- `supabase/tests/manual_technical_cycle_due_suggestion.contract.test.ts`
