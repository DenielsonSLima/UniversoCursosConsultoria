# Serviços NFS-e: recebíveis automáticos e BolePix — 4.8.327

## Pedido e aceite

- Financeiro > A Receber ganha a aba Serviços; os títulos canônicos de serviços deixam Outros Créditos.
- O serviço exige planejamento financeiro e só cria títulos quando a NFS-e de produção é autorizada.
- O formulário segue Dados do serviço → Financeiro → Revisão.
- A cobrança permite somente contas a receber ou BolePix, de 1 a 60 parcelas, primeiro vencimento, periodicidade, desconto, multa e juros de mora.
- Backend calcula parcelas, datas, centavos e encargos pelo mesmo motor financeiro vigente.
- Cada boleto identifica a NFS-e, a parcela e a descrição integral do serviço efetivamente autorizado.
- Processamento bancário durável e atualizações TanStack Query/Realtime dispensam atualização manual.

## Antes e depois

Antes, a criação do recebível era opcional e títulos de serviços apareciam em Outros Créditos. Não havia uma etapa canônica para configurar parcelamento e emissão BolePix vinculada à autorização fiscal.

Agora, salvar o serviço congela um plano; não emite boleto nem cria dívida antecipadamente. A autorização fiscal materializa exatamente as parcelas previstas e classifica os títulos na aba Serviços. A opção BolePix enfileira a emissão na mesma transação. Vincular um título existente conserva seu pagamento e identidade bancária.

Exemplo sintético executado: serviço de R$ 100,01 em três parcelas conserva principal total de R$ 100,01. Repetir a autorização não aumenta o número de títulos. O número 999 e a descrição extraídos do XML autorizado prevalecem sobre um número divergente fornecido no resultado resumido da operação.

## Contratos e segurança

- Plano privado vinculado a ator, polo, parceiro, descrição final, valor, categoria e parâmetros por token de prévia.
- BolePix exige a permissão Financeiro > A Receber e o escopo atual da unidade; a permissão do Emissor permite planejamento local, sem emissão bancária.
- Ledger por serviço/parcela e recebível único preserva idempotência e a identidade fiscal e financeira.
- Migração histórica reclassifica apenas títulos já vinculados; não cria dívida para notas antigas sem título.
- Cancelamento fiscal confirmado dispara uma fila automática por parcela. Recebível sem emissão bancária é cancelado localmente; BolePix não pago exige confirmação de cancelamento no banco antes de encerrar o título. Pagamento total permanece recebido e baixa parcial exige revisão explícita, sem apagar eventos ou inventar estorno.
- Emissão Banese usa o adapter vigente, com reserva de Nosso Número, preflight e marcador atômico antes do POST. Serviço sem plano BolePix e serviço fiscalmente cancelado não podem contornar a fila pelo emissor bancário genérico.
- Tentativa bancária ambígua conserva a identidade e só pode consultar por GET. Mudança de lease não permite um novo POST. Após intenção única de cancelamento, PUT aceito ou ambíguo continua observação por GET até o banco confirmar a baixa; resposta ainda pendente não vira erro definitivo.
- A resposta original do POST e o Pix oficial são persistidos antes da consulta de confirmação. Prova de erro fica em WeakMap privado, sem dados brutos enumeráveis.
- Confirmação financeira, códigos bancários, Pix e transação são persistidos atomicamente com comparação da identidade e dos termos. A persistência idempotente do POST/Pix retenta apenas conflitos transitórios de banco por até 15 segundos, sem repetir operações bancárias.
- PDF e carnê usam o contexto fiscal congelado do backend. Nenhum número ou descrição fiscal vem do corpo da requisição.
- Carnê limita-se às parcelas abertas do mesmo serviço, operação, pagador, polo, ambiente, emissor, agência e convênio.
- Compositor mantém texto e formas nativos. Descrição longa ocupa demonstrativo integral; número fiscal e parcela permanecem nas vias do boleto.

## Validação realizada

- 18 testes SQL isolados de plano, autorização, escopo, classificação, pagamento e cancelamento fiscal.
- 9 testes SQL isolados da emissão e 6 do cancelamento: filas, marcador, retenção do POST/Pix, leases, baixa parcial, prova fiscal/bancária, backoff e scheduler.
- Dois smokes DOM com os componentes e hooks reais: etapas do serviço, revisão, retorno canônico, baixa parcial, evento durante consulta, reconexão e troca de visibilidade.
- 15 testes de contratos de frontend de serviços, planos e leitura financeira.
- 66 testes Deno integrados de emissão, cancelamento, retenção da evidência, recuperação, leitor e consulta; a frente bancária também executou 92 regressões do adapter.
- 58 testes Deno integrados de documentos, escopo, grupo do carnê, recursos bancários e PDFs.
- Três PDFs sintéticos inspecionados por extração, recursos e renderização de cinco páginas relevantes; descrição de 2.000 caracteres preservada sem corte.
- TypeScript global, ESLint dos 22 arquivos de frontend, build completo com Node 24.22.1, controle de versão e teto de linhas aprovados.
- Revisão independente sem bloqueantes nos contratos SQL, acesso, worker e documentos.
- CI próprio inclui três instâncias PostgreSQL 17 descartáveis: autorização/pagamento, leases bancárias e cancelamento concorrente com retorno tardio/pagamento.
- Nenhuma NFS-e, cobrança bancária, mensagem ou baixa real usada como teste.

