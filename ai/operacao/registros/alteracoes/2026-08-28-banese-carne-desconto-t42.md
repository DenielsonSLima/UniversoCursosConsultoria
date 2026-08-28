# Hotfix Banese — carnê e desconto da rematrícula T42

Data: 2026-08-28  
Versão: 4.8.12  
Revisão: 21  
Estado: entrega 4.8.12 validada para publicação atômica

## Pedido e diagnóstico

O usuário comprovou que o boleto individual da matrícula T42 já abria com o Pix oficial, mas o carnê da Secretaria selecionava apenas 12 mensalidades e totalizava R$ 3.358,80. O grupo correto precisa conter a rematrícula de R$ 100,00 e as 12 mensalidades de R$ 279,90, usando somente os títulos Banese válidos dessa matrícula.

A investigação encontrou duas causas independentes:

1. o contrato documental excluía a rematrícula ao depender de um conjunto de parcelas homogêneas;
2. a importação histórica havia deixado o indicador de desconto ativo na rematrícula, embora a regra canônica reserve R$ 19,90 de desconto somente às mensalidades.

Não houve perda de Pix. O reparo não precisou criar, cancelar ou reemitir boleto.

Uma regressão visual adicional foi confirmada depois da primeira correção: havia uma regra histórica que reduzia automaticamente o carnê de três para dois títulos por A4 quando o Pix oficial estava presente. Por isso os 13 títulos passaram a ocupar sete páginas e os QRs ficaram excessivamente grandes. A regra não vinha do navegador nem do banco; estava no compositor PDF.

## Solução aplicada

### Grupo documental seguro

- O catálogo e o compositor aceitam `REMATRICULA` e `PARCELA` Banese comprovadas no mesmo grupo.
- Pagador, matrícula, polo, ambiente, emissor, convênio, agência e identidade bancária precisam coincidir.
- Títulos pagos, cancelados, de outro gateway, históricos importados sem o registro exigido ou incompletos são recusados.
- A ordenação mantém a rematrícula antes das mensalidades sem renomeá-la como parcela zero.
- O carnê usa o mesmo payload Pix oficial já persistido em cada título; nenhum QR é reconstruído ou fabricado.
- O modelo do carnê foi fixado em três títulos por página A4, com ou sem Pix. O boleto individual permanece no compositor A4 separado e não teve seu layout alterado.
- O fundo azul-claro do recibo lateral foi substituído por branco para reduzir a cobertura de tinta, sem alterar suas bordas, textos ou dimensões.
- A ordem canônica recebida do contrato documental é preservada: rematrícula primeiro e depois as 12 mensalidades.
- O catálogo expõe a composição real e a tela mostra `1 rematrícula + 12 mensalidades`, `13 títulos`, `1 arquivo de carnê` e `5 páginas estimadas`, sem chamar arquivo de requisição nem rematrícula de parcela.

### Reparo financeiro one-off

- A migration marcou somente a rematrícula alvo com `BANESE_DISCOUNT_REMOVAL_PENDING:T42_REMATRICULA_NO_DISCOUNT`.
- O worker aceita apenas esse marcador exato e valida título pendente/não pago, transação, Pix, Nosso Número, valor, vencimento e snapshot técnico-financeiro.
- O adaptador permite remoção de desconto somente com opt-in explícito; a omissão continua falhando fechada.
- A mutação remota executa `GET → PUT → GET`, aceita apenas a remoção do desconto como divergência e não altera multa nem juros.
- A persistência usa `persist_banese_discount_removal_correction`, compara o snapshot esperado e grava auditoria com origem `SYSTEM_MARKED_REPAIR`.
- O marcador é removido somente depois da confirmação bancária e da persistência atômica.
- Nenhum POST foi repetido e o Nosso Número existente foi preservado.

## Estado confirmado em produção

