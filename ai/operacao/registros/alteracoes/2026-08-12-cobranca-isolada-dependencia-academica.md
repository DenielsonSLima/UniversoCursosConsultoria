# Alteração — Cobrança isolada de Dependência Acadêmica

- Lote: `2026-08-12-cobranca-isolada-dependencia-academica`
- Estado no fechamento: `PUBLICADO`
- Projeto Supabase: `kfekgwyqozhicpfuunpo`

## Resultado

- A reprovação consolidada continua na matrícula original; o encaminhamento inclui o aluno somente no diário da disciplina compatível.
- A confirmação cria uma única cobrança avulsa `DEPENDENCIA`, sem `matricula_id`, sem número de parcela e sem cronograma técnico.
- Valor proporcional, desconto de pontualidade, juros e multa pertencem a uma política própria da dependência e ficam congelados no recebível.
- A apresentação ao aluno e o boleto mostram somente `Disciplina: nome`, sem turma, curso, matrícula ou texto de reprovação.
- O aviso `SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.` está alinhado ao prazo efetivo enviado ao Banese.
- Cobranças novas aceitam somente boleto Banese; retorno Pix falha fechado para revisão e não libera a disciplina.

## Banco e segurança

- A migration `20260812190154_isolate_dependency_reoffer_billing.sql` foi aplicada pelo MCP e ficou alinhada ao ledger remoto.
- A trigger materializa e protege o snapshot, preserva títulos históricos sem reprificação e exige evidência bancária ou baixa presencial auditável antes de `PAGO`.
- A baixa presencial é rejeitada após 60 dias antes de cancelar o título remoto; o estorno devolve a cobrança ao fluxo especializado de Dependências.
- O caminho genérico de sincronização não pode emitir uma dependência nova nem persistir Pix/URL por desvio.

## Edge Functions publicadas

- `payment-checkout` v19 (`verify_jwt=false`)
- `checkout-api` v14 (`verify_jwt=false`)
- `asaas-api` v79 (`verify_jwt=true`)
- `asaas-webhook` v34 (`verify_jwt=false`)
- `payment-gateway-api` v16 (`verify_jwt=true`)
- `payment-gateway-webhook` v9 (`verify_jwt=false`)
- `banese-student-payment` v10 (`verify_jwt=true`)
- `banese-boleto-document` v12 (`verify_jwt=true`)
- `banese-reconciliation-worker` v24 (`verify_jwt=false`)
- `banese-cnab240-api` v9 (`verify_jwt=true`)
- `dependencia-banese-checkout` v6 (`verify_jwt=true`)

## Validações

- Reunião de revisão com três agentes independentes: sem bloqueadores P0/P1 no estado final.
- Bateria focal final: 117 testes Deno aprovados, zero falhas.
- TypeScript, ESLint focal, `deno check` dos entrypoints afetados, `git diff --check` e build de produção aprovados.
- Verificação remota: coluna/snapshot presentes; três encargos próprios disponíveis; duas políticas vigentes em R$ 19,90 / 1% / 2%; zero recebível snapshotado violando matrícula nula/parcela única.
- Advisors executados após a DDL; os avisos relacionados são informativos ou reconhecem RPCs `SECURITY DEFINER` com RBAC interno intencional.
- O navegador estava sem conexão (`No browser is available`), portanto o smoke visual autenticado permanece registrado como pendência, sem substituir a validação por criação de cobrança real.

## Publicação

- Supabase de produção concluído sem criar, emitir, pagar ou alterar uma cobrança real.
- A PR [#71](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/71) passou por controle de versão, TypeScript, lint, testes, build e Preview; foi mesclada em `main` no commit [`6a399b06`](https://github.com/DenielsonSLima/UniversoCursosConsultoria/commit/6a399b06bb3b0be158abfe1a232c5b86a932d495).
- A [implantação Vercel de Produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/GVjnaPAh4PufDxrnPgigCRHSPs5u) concluiu com sucesso.
- Os 189 caminhos locais de outros lotes permaneceram fora do manifesto e não foram enviados nesta publicação.
