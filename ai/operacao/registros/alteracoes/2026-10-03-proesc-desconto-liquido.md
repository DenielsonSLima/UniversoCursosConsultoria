# Proesc — desconto líquido em pagamentos quitados

Mudança crítica financeira, autorizada em 03/10/2026.

## Decisão e limites

- O responsável confirmou o desconto do último comprovante e definiu que recebimento abaixo do nominal corresponde a desconto.
- Essa orientação vira regra de composição calculada somente para pagamento Proesc confirmado PAGA, com identificação inequívoca e composição aplicada não informada.
- O desconto é líquido: nominal menos recebido. Não é apresentado como campo aplicado fornecido pela API, nem comprova a inexistência de compensações internas entre encargos e concessões.
- Pagamentos parciais, renegociados, cancelados, sem evidência ou superiores ao nominal não recebem esse tratamento. Configurações de taxas não são prova dos componentes aplicados.
- Documentos e componentes explícitos prevalecem. Tarifa, conta de destino e meio de pagamento não são inferidos.
- Escopo operacional a partir de 01/10/2026 e apenas vínculos/turmas Proesc confirmados. Não há nova baixa, alteração de recebimento, reabertura de dívida ou modificação de abertura.

## Evidências individuais

- Seis composições foram conferidas por documentos e, no último caso, confirmação expressa do responsável. Foram adicionadas evidências privadas idempotentes, com executor, responsável, documento, hash e justificativa.
- Meios de pagamento vieram dos comprovantes. Valores, datas, status, contas e saldo inicial foram preservados, com ensaio rollback, confirmação posterior e repetição idempotente.
- Identificadores pessoais, comprovantes, payloads, tokens e valores individuais permanecem fora do GitHub/RAG.

## Implementação e validação

- Helper privado somente leitura valida a origem, o vínculo completo, a última observação V2 PAGA e o snapshot financeiro verificado antes de calcular.
- Integração mínima no resolvedor existente, depois da prova documental. Reutiliza a classificação calculada já suportada pelo Caixa e PDF.
- Não reescreve payload da API ou snapshots técnicos. Não altera grants de acesso às RPCs públicas.
- PGlite aprovado: 44 bloqueios, precedência documental, identidade/corte, repetição, ACL e ausência de mutação. Revisão independente sem bloqueios.
- Migration remota `20261003045426` aplicada via MCP; hash do resolvedor passou de `27b2b91d10a2969fbf698fe498dbb28d` para `5f0357c93d635447fd6cb21d7ea7c73c`. Helper privado `61446b4b434450018ca8e2cfd6be4c9e`, sem grants públicos.
- Fingerprints dos recebíveis, saldos iniciais e resultados canônicos de setembro/outubro ficaram idênticos antes/depois da instalação da regra.
- Publicação 4.8.156/revisão 165 preparada sobre main 4.8.154. A versão 4.8.155 está reservada por trabalho local paralelo, não incluído; metadados de publicação preservam a base remota.
- Consulta canônica posterior à incorporação dos comprovantes confirmou ausência de diferenças pendentes e preservação da quantidade/total de recebimentos.
- Smoke visual autenticado não substituído por testes sintéticos; indisponibilidade será informada se persistir.
- Gate local de linhas encontra 15 ausências fora do manifesto, incluindo trabalho paralelo. O manifesto deste lote permanece abaixo de 500 linhas; a CI sobre a base remota completa é obrigatória para publicar.

## Manifesto explícito

Total: 8 arquivos.

- `supabase/migrations/20261003050000_proesc_paid_net_discount_rule.sql`
- `supabase/tests/proesc_paid_net_discount_rule.isolated.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-03-proesc-desconto-liquido.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