- Matrícula T42: 13 títulos Banese e 13 Pix oficiais.
- Rematrícula: 1 título de R$ 100,00, sem desconto.
- Mensalidades: 12 títulos de R$ 279,90, cada um com desconto de R$ 19,90.
- Total documental: R$ 3.458,80.
- Registros incompletos excluídos do grupo: 12.
- Radiologia: 312/312 títulos históricos intactos, sem alteração, reenvio ou obrigação retroativa de Pix.
- O marcador de manutenção foi consumido e não permanece no recebível corrigido.

## Edge Functions ativas

- `payment-gateway-api` v25 — `ACTIVE`, `verify_jwt=true`.
- `banese-reconciliation-worker` v66 — `ACTIVE`, `verify_jwt=false`; autenticação interna por segredo e contrato do worker preservados.
- `banese-carnet-document` v23 — `ACTIVE`, `verify_jwt=true`.
- `secretaria-banese-document-groups` v5 — `ACTIVE`, `verify_jwt=true`.

## Migrations aplicadas

| Migration local | ID remoto | SHA-256 |
| --- | --- | --- |
| `20260828143000_create_banese_discount_removal_correction.sql` | `20260828150349` | `c85910a5704c77370cb25eb617ecc6bfe5d6176f4cc70e5472f3baa9c7cce0ce` |
| `20260828143100_correct_t42_reenrollment_discount.sql` | `20260828150557` | `d13e4a9520279a872452efeb501ba97ce654efe1fc794f1da7ae9241c20269e8` |
| `20260828143200_fix_banese_discount_correction_fingerprint.sql` | `20260828152802` | `e08a5eaa4f663ff82a5bac10c6b75129d42c479f35bbbd040f0603921e215475` |
| `20260828143300_fix_banese_discount_correction_service_role_guard.sql` | `20260828153112` | `0439e86506b940da892c6c75d209711b69f5f68778f7b7d8f7894d9556828f0e` |
| `20260828143400_accept_banese_empty_discount_tombstone.sql` | `20260828153545` | `eb16fc98d9b546be692ff77663c1277023f6b35735bf67db542d0377ca3b0100` |

Os mesmos IDs e hashes estão em `ai/operacao/qualidade/migrations-aplicadas.json`. Migrations aplicadas permanecem imutáveis.

## Validação

- 112/112 testes aprovados no fechamento financeiro integrado.
- 61/61 testes adicionais aprovados para paginação, catálogo e interface.
- 10/10 `deno check` aprovados.
- TypeScript `--noEmit` e ESLint dos arquivos da interface aprovados.
- 36/36 arquivos aprovados por `deno fmt --check`.
- Todos os arquivos manuais tocados ficaram com no máximo 500 linhas.
- 17/17 testes focados aprovados novamente depois da formatação.
- O PDF da composição T42 foi renderizado em cinco páginas A4 com distribuição 3+3+3+3+1, sem corte ou sobreposição.
- Os 13 QRs foram decodificados a partir do PDF rasterizado em 300 dpi e os 13 conteúdos coincidiram exatamente com seus payloads de origem.
- A renderização final confirmou os três recibos laterais brancos na primeira A4, sem perda de borda, texto, QR, código de barras ou paginação.
- O código remoto das funções v23 e v5 foi relido depois do deploy e coincide byte a byte com os arquivos locais publicados.
- Auditoria remota confirmou 13/13 Pix no grupo da T42 e 312/312 títulos de Radiologia intactos.
- Advisors pós-DDL não apontaram `WARN` ou erro relacionado ao hotfix.
- Permaneceram apenas dois `INFO` esperados: a tabela interna de auditoria possui RLS sem policy porque todo acesso direto foi revogado e a escrita ocorre somente pela RPC `service_role`; o índice novo ainda não acumulou uso desde a criação.

## Critérios de aceite atendidos

