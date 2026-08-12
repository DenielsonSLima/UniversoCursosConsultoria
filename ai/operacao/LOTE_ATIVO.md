# Lote ativo

Estado: `PUBLICADO`

## Lote: 2026-08-12-estabilizacao-4-2-0

- Estado: PUBLICADO.
- Objetivo: promover `4.2.0-beta.2` para a versão estável `4.2.0`, corrigindo os gates encontrados na revisão de produção.
- Escopo incluído: compositor vetorial e Blob único dos cinco relatórios financeiros separados; datas civis de Maceió em criação/baixa de empréstimos; republicação dos nove runtimes financeiros; atualização de versão, changelog e registros operacionais.
- Fora de escopo: reprecificação, alteração de títulos/documentos históricos, criação de cobrança real e reexecução de migrations já aplicadas.
- Regras aplicáveis: GitHub e Supabase exclusivamente por MCP; cálculos financeiros no backend; PDF vetorial e Blob canônico; manter os `verify_jwt` já configurados por função.
- Critérios de aceite: versão/changelog consistentes; contratos focados, TypeScript, lint, build e diff-check aprovados sob Node 24; inspeção de PDF com texto extraível, sem imagem de página e renderização visual aprovada; nove Edge Functions ativas na versão nova; PR/CI/Preview, merge em `main` e Vercel Produção confirmados.
- Validação concluída: `test:financial-report-pdf` 4/4, incluindo rejeição explícita de linha incompatível com A4; `test:pdf-exports` aprovado e a dívida raster reduziu de 9 para 8 fluxos; contratos Deno de data Maceió e empréstimos 9/9; inspeção Poppler do novo PDF confirmou duas páginas A4, texto extraível e nenhum recurso de imagem; `deno check` dos nove entrypoints aprovado. A CI remota da árvore isolada aprovou instalação, TypeScript, lint, testes e build sob Node 24; o controle de versão também foi aprovado.
- Produção Supabase: migrations de 11–12/ago já estavam aplicadas; os nove runtimes incompatíveis foram republicados por MCP: `banese-cnab240-api` v8, `payment-checkout` v18, `checkout-api` v13, `payment-gateway-api` v15, `payment-gateway-webhook` v8, `asaas-api` v77, `asaas-webhook` v33, `dependencia-banese-checkout` v5 e `banese-reconciliation-worker` v23. As confirmações remotas encontram o snapshot de plano único, CNAB e ativação EAD pela primeira parcela nos bundles ativos.
- Node local: alinhado a `v24.19.0` (engines `24.x`).
- Publicação GitHub/Vercel: PR [#67](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/67) aprovada e mesclada por squash em `main` no commit [`a8989718`](https://github.com/DenielsonSLima/UniversoCursosConsultoria/commit/a8989718366fe668d285419f653ec33816a7afb9). A [implantação Vercel de Produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/QR6xUP8a8zwdhbMrNhVdpmUb1e8A) está pronta.
- Responsável pela consolidação: Codex, com revisão independente de financeiro, interface/PDF e manifestos de Edge Functions.
