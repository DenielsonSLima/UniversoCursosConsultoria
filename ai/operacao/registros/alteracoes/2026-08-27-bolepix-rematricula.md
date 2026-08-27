# Recuperação BolePix e rematrícula Banese

Data: 2026-08-27
Estado: produção publicada com pendência bancária histórica isolada

## Objetivo

Restaurar a leitura e a persistência do Pix oficial devolvido pelo Banese, impedir que uma divergência de um título interrompa o lote inteiro e corrigir a apresentação da rematrícula no Financeiro, sem fabricar payload, QR Code ou número bancário.

## Reunião técnica em três frentes

### Contrato bancário e dados

- A causa do desaparecimento do Pix foi localizada no caminho reduzido de gravação da inclusão: o Banese podia devolver `NumeroCodigoBarras`, `NumeroLinhaDigitavel` e `QrCode`, mas o retorno canônico do POST era reduzido antes da persistência do par Pix.
- Os 13 recebíveis `banese_card` registrados em 27/08/2026 foram gravados sem payload ou imagem Pix; a conferência remota encontrou zero pares Pix completos nesse conjunto.
- A rematrícula de R$ 100,00 é única e seu código de barras identifica o mesmo título, mas a linha digitável persistida possui dígito verificador inválido.
- A linha digitável e o código de barras do exemplo fornecido pelo banco não correspondem a nenhum recebível atual e, portanto, não foram associados nem persistidos.

### Worker e backend

- A versão anterior do reconciliador recusava a autenticação enviada pelo agendador e respondia 401.
- A autenticação foi restaurada e o lote voltou a executar com resposta 200.
- Falhas específicas de uma cobrança agora isolam somente a linha e não interrompem as demais reconciliações.
- O retorno de inclusão preserva o `QrCode` oficial; uma consulta compatível também pode completá-lo somente quando o próprio banco devolver o campo e identidade, valores, vencimento e números bancários forem idênticos.
- A migração `20260827222743_repair_banese_automatic_profile_floor` corrigiu o drift que deixava o automático em P2, restabeleceu a faixa P3–P9, manteve P17–P20 e reforçou `search_path`, ACLs e entrypoints dos RPCs.

### Interface e documento

- A rematrícula carregava, mas era apresentada como `PARCELA 0` porque a interface priorizava `parcela_numero` antes de `tipo_lancamento`.
- Tabela, relatório e fração agora priorizam `MATRICULA`, `REMATRICULA` e `DEPENDENCIA` antes da numeração mensal.
- A sincronização informa sucesso ou falha ao operador.
- Se a montagem segura do PDF falhar, a aba preparada permanece aberta com mensagem explícita, evitando uma ação aparentemente sem resposta.

## Implementação

- A normalização do retorno BolePix foi separada do adaptador principal e cobre a grafia exata `QrCode`.
- A consulta GET ganhou recuperação Pix opt-in; nenhuma consulta gera ou reemite boleto.
- A reconciliação aceita substituir uma linha digitável local inválida somente quando o código de barras oficial é idêntico e a linha local reconstrói esse mesmo código. Títulos válidos divergentes continuam bloqueados.
- Payload e imagem Pix nunca são persistidos parcialmente.
- O worker diferencia falha sistêmica de divergência por título e registra apenas códigos diagnósticos seguros.
- A apresentação da rematrícula foi centralizada em uma única função compartilhada pela tela e pelo PDF de relatório.

## Guardas mantidas

1. Nenhum QR Code, payload EMV, linha digitável ou código de barras é inventado.
2. Nenhum recebível é vinculado ao exemplo bancário quando valor, vencimento ou identidade divergem.
3. A reconciliação não cria nem reemite títulos; ela consulta e completa apenas o mesmo título oficial.
4. Divergências financeiras ou bancárias válidas permanecem em revisão manual.
5. Dados pessoais, payloads Pix, tokens e números bancários completos não são registrados em logs ou neste documento.
6. Migrations locais paralelas e regras comerciais de outro ciclo não fazem parte deste hotfix.

## Validação local

- 202 testes focados Deno aprovados: 191 do backend/documentos Banese e 11 da apresentação financeira.
- TypeScript `--noEmit` aprovado.
- `deno check` do worker e do gateway aprovado.
- Limite de 500 linhas aprovado; `banese.ts` ficou com 499 linhas e o worker com 453.
- Verificação de whitespace do manifesto aprovada.
- A revisão final independente não deixou achados críticos ou importantes.

## Publicação remota

- Projeto Supabase confirmado: `kfekgwyqozhicpfuunpo`.
- `banese-reconciliation-worker` v34 está `ACTIVE`, `verify_jwt=false`, com autenticação compatível com o agendador e diagnóstico seguro por linha.
- `asaas-api` v84 está `ACTIVE`, `verify_jwt=true`, com recuperação oficial do Pix e reconciliação protegida.
- A execução com 28 títulos confirmou o isolamento: 15 seguiram como pendentes e 13 registros reduzidos falharam sem interromper o lote.
- Depois da migração, o cron executou em P3 com 15 títulos: 2 seguiram como pendentes e os mesmos 13 permaneceram isolados. O código agregado foi `REMOTE_INTEREST_TYPE_INVALID`, sem payload bancário ou dado pessoal em log.
- Produção e sandbox ficaram em modo `AUTOMATIC`, selecionado P9, efetivo P3 e último estável P3; a constraint P3–P9 e as permissões mínimas dos cinco RPCs foram conferidas diretamente.

## Manifesto explícito

Total: 22 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-08-27-bolepix-rematricula.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `modules/gestor/financeiro/receber/banese/gestor-banese-payment.service.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberOperations.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberReport.tsx`
- `supabase/functions/banese-reconciliation-worker/error-classification.test.ts`
- `supabase/functions/banese-reconciliation-worker/error-classification.ts`
- `supabase/functions/banese-reconciliation-worker/index.ts`
- `supabase/functions/banese/core/adapter/boleto-pix-response.ts`
- `supabase/functions/banese/core/adapter/boleto-query-pix.test.ts`
- `supabase/functions/banese/core/adapter/boleto.ts`
- `supabase/functions/gateways/api/banese-bank-numbers.test.ts`
- `supabase/functions/gateways/api/banese-pix-reconciliation.test.ts`
- `supabase/functions/gateways/api/banese-reconciliation-contract.ts`
- `supabase/functions/gateways/api/banese.ts`
- `supabase/migrations/20260827222743_repair_banese_automatic_profile_floor.sql`

## Limitações separadas

- O erro 400 do endpoint CNAB observado no navegador corresponde à configuração incompleta do código EDI7 de seis dígitos e não impede a consulta BolePix. Essa configuração não foi alterada neste hotfix.
- O manual público Banese v1.6 documenta linha digitável e código de barras, mas não `QrCode`, no GET. Como o payload POST dos 13 títulos antigos não foi armazenado e o retorno atual ainda diverge no tipo de juros, esses QR Codes não podem ser reconstruídos com segurança; o banco deve fornecer o retorno exato por título ou autorizar uma reemissão individual em lote separado.
- Qualquer decisão sobre recriar títulos, alterar vencimento, valor ou regra comercial da rematrícula exige confirmação bancária individual e um lote financeiro separado.
- O smoke autenticado final dos PDFs ficou pendente porque a sessão controlável do navegador não estava disponível; nenhum dado financeiro foi alterado apenas para produzir evidência visual.
