# Lote ativo

Estado: `PUBLICADO`

## Lote: 2026-08-12-cobranca-isolada-dependencia-academica

- Estado: PUBLICADO.
- Objetivo: isolar a cobrança da disciplina refeita da matrícula, do cronograma e das condições financeiras da turma técnica.
- Escopo incluído: política própria por disciplina/polo; snapshot imutável de desconto, juros e multa; uma cobrança Banese; vencimento único; descrição neutra; prazo bancário e visual de 60 dias; portal/PDF sem turma, curso ou motivo da reprovação; baixa e estorno auditáveis.
- Fora de escopo: alterar parcelas do curso técnico, transferir o aluno para a turma inteira, reprificar títulos históricos, criar carnê, aceitar Pix ou mudar a classificação contábil legada de mensalidade nesta entrega.
- Regras aplicáveis: GitHub e Supabase exclusivamente por MCP; uma parcela; `matricula_id` nula; `tipo_lancamento=DEPENDENCIA`; liberação acadêmica somente após pagamento comprovado; nenhum smoke que crie cobrança real.
- Critérios de aceite: migration aplicada; 11 runtimes ativos com o mesmo `verify_jwt`; política padrão R$ 19,90 / 1% / 2%; descrição `Disciplina: X`; 60 dias no payload e no documento; títulos legados compatíveis; 117 testes Deno, TypeScript, ESLint focal, `deno check`, build e revisão independente sem P0/P1.
- Produção Supabase: migration `20260812190154_isolate_dependency_reoffer_billing.sql` aplicada pelo MCP; runtimes ativos: `payment-checkout` v19, `checkout-api` v14, `asaas-api` v79, `asaas-webhook` v34, `payment-gateway-api` v16, `payment-gateway-webhook` v9, `banese-student-payment` v10, `banese-boleto-document` v12, `banese-reconciliation-worker` v24, `banese-cnab240-api` v9 e `dependencia-banese-checkout` v6.
- Smoke visual: pendente porque nenhum navegador interno ou externo estava conectado à sessão; contratos e verificações remotas falharam fechados sem criar título.
- Publicação GitHub/Vercel: PR [#71](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/71) aprovada e mesclada em `main` no commit [`6a399b06`](https://github.com/DenielsonSLima/UniversoCursosConsultoria/commit/6a399b06bb3b0be158abfe1a232c5b86a932d495). A [implantação Vercel de Produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/GVjnaPAh4PufDxrnPgigCRHSPs5u) está pronta.
