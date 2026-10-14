# Contrato: matrícula recebida presencialmente

## Escopo e aceite

Pedido de 14/10/2026: incluir no contrato a matrícula recebida presencialmente e omitida dos boletos. Esclarecimento expresso: somente no contrato. Não lançar caixa, recebíveis, baixas ou boletos; não alterar funções de cobrança nem documentos já congelados.

Fonte contratual individual e privada, vinculada à matrícula e ao pedido original do C1. Valor declarado e motivo auditados, sem inventar data do pagamento. Nenhum valor global de matrícula no código.

O leitor contratual inclui a taxa uma única vez, indica recebimento presencial e ausência de nova cobrança. Preserva parcelas, vencimentos, descontos, juros e multa do plano canônico.

Três cancelamentos locais históricos exigiram compatibilidade de leitura: campos novos nulos não existiam no snapshot antigo. A compatibilidade é exclusiva do contrato; funções financeiras permanecem intactas. Alteração não nula, pagamento, operação não finalizada ou run divergente continuam rejeitados.

## Manifesto explícito

- `supabase/migrations/20261014132900_contract_individual_waiver_nullable_columns.sql`
- `supabase/migrations/20261014133000_contract_individual_external_enrollment.sql`
- `supabase/tests/contract_individual_finance.isolated.test.mjs`
- `supabase/tests/contract_individual_waiver.isolated.test.mjs`
- `.github/workflows/contract-individual-terms.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-14-contrato-matricula-presencial.md`

## Validação e publicação

Em validação. Testes SQL focados exercitam composição, duplicidade, autorização, preservação do ledger, valor individual e prova histórica. Evidências e IDs operacionais permanecem privados e fora do repositório. Modelo aprovado atual não é reescrito. Dados do contrato passam pelo mesmo renderer e compositor PDF existentes.

Sessão Safari autenticada indisponível nesta conexão; não simular ator nem emitir documentos usando identidade de terceiros. Validação administrativa somente de leitura e renderização não equivale a emissão oficial.
