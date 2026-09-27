# PDV: confirmação, recibos e impressoras

- Lote: `2026-09-26-pdv-confirmacao-recibos-impressoras`.
- Classificação: mudança crítica financeira, banco, PDF e publicação; três frentes independentes com revisão cruzada.
- Versão publicada: **4.8.108 / revisão 117**, em 26/09/2026, sobre a base publicada 4.8.107 / revisão 116 (`553786c33791b3f001be769fada7f5d76695c918`).
- Estado: publicado em produção. PR #198 integrado em `badca6bd8dc3bfd1bd8fd6a9cc400f35510e115f`; CI de qualidade e versão aprovados, Vercel pronta e Safari autenticado confirmou 4.8.108. Comprovante real conferido no Safari; homologação física permanece pendente.
- Autorização: usuário pediu implementação em etapas da confirmação no PDV, recibo após pagamento e Configurações > Impressoras, com escolha de impressão e modelo por impressora.

## Problema e resultado preparado

A leitura periódica local não priorizava a consulta bancária de um atendimento aberto. Após a confirmação, faltava um comprovante canônico com configuração por estação e decisão explícita de imprimir ou concluir. A entrega consulta somente o título autorizado, usa a fila e o orçamento Banese existentes e apresenta o recibo de um pagamento já confirmado.

A interface agrupa estações e impressoras, permite editar modelo de 58 ou 80 mm e oferece prévia com o mesmo compositor do documento final. O padrão é PERGUNTAR, inclusive sem impressora cadastrada. NÃO preserva o acesso ao comprovante sem iniciar impressão. AUTOMÁTICO permanece indisponível no cliente e rejeitado pelo servidor enquanto não houver transporte homologado.

## Contratos preservados

- Consulta exige JWT validado, gestor ativo, acesso à aba, polo autorizado e recebível avulso Banese BOLETO. Matrícula, turma, cronograma, empréstimo, Proesc e estados incompatíveis não entram no fluxo.
- A ação de confirmação compartilha lock, lease e orçamento com o reconciliador. Cada consulta PDV reserva três créditos dentro do orçamento global da janela móvel de 60 segundos. Intervalo por título de 15 segundos, reserva conservadora de chamadas e cooldown existentes são respeitados. Sucesso PDV não promove o perfil global do cron.
- A consulta bancária reutiliza GET, consulta de pagamentos efetivados e no máximo uma renovação OAuth. Não existe emissão, cancelamento ou reparo PUT neste caminho; perda da conexão do navegador não interrompe persistência financeira ou auditoria.
- Loop do PDV é sequencial e limitado a dez minutos; pausa com aba oculta/offline, encerra em estado terminal e respeita a espera retornada pelo servidor. A leitura anterior do mesmo título é cancelada antes de publicar o resultado canônico para impedir que PENDENTE antigo sobrescreva PAGO.
- Recibo é autorizado por polo e só nasce de PAGO com baixa válida. Valor, pagador, data e emissor vêm do snapshot canônico; frontend não calcula pagamento, desconto ou receita.
- Snapshot financeiro é imutável. Modelo e preferência são resolvidos para a estação autorizada; cada envio congela a versão efetivamente utilizada. Alterações valem para envios futuros.
- Estação local é apenas um identificador de seleção. RPCs verificam ator, polo, permissões, versão esperada e replay; prontidão de transporte nunca é aceita do navegador.
- Mesmo Blob vetorial é reutilizado em prévia, download e impressão. Logo segue o cabeçalho institucional; recibos em 58/80 mm preservam dados canônicos. A marca d’água foi retirada do compositor térmico por pedido explícito do usuário, sem alterar configurações de outros documentos.
- Preparação, claim e conclusão do job são auditados. Replay não entrega segundo token; lease vencida e resultado incerto não redisparam. Reimpressão exige ação explícita e motivo de 5 a 240 caracteres.
- Diálogo aberto/encerrado não comprova papel impresso. PDV exige sinal de encerramento do diálogo; ausência de confirmação mantém UNKNOWN. O comportamento padrão de outros exportadores permanece preservado.
- Nenhum novo título, pagamento ou cancelamento foi criado para testar esta entrega. O ensaio transacional remoto usa pagamento existente, faz rollback e não despacha impressão; sequências PostgreSQL podem avançar mesmo com rollback.

## Reprodução e revisão

A corrida do cache foi reproduzida com TanStack real: uma consulta antiga em andamento podia substituir PAGO por PENDENTE. O teste executa o callback da fonte e comprova cancelamento exato antes da publicação, isolamento de consultas vizinhas e descarte de resposta após desmontagem.

A revisão cruzada verificou autorização antes de replay, isolamento por polo/estação, CAS, recusa de transporte não pronto, impressão incerta, reutilização do Blob e preservação do financeiro. Foram corrigidos conflito com `document.visibilityState`, resultado tardio do cache e fechamento de atendimento durante envio. A observação anterior de tempo de baixa em um título é uma amostra; não constitui SLA nem comprovação de latência sustentada.