1. O carnê reúne exatamente uma rematrícula e 12 mensalidades Banese válidas da mesma matrícula.
2. Os 13 títulos exibem o Pix oficial já registrado e totalizam R$ 3.458,80.
3. A rematrícula não possui desconto; as mensalidades mantêm R$ 19,90.
4. O reparo não cancela, reemite nem duplica o boleto e nunca repete POST.
5. Radiologia não é alterada e não passa a exigir Pix.
6. Identidades incompletas ou divergentes permanecem fora do carnê.
7. Treze títulos geram cinco páginas A4 no carnê fixo de três por página, inclusive com Pix oficial.
8. O resumo diferencia matrícula, títulos, arquivo de carnê, boletos avulsos e páginas.
9. O recibo lateral é branco e mantém as bordas e informações do modelo.

## Exclusões e publicação

- Não pertencem ao lote títulos Radiologia, migrations históricas, diretórios de importação ou qualquer reemissão bancária.
As Edge Functions documentais v23 e v5 já foram publicadas. A publicação GitHub usa exclusivamente o manifesto abaixo e preserva alterações paralelas.

## Manifesto explícito

Total: 41 arquivos (28 modificados, 13 adicionados, 0 removidos)

### Modificados (28)

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.contract.test.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.contract.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.selection.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.types.ts`
- `modules/gestor/secretaria/carnes-alunos/components/BaneseDocumentGroupCard.tsx`
- `modules/gestor/secretaria/carnes-alunos/components/CarnesSelectionSummary.tsx`
- `supabase/functions/banese-carnet-document/document-policy.test.ts`
- `supabase/functions/banese-carnet-document/document-policy.ts`
- `supabase/functions/banese-carnet-document/index.ts`
- `supabase/functions/banese-reconciliation-worker/index.ts`
- `supabase/functions/gateways/api/banese.ts`
- `supabase/functions/secretaria-banese-document-groups/document-groups.test.ts`
- `supabase/functions/secretaria-banese-document-groups/document-groups.ts`
- `supabase/functions/secretaria-banese-document-groups/index.ts`
- `supabase/functions/banese/core/adapter/boleto-financial-terms.ts`
- `supabase/functions/banese/internal/README.md`
- `supabase/functions/banese/internal/carne/carne-layout.ts`
- `supabase/functions/banese/internal/carne/carne-pdf.test.ts`
- `supabase/functions/banese/internal/carne/carne-pdf.ts`
- `supabase/functions/banese/internal/financial-terms-response.ts`
- `supabase/functions/banese/internal/financial-terms.test.ts`
- `supabase/functions/banese/internal/testing/document-fixture.ts`
- `supabase/functions/banese/internal/testing/pix-fixture.ts`

### Adicionados (13)

- `ai/operacao/registros/alteracoes/2026-08-28-banese-carne-desconto-t42.md`
- `internal/versioning/changelog/2026-08-09-a-2026-08-10.md`
- `supabase/functions/banese-reconciliation-worker/discount-removal-maintenance.test.ts`
- `supabase/functions/banese-reconciliation-worker/discount-removal-maintenance.ts`
- `supabase/functions/gateways/api/banese-discount-removal-stages.ts`
- `supabase/functions/gateways/api/banese-discount-removal.test.ts`
- `supabase/functions/gateways/api/banese-discount-removal.ts`
- `supabase/functions/banese/core/adapter-financial-terms.test.ts`
- `supabase/migrations/20260828143000_create_banese_discount_removal_correction.sql`
- `supabase/migrations/20260828143100_correct_t42_reenrollment_discount.sql`
- `supabase/migrations/20260828143200_fix_banese_discount_correction_fingerprint.sql`
- `supabase/migrations/20260828143300_fix_banese_discount_correction_service_role_guard.sql`
- `supabase/migrations/20260828143400_accept_banese_empty_discount_tombstone.sql`

### Exclusões explícitas

O README do endpoint de carnê é idêntico à `main` e não pertence ao delta. A recuperação genérica de incidente, seu teste e o teste isolado de consulta Pix também ficam fora por não serem dependências do reparo one-off. O registro de 27/08, o changelog antigo, a configuração canônica de limite e as migrations anteriores de 27/08 permanecem igualmente fora deste lote.