## Estado e implantação

Candidato 4.8.327, revisão 336, reconstruído sobre a correção 4.8.326 (`8067dc6370385a14e6e19d5c10b85461d988d592`). As 89 fontes de implementação e teste preservam exatamente os blobs do pacote canônico `f3c3e789cb5d8604ce7fe8d339715ed44a58089f`. A PR 416 fica em rascunho durante o novo CI e empilhada sobre a PR 419 enquanto a correção fiscal aguarda integração em main.

O pacote herda os ajustes PIX 4.8.325, o registro da correção fiscal, seus nove arquivos e os workflows Banese da base 4.8.326. O registry parte dessa mesma base e acrescenta somente este registro; Caixa/PDF resumido será a versão 4.8.328 em lote separado. A entrada 4.8.256 foi arquivada para manter o changelog ativo abaixo de 500 linhas.

As dezesseis migrations deste lote foram aplicadas via MCP pelo responsável, com sucesso. As funções `nfse-service-bolepix-worker` v1, `gestor-other-credit-payment` v5, `banese-boleto-document` v26 e `banese-carnet-document` v28 estão ACTIVE com JWT verificado. Os quatro runtimes retornados pelo MCP coincidem com os pacotes aprovados e preservam o PIX nas duas vias.

A conferência de acesso sem identidade recusou lista, resumo e material com SQLSTATE `42501`. Após essa validação, o responsável ativou o controle e conferiu kick e cron de recuperação ativos. As filas de criação e cancelamento bancários tinham zero jobs. Um único recebível histórico já vinculado foi reclassificado, sem criar dívida histórica nova. Nenhuma cobrança bancária ou NFS-e nova foi emitida como teste deste lote.

Backend publicado deve ser conferido por definições/ACL e metadados dos serviços, sem emissão financeira real. O smoke visual interativo fica com o usuário no sistema local; o agente não usou Safari nem outro navegador. Homologação bancária real, se necessária, deve ser solicitada separadamente.

## Manifesto explícito

Total: 95 arquivos. Auth e EAD já estão em produção; Caixa/PDF resumido é um lote separado.