## Validação local

- `node scripts/test-pdv-receipts.mjs`: **24 testes passaram** — interface/configuração 12, recibo/loop 9 e cache 3; sem rede nem despacho físico.
- `node supabase/tests/pdv-printing.isolated.test.mjs`, com PGlite 0.3.16: **19 verificações passaram** usando migrations reais, ACL/RLS, replay, CAS, UNKNOWN e hash financeiro preservado.
- `node supabase/tests/banese_pdv_confirmation.isolated.test.mjs`, com o mesmo PGlite: **45 cenários passaram**, incluindo drift/rollback, orçamento, promoção CRON preservada, ACL, OID/owner e dados financeiros.
- Deno nos testes `payment-reader`, `payment-capabilities`, `payment-check` e `query-token-retry`: **31 testes passaram**; pior caminho simulado limitado a seis chamadas HTTP, com pagamentos efetivados prevalecendo sobre status aberto.
- `deno check supabase/functions/gestor-other-credit-payment/index.ts`: aprovado pela frente backend.
- Build e TypeScript completo aprovados pelo coordenador; nova execução final de TypeScript em andamento. Lint dos 46 caminhos do manifesto aprovado após as correções. Teste compartilhado de impressão: **8 cenários Deno passaram**, incluindo ausência de `afterprint` como UNKNOWN no PDV e comportamento padrão dos demais exportadores preservado; reprodução vermelha antes e verde após o patch.
- Ensaio do script transacional de impressoras em PGlite aprovado; posteriormente **11 contratos passaram remotamente via MCP**, com ator autenticado explícito, rollback, financeiro preservado e zero despachos.
- Claim remoto sobre a cobrança já paga retornou **INELIGIBLE**, sem criar runs; ACL restrita confirmada pelo coordenador.
- CI inclui o runner de UI/PDF/cache, os testes Edge, o teste compartilhado de impressão e os dois contratos SQL isolados. Workflow composto sobre GitHub main preservando os steps remotos já publicados; PGlite fixado em 0.3.16 fora das dependências do produto.
- PDFs de 58/80 mm aprovados pelo coordenador em texto extraído e renderização visual. Smoke local no Safari confirmou formulário real, edição do nome Epson TM-T20, modelo de 80 mm, prévia PDF real e escolha de comprovante após pagamento. Nenhuma impressão foi disparada; o smoke autenticado final de produção permanece pendente.
- `gestor-other-credit-payment` **v4 ACTIVE**, `verify_jwt=true`, pacote conferido pelo coordenador: SHA-256 `648d53cc7f215e72bba1aef5ea04b77ea66b610b30a9d25d131092eee676ad8c`.

## Rollout e pendências

1. As quatro migrations de impressoras e a migration de confirmação foram aplicadas via MCP pelo coordenador. Ledger conferido; os nomes locais foram preservados e a correspondência de versões está registrada abaixo. Migrations aplicadas são imutáveis.
2. Teste transacional remoto concluído: 11 contratos aprovados, rollback, financeiro preservado e zero despachos; sequências podem avançar sem persistir o recibo.
3. Edge v4 publicada e ACTIVE; `verify_jwt=true`, closure e SHA-256 conferidos pelo coordenador. Dependências existentes do main foram preservadas.
4. Manifesto de 46 arquivos publicado pelo PR #198, sobre 4.8.107. CI de qualidade do PR `36286744962` e da main `36287702409` aprovadas; implantação Vercel `FwBMV8qGNob5zC9eQfEcWGrNENRU` pronta. Registro de manifestos composto sobre a base remota, preservando entradas paralelas.
5. Safari autenticado: versão 4.8.108, Configurações > Impressoras e leitura por polo carregadas; Outros créditos > Recebidos preserva R$ 0,50 e oferece Comprovante. Após o usuário abrir a ação da tabela, o Safari exibiu o PDF real PDV-00000002 com R$ 0,50, CPF mascarado e dados canônicos; nenhum envio à impressora. Formulário, prévia, PERGUNTAR e resultado incerto já passaram no Safari local; não houve despacho físico nem nova transação para medir latência.
6. Homologação física pendente: modelo/interface real da impressora não confirmado. Cadastro QZ/ePOS não atesta transporte pronto; impressão automática/silenciosa não está liberada nesta etapa.

O avanço paralelo de 4.8.107 foi preservado no changelog; `OtherCreditPdvModal.tsx` e `PdvPartnerSearch.tsx` pertencem à base remota e ficam fora deste lote. Não declarar publicação, normalização de latência ou impressão física concluídas sem evidência. Artefatos de teste, PDFs e harnesses em `tmp` são regeneráveis e ficam fora do lote.

## Ajuste térmico solicitado após o smoke

