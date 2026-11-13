# Caixa: Serviços NFS-e e relatório resumido

## Pedido e resultado

O Caixa passa a identificar os recebimentos realizados de Serviços NFS-e. O botão PDF abre um modal em tela cheia com duas opções: Completo, que conserva o relatório detalhado existente, e Resumido, que apresenta os agregados canônicos em duas páginas.

O recorte continua sendo o polo ou Resultado geral e a competência selecionados. Trocar o tipo não refaz a consulta nem altera o snapshot. Prévia e download usam exatamente o mesmo Blob; trocar polo, competência ou fechar o modal descarta gerações anteriores.

## Contrato financeiro

- A classificação resolve o recebível original pelo ledger fiscal ou pelo `financial_payment_events.source_id` de um pagamento parcial. O ID virtual do Caixa não vira uma nova dívida nem duplica o evento recebido.
- O valor realizado permanece o mesmo da projeção financeira canônica. A classificação retira os mesmos eventos de Outros Créditos e os apresenta como Serviços NFS-e.
- Autorização fiscal sem pagamento não entra como receita recebida. Eventos estornados deixam de contribuir, preservando os demais recebimentos confirmados.
- A exclusão operacional de empréstimos resolve igualmente o recebível original, inclusive para pagamentos parciais com ID virtual.
- O relatório conserva parcela e quantidade de parcelas do ledger e identifica serviço, número da NFS-e e descrição fiscal autorizada.
- Autorização, escopo de polo, períodos, contratos v7 e ACL das funções internas permanecem canônicos. Não se expõe consulta fiscal interna aos clientes.
- O Resumido usa os totais, compromissos, receitas por origem, despesas por categoria e posições complementares do payload existente. Não soma movimentos, recalcula regras financeiras nem desconta tarifa novamente.
- Dados complementares sem permissão continuam como acesso restrito; histórico insuficiente continua explícito. Indisponibilidade não vira saldo zero.

## Modelos e recursos PDF

Foi inventariado o encadeamento existente: `CaixaReportLauncher` → `CaixaReportPreviewModal` → `caixa-report.pdf` → compositor vetorial. O relatório do Caixa não tem um modelo próprio de capa, contracapa ou assinatura em Modelos Documentos. O cabeçalho aplicável é o compositor institucional canônico, também usado na prévia de Cabeçalho Institucional.

O contexto institucional foi extraído sem alterar o conteúdo, a paginação, os cabeçalhos ou os rodapés do Completo. Os dois tipos compartilham o mesmo snapshot institucional e a marca paisagem configurada, incluindo URL, opacidade, escala e rotação. O fallback existente continua restrito à ausência de configuração.

A conferência somente leitura das quatro unidades encontrou configuração de marca paisagem e retrato em todas elas. A matriz tem logo configurada e as filiais usam o fallback canônico quando não possuem logo própria. Não houve mudança de modelo ou configuração remota.

O Resumido reserva a primeira página aos totais, compromissos e composição; a segunda reúne todas as oito origens de receita e seis categorias de despesa da taxonomia atual, além das posições complementares. Texto, números, bordas e tabelas são nativos. O corpo dos dados usa fonte de pelo menos 8,5 pt. Conteúdo incompatível falha explicitamente em vez de cortar linhas, remover categorias ou diminuir indefinidamente a fonte.

## Validação

