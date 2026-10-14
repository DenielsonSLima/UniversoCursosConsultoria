# Contrato: matrícula recebida presencialmente

## Escopo e aceite

Pedido de 14/10/2026: incluir no contrato a matrícula recebida presencialmente e omitida dos boletos. Esclarecimento expresso: somente no contrato. Não lançar caixa, recebíveis, baixas ou boletos; não alterar funções de cobrança nem documentos já congelados.

Fonte contratual individual e privada, vinculada à matrícula e ao pedido original do C1. Valor declarado e motivo auditados, sem inventar data do pagamento. Nenhum valor global de matrícula no código.

O leitor contratual inclui a taxa uma única vez, indica recebimento presencial e ausência de nova cobrança. Preserva parcelas, vencimentos, descontos, juros e multa do plano canônico.

Três cancelamentos locais históricos exigiram compatibilidade de leitura: campos novos nulos não existiam no snapshot antigo. A compatibilidade é exclusiva do contrato; funções financeiras permanecem intactas. Alteração não nula, pagamento, operação não finalizada ou run divergente continuam rejeitados.

## Manifesto explícito

Total: 10 arquivos.

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

Validação concluída: 20 ensaios SQL de composição/autorização/ledger e 9 de prova histórica aprovados. Produção recebeu migrations `20261014131248` e `20261014131251`; 18 anotações individuais exclusivamente contratuais foram inseridas com comparação do ciclo e idempotência. A transação confirmou recebíveis idênticos antes/depois. Projeção real dos 18 alunos: uma matrícula de 200, 24 parcelas e total contratual 7.017,60, com indicação de recebimento presencial e sem nova dívida.

Renderer real conferido: 12 páginas, zero tokens, identidade e configuração institucional preservadas; PDF nativo extraído e página financeira inspecionada. Original emitido mantém checksum anterior. A função financeira de dispensa não foi alterada. RLS privado sem grants/políticas é intencional (nega acesso direto); nenhuma API pública nova. CI contratual e Preview aprovados; fechamento de qualidade e integração aguardam o commit final. Evidências e IDs operacionais permanecem privados fora do repositório.

Sessão Safari autenticada indisponível nesta conexão; não simular ator nem emitir documentos usando identidade de terceiros. Validação administrativa somente de leitura e renderização não equivale a emissão oficial.
