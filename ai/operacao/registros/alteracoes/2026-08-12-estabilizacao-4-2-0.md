# Alteração — Estabilização 4.2.0

- Lote: `2026-08-12-estabilizacao-4-2-0`
- Estado no fechamento: `PUBLICADO`
- Projeto Supabase: `kfekgwyqozhicpfuunpo`

## Resultado

- Os cinco relatórios financeiros separados deixam de usar a ponte rasterizada. O novo compositor `jsPDF` mantém textos, linhas e tabelas vetoriais, usa o cabeçalho institucional canônico e entrega o mesmo Blob para prévia, download e impressão.
- Criação e baixa de empréstimos passam a usar a data civil de `America/Maceio`, protegendo a operação contra virada UTC após 21h local.
- O Node local foi alinhado ao `v24.19.0`, compatível com `engines: 24.x`.

## Runtime financeiro

- A revisão remota confirmou que as migrations do plano único já estavam aplicadas, mas os bundles das funções de cobrança eram de julho. Os nove runtimes afetados foram republicados via MCP com o fecho completo de dependências e os mesmos `verify_jwt` configurados: `banese-cnab240-api` v8, `payment-checkout` v18, `checkout-api` v13, `payment-gateway-api` v15, `payment-gateway-webhook` v8, `asaas-api` v77, `asaas-webhook` v33, `dependencia-banese-checkout` v5 e `banese-reconciliation-worker` v23.
- A confirmação pós-deploy encontrou o snapshot de termos Banese, o preparo de CNAB e a ativação EAD por primeira parcela nos bundles ativos. Não houve migration, cobrança ou matrícula de teste criada nesta ação.

## Validações

- `npm run test:financial-report-pdf`: 4/4, incluindo a falha explícita para uma linha que não cabe integralmente em A4.
- `npm run test:pdf-exports`: aprovado; nenhuma captura raster nova e oito fluxos legados permanecem inventariados.
- Deno: data Maceió e ciclo de empréstimos 9/9.
- `deno check` dos nove entrypoints: aprovado sob Node `v24.19.0`; a CI remota da árvore isolada aprovou instalação, TypeScript, lint, testes e build sob Node 24, e o controle de versão também foi aprovado.
- O PDF de amostra foi inspecionado com Poppler: duas páginas A4, texto extraível, nenhuma imagem de página e renderização visual aprovada.

## Publicação

- A PR [#67](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/67) foi mesclada por squash em `main` no commit [`a8989718`](https://github.com/DenielsonSLima/UniversoCursosConsultoria/commit/a8989718366fe668d285419f653ec33816a7afb9).
- A [implantação Vercel de Produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/QR6xUP8a8zwdhbMrNhVdpmUb1e8A) concluiu com sucesso.
- Nenhuma cobrança, matrícula ou migration foi criada como smoke de produção; os fluxos financeiros foram verificados por contratos, bundles ativos e gates de publicação.