- Regressões normais: 172 testes aprovados, com duas verificações opcionais preexistentes ignoradas.
- Primeiro resumo, Realtime e escopo: sete testes aprovados.
- Contratos do PDF Completo: oito testes aprovados, conservando as seis páginas da fixture existente.
- Contratos do Resumido: quatro testes aprovados; todas as oito origens e seis categorias cabem em duas páginas, sem acessar movimentos individuais.
- Fixture exclusiva do Resumido: oito grupos de R$ 16.383,71 totalizam R$ 131.069,68; seis categorias de R$ 1.000,00 totalizam R$ 6.000,00; resultado canônico R$ 125.069,68. Os valores são estáticos na amostra e não alteram a fixture compartilhada do Completo.
- Extração nativa confirma os totais da primeira página, os oito valores e seis valores da segunda e sua correspondência com os agregados. A composição usa base igual ao total e encargos/descontos zero nessa amostra.
- Runner normal sem configuração DOM registra skip explícito; o workflow dedicado fornece JSDOM e exige o smoke. Configuração JSDOM inválida falha antes da execução.
- Smoke DOM do modal real: tela cheia, duas opções, teclado, um snapshot, mesmo Blob no download, troca de escopo, resposta antiga, fechamento, reabertura e liberação das URLs.
- Fonte Inter incorporada e operadores de texto confirmados; imagens restritas à logo e à marca d'água.
- Três PDFs sintéticos gerados; páginas do Resumido global, Resumido institucional e Completo renderizadas e inspecionadas sem cortes ou sobreposição.
- Revisões independentes financeira e de fluxo sem bloqueantes concretos. A taxonomia atual limitada a oito origens e seis categorias foi conferida no backend.
- TypeScript global, ESLint do manifesto de frontend e teto de 500 linhas aprovados.
- Backend: nove cenários SQL isolados cobrem classificação, pagamentos parciais, escopo, estorno, autorização, empréstimos e ACL.

Os arquivos temporários de PDF, PNG, logs e harnesses são regeneráveis e não integram o lote. Nenhuma operação fiscal, cobrança, pagamento ou alteração de produção foi usada como teste. O agente não abriu navegador; a inspeção interativa autenticada permanece com o usuário no acesso local.

## Estado e implantação

Candidato 4.8.328, revisão 337, empilhado sobre Serviços 4.8.327 (PR #416), commit `0f9bf4b8f458067467ff79ee3e9f6a74cde0180b`. A base herda PIX 4.8.325, retorno fiscal 4.8.326 e Auth/EAD publicados. O CI e a Preview serão conferidos na SHA exata do candidato antes da entrega.

As três migrations de classificação, prestação mensal e relatório foram aplicadas com sucesso via MCP antes da interface. A classificação histórica encontrou um recebível previamente vinculado a serviço; não criou dívida para uma nota antiga. O backend Serviços dependente já tem suas dezesseis migrations e quatro Edges publicados, com controle e cron ativos.

Não há nova migration a aplicar nesta etapa de frontend nem worker adicional a ativar para o Caixa. A inspeção interativa continua restrita ao acesso local do usuário.

## Manifesto explícito

Total: 25 arquivos. São 19 arquivos de implementação, testes e workflow, além dos seis metadados próprios do candidato. Alterações Auth, EAD, PIX, retorno fiscal e Serviços são herdadas da base e não integram este manifesto.

- `modules/gestor/caixa/report/caixa-report.presentation.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.context.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.tables.ts`
- `modules/gestor/caixa/report/CaixaReportTables.tsx`
- `modules/gestor/caixa/report/caixa-report.concise-pdf.ts`
- `modules/gestor/caixa/report/caixa-report.pdf.ts`
- `modules/gestor/caixa/report/CaixaReportPreviewModal.tsx`
- `modules/gestor/caixa/report/CaixaReportLauncher.tsx`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts`
- `modules/gestor/caixa/report/caixa-report.concise-pdf.test.ts`
- `modules/gestor/caixa/report/CaixaReportPreviewModal.interaction.test.mjs`
- `scripts/test-caixa-report.mjs`
- `supabase/migrations/20261112223000_caixa_nfse_service_classification.sql`
- `supabase/migrations/20261112223100_caixa_nfse_service_monthly.sql`
- `supabase/migrations/20261112223200_caixa_nfse_service_report.sql`
- `supabase/tests/caixa_nfse_services.fixture.sql`
- `supabase/tests/caixa_nfse_services.isolated.test.mjs`
- `.github/workflows/caixa-regressions.yml`

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-12-caixa-servicos-nfse-pdf-resumido.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-257.md`

## Publicação confirmada

PR #417 integrada em `3c3d5d9fa6c8bf38687b8dd29d70007f7d27e982`, versão 4.8.328, após 16/16 workflows aprovados e Preview READY na SHA `ad2240ac6628433cfc4743014196861d891badf1`. Produção Vercel `dpl_DwjjQJfAuBh4QDhvajschKguhUyS` READY no mesmo commit. A produção posterior 4.8.329 preserva este lote.