- `modules/gestor/financeiro/receber/ReceberTab.tsx`
- `modules/gestor/financeiro/financeiro.receivables.service.ts`
- `modules/gestor/financeiro/financeiro.receivables-mappers.ts`
- `modules/gestor/financeiro/receber/servicos/servicos-receber.service.ts`
- `modules/gestor/financeiro/receber/servicos/ServicosReceberTab.tsx`
- `modules/gestor/financeiro/receber/servicos/servicos-receber.contract.test.ts`
- `modules/gestor/financeiro/receber/servicos/servicos-receber.contract.ts`
- `modules/gestor/financeiro/receber/servicos/ServicosReceberTab.interaction.test.mjs`
- `modules/gestor/financeiro/receber/servicos/useServicosReceber.ts`
- `modules/gestor/financeiro/receber/servicos/ServiceReceivableRow.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerFinancialFields.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfseServicePlanPreview.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.tsx`
- `modules/gestor/emissor-nfse/parceiros/types/nfse-partner-services.types.ts`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfsePartnerFinancialPlan.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.service-core.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.test.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-service-financial-plan.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-service-financial-plan.contract.test.ts`
- `supabase/functions/banese/internal/types.ts`
- `supabase/functions/banese/internal/service-invoice.ts`
- `supabase/functions/banese/internal/service-invoice.test.ts`
- `supabase/functions/banese/internal/pdf/service-invoice-details.ts`
- `supabase/functions/banese/internal/pdf/service-invoice-details.test.ts`
- `supabase/functions/banese/internal/boletos/boleto-layout.ts`
- `supabase/functions/banese/internal/boletos/boleto-pdf.ts`
- `supabase/functions/banese/internal/carne/carne-layout.ts`
- `supabase/functions/banese/internal/carne/carne-pdf.ts`
- `supabase/migrations/20261112221500_nfse_service_bolepix_queue.sql`
- `supabase/migrations/20261112221600_nfse_service_bolepix_material.sql`
- `supabase/migrations/20261112221700_nfse_service_bolepix_persistence.sql`
- `supabase/migrations/20261112221800_nfse_service_bolepix_scheduler.sql`
- `supabase/functions/nfse-service-bolepix-worker/contract.ts`
- `supabase/functions/nfse-service-bolepix-worker/bank.ts`
- `supabase/functions/nfse-service-bolepix-worker/worker.ts`
- `supabase/functions/nfse-service-bolepix-worker/handler.ts`
- `supabase/functions/nfse-service-bolepix-worker/index.ts`
- `supabase/functions/nfse-service-bolepix-worker/worker.test.ts`
- `supabase/functions/banese/core/adapter/boleto.ts`
- `supabase/functions/banese/core/adapter/creation-evidence.ts`
- `supabase/functions/banese/core/adapter/types.ts`
- `supabase/functions/banese/core/adapter-create-pix.test.ts`
- `supabase/functions/gateways/router-adapter-runtime.ts`
- `supabase/functions/gateways/boleto/banese.ts`
- `supabase/functions/gestor-other-credit-payment/payment-reader.ts`
- `supabase/functions/gestor-other-credit-payment/payment-reader.test.ts`
- `supabase/tests/nfse_service_bolepix.fixture.mjs`
- `supabase/tests/nfse_service_bolepix.isolated.test.mjs`
- `supabase/tests/nfse-service-bolepix-postgres-concurrency.mjs`
- `supabase/migrations/20261112221000_nfse_service_receivable_store.sql`
- `supabase/migrations/20261112221050_nfse_service_financial_calculator.sql`
- `supabase/migrations/20261112221100_nfse_service_financial_plan_save.sql`
- `supabase/migrations/20261112221200_nfse_service_receivable_authorization.sql`
- `supabase/migrations/20261112221300_nfse_service_receivable_reads.sql`
- `supabase/migrations/20261112221400_nfse_service_financial_routes.sql`
- `supabase/tests/nfse_service_receivables.fixture.sql`
- `supabase/tests/nfse_service_receivables.fixture.mjs`
- `supabase/tests/nfse_service_receivables.isolated.test.mjs`
- `supabase/tests/nfse_service_receivables.integration.test.mjs`
- `supabase/tests/nfse_service_receivables.concurrent.test.mjs`
- `supabase/tests/nfse_service_financial_plan.isolated.test.mjs`
- `supabase/functions/banese/internal/service-document-context.ts`
- `supabase/functions/banese/internal/service-document-context.test.ts`
- `supabase/functions/banese-carnet-document/service-carnet.ts`
- `supabase/functions/banese-carnet-document/service-carnet.test.ts`
- `supabase/functions/banese-carnet-document/index.ts`
- `supabase/functions/banese-boleto-document/index.ts`
- `.github/workflows/nfse-service-financial.yml`
- `supabase/functions/nfse-service-bolepix-worker/cancellation-contract.ts`
- `supabase/functions/nfse-service-bolepix-worker/cancellation-bank.ts`
- `supabase/functions/nfse-service-bolepix-worker/cancellation.ts`
- `supabase/functions/nfse-service-bolepix-worker/dispatcher.ts`
- `supabase/functions/nfse-service-bolepix-worker/cancellation.test.ts`
- `supabase/tests/banese_student_identity_handlers.fixture.mjs`
- `supabase/tests/banese_student_identity_handlers.test.mjs`
- `supabase/migrations/20261112221900_nfse_service_cancellation_store.sql`
- `supabase/migrations/20261112221910_nfse_service_cancellation_proof.sql`
- `supabase/migrations/20261112222000_nfse_service_cancellation_material.sql`
- `supabase/migrations/20261112222100_nfse_service_cancellation_commands.sql`
- `supabase/migrations/20261112222200_nfse_service_cancellation_completion.sql`
- `supabase/migrations/20261112222300_nfse_service_cancellation_routes.sql`
- `supabase/tests/nfse_service_cancellation.fixture.mjs`
- `supabase/tests/nfse_service_cancellation.isolated.test.mjs`
- `supabase/tests/nfse_service_cancellation.concurrent.test.mjs`
- `supabase/functions/nfse-service-bolepix-worker/creation-evidence.ts`
- `supabase/functions/nfse-service-bolepix-worker/creation-evidence.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-servicos-recebiveis-bolepix.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-256.md`

## Candidato

Versão 4.8.327, revisão 336, sobre a correção 4.8.326 `8067dc6370385a14e6e19d5c10b85461d988d592`. A PR 416 conserva as 89 fontes canônicas de `f3c3e789cb5d8604ce7fe8d339715ed44a58089f` e aguarda novo CI da integração. Auth, EAD, PIX e o retorno fiscal corrigido são herdados da base; Caixa/PDF resumido será um lote separado. A entrada 4.8.256 foi arquivada integralmente para preservar o teto do changelog ativo.

## Publicação confirmada

PR #416 integrada em `cf39ec7f883930b9ed2ff73a2fd642058a938695`, versão 4.8.327, após 18/18 workflows aprovados e Preview READY na SHA `0f9bf4b8f458067467ff79ee3e9f6a74cde0180b`. Produção Vercel `dpl_5gwnffgaJt1yo9DAY267rYDUfAJb` READY; domínio e asset principal com a versão 4.8.327 responderam HTTP 200.