- Versão 4.8.109 / revisão 118 preparada sobre 4.8.108. Usuário pediu explicitamente retirar a marca d’água e organizar o recibo como cupom térmico; essa instrução prevalece sobre a preservação genérica do fundo institucional.
- Patch no compositor `pdv-receipt.pdf.ts`, somente na variante térmica de `canonical-institutional-header-pdf.ts` e no teste `pdv-receipt.test.ts`: fundo branco, cabeçalho compacto, corpo monoespaçado, separadores e colunas com total em destaque. Preserva logo, conteúdo e snapshot financeiro. Sem alteração no banco ou nas regras do pagamento.
- 25 testes UI/PDF/cache aprovados; lint dos três arquivos passou. PDFs de 58/80 mm extraídos e renderizados sem fundo; inspeção de recursos confirmou somente logo e sua máscara de transparência.
- Manifesto desta correção (sete arquivos, PR #199): os três arquivos acima, `internal/versioning/system-version.json`, `internal/versioning/CHANGELOG.md`, este registro e `ai/operacao/LOTE_ATIVO.md`. Todos já integram o manifesto original.

## Migrations aplicadas e correspondência do ledger

O MCP atribuiu versões diferentes dos prefixos preparados localmente. Por decisão do coordenador, arquivos e nomes locais foram preservados; o mapeamento abaixo registra a aplicação sem reescrever migrations.

| Arquivo local | Versão no ledger | SHA-256 do conteúdo |
| --- | --- | --- |
| `20260927011700_pdv_printer_registry.sql` | `20260927013748` | `3a520e9301d7053397efa2328faed11723e1f0e5993765e4c4a00ef1a1d4d320` |
| `20260927011701_pdv_printer_settings_rpcs.sql` | `20260927013750` | `aeb4d244f831fb7d09ce7f2111345fc5e64e4d0046fa25cd8029697acebfdf84` |
| `20260927011702_pdv_canonical_receipts.sql` | `20260927013752` | `235b27d36e7d01e5cb452d05681174f60fe2f7ff3234769832da60b492ee7db2` |
| `20260927011703_pdv_print_job_rpcs.sql` | `20260927013755` | `62970d612f73e28c64777c4d3d6bc9c626ec0a2778a22a4890c0027145c8682c` |
| `20260927014500_banese_pdv_confirmation_budget.sql` | `20260927013817` | `8c5a4f0002262255d4744ae38b8d22d14c4e309fa7e5f508163833e29f523b08` |

## Manifesto explícito

Total: 46 arquivos

- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/configuracoes/impressoras/ImpressorasConfig.tsx`
- `modules/gestor/configuracoes/impressoras/PrinterEditor.tsx`
- `modules/gestor/configuracoes/impressoras/ReceiptTemplateEditor.tsx`
- `modules/gestor/configuracoes/impressoras/printer.types.ts`
- `modules/gestor/configuracoes/impressoras/printer.service.ts`
- `modules/gestor/configuracoes/impressoras/usePrinterSettings.ts`
- `modules/gestor/configuracoes/impressoras/printer-ui.test.tsx`
- `modules/gestor/financeiro/outros-creditos/PdvReceiptActions.tsx`
- `modules/gestor/financeiro/outros-creditos/pdv-confirmation-cache.test.mjs`
- `modules/gestor/secretaria/shared/canonical-institutional-header-pdf.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt.types.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt.pdf.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt-preview.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt.service.ts`
- `modules/gestor/financeiro/outros-creditos/usePdvReceipt.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPaymentModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-payment.service.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-confirmation-loop.ts`
- `modules/gestor/financeiro/outros-creditos/useOtherCreditPayment.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt.test.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-confirmation-loop.test.ts`
- `supabase/migrations/20260927011700_pdv_printer_registry.sql`
- `supabase/migrations/20260927011701_pdv_printer_settings_rpcs.sql`
- `supabase/migrations/20260927011702_pdv_canonical_receipts.sql`
- `supabase/migrations/20260927011703_pdv_print_job_rpcs.sql`
- `supabase/tests/pdv-printing.fixture.mjs`
- `supabase/tests/pdv-printing.isolated.test.mjs`
- `supabase/tests/pdv-printing.transaction.sql`
- `modules/gestor/secretaria/shared/pdf-blob-print.ts`
- `modules/gestor/secretaria/shared/pdf-blob-print.test.ts`
- `supabase/migrations/20260927014500_banese_pdv_confirmation_budget.sql`
- `supabase/functions/gestor-other-credit-payment/index.ts`
- `supabase/functions/gestor-other-credit-payment/payment-check.ts`
- `supabase/functions/gestor-other-credit-payment/payment-check-query.ts`
- `supabase/functions/gestor-other-credit-payment/payment-check.test.ts`
- `supabase/tests/banese_pdv_confirmation.fixture.mjs`
- `supabase/tests/banese_pdv_confirmation.isolated.test.mjs`
- `scripts/test-pdv-receipts.mjs`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-09-26-pdv-confirmacao-recibos-impressoras.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
