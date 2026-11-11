# NFS-e: revisão compacta e competência acadêmica automática

## Pedido e aceite

- A fila oferece apenas Revisar por linha; emissão ou consulta permanece pela seleção individual ou em lote.
- Situação compacta; mensagens completas continuam acessíveis na revisão e no título do indicador.
- Pré-modelo já escolhido é reaproveitado, com alteração opcional. Origem, emitente, verificações e descrição ficam expansíveis, sem descarte dos dados.
- CPF/CNPJ são formatados para leitura, preservando zeros iniciais e o valor original. Conteúdo incompleto ou inesperado não é inventado nem truncado.
- Alunos usam automaticamente o mês pago e o último dia real de pagamento reservado nesse mês. Para 08 e 09/11, a data aplicada é 09/11, não o fim do mês. Serviços conserva o preenchimento manual.
- Competência acadêmica não tem edição manual na revisão. Ausência ou mudança dos recebimentos bloqueia o salvamento. Revisões antigas divergentes requerem nova confirmação, preservando histórico e replay idempotente.
- As três confirmações fiscais continuam obrigatórias; salvar revisão não emite nota. Backend valida a mesma regra também na base usada antes da transmissão.
- O aviso de cancelamento em até 24 horas é referência interna. Após esse período a solicitação continua disponível, sujeita à validação fiscal existente; nenhum bloqueio novo foi criado.
- Não executar emissão ou cancelamento real. Não alterar recebimentos, valores, XML, notas emitidas ou revisões históricas.

## Integração e validação

- Lote candidato 4.8.296/revisão 305, base 4.8.295 no commit 1ffcdcb760a6c496f5f2564ba287a9c845510257, após Emitidas 294 e Modelos 295. Publicação GitHub e produção autorizada pelo usuário, condicionada aos testes finais.
- Migration de competência preserva os predicados de herança da Matriz introduzidos em 295; nenhum backfill ou alteração de registros reais.
- 17 testes unitários passaram: apresentação CPF/CNPJ, contrato fiscal, última data real, ausência de evidência e preservação da revisão anterior.
- 7 testes de interação passaram: pré-modelo, detalhes recolhidos, seleção individual/lote, ausência de emissão, confirmações, retry, dia final efetivo e aviso de 24 horas com guardas preservadas.
- 21 testes SQL isolados passaram: autorização, replay, origem financeira, confirmação, herança Matriz/filial e validação antes da operação.
- Lint focado passou. CI agregado, build/Preview e DDL remoto são etapas obrigatórias antes da promoção, ainda pendentes neste registro de preparação.
- Smoke visual no Safari autenticado não executado: sessão indisponível; usuário informou que conferirá depois. Testes DOM não substituem verificação visual real.

## Manifesto explícito

Total: 25 arquivos

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-revisao-competencia-compacta.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewDetails.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.css`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.tsx`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/pendentes/nfse-queue-selection.css`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-document.presentation.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-document.presentation.test.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.types.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.contract.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.dates.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.dates.test.ts`
- `supabase/migrations/20261111123000_nfse_fiscal_review_payment_dates.sql`
- `supabase/tests/nfse_fiscal_review.isolated.test.mjs`
- `supabase/tests/nfse_academic_description.isolated.test.mjs`
- `supabase/tests/nfse_fiscal_review_shared.fixture.mjs`
- `modules/gestor/emissor-nfse/individual/NfseIndividualCancellation.tsx`
- `modules/gestor/emissor-nfse/individual/NfseIndividualCancellation.interaction.test.mjs`
