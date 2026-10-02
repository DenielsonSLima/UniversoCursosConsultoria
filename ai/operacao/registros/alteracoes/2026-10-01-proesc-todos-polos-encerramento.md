# Proesc — abertura dos polos e encerramento operacional

Estado: BACKEND APLICADO E VERIFICADO; APRESENTAÇÃO VALIDADA LOCALMENTE, NÃO PUBLICADA.
Autorização explícita do usuário nesta conversa: estender
a abertura zero aos demais polos, ajustar a apresentação do encerramento de
setembro e incluir o desconto calculável de Porto da Folha. Publicação de
GitHub/frontend permanece fora deste lote. Mudança crítica financeira/PDF.

## Causa e escopo

Os ajustes de implantação continuam em `despesas_lancamentos`, como
OUTRO_DEBITO/PAGO de 30/09. A V2 reconheceu posteriormente 32 pagamentos
anteriores a outubro, somando R$ 8.183,70. O ajuste fixo não compensava esses
novos fatos históricos: Japoatã R$ 3.139,90, Porto R$ 1.910,00 e Aquidabã
R$ 3.133,80. A abertura anterior contemplava somente Japoatã.

A abertura é metadado por conta/polo, não receita, despesa ou mudança de
saldo bancário inicial. O encerramento operacional é uma apresentação
separada no corte imediatamente anterior à abertura; os fatos históricos,
os ajustes existentes e o movimento mensal permanecem íntegros.

## Aceite

- Outubro: Japoatã R$ 1.300,00; Porto R$ 260,00; Aquidabã e Propriá zero.
- Total Controle Proesc R$ 1.560,00, sem saldo anterior incorporado.
- Fechamento operacional Proesc em 30/09 e abertura em 01/10 iguais a zero,
  com resíduo histórico e ajuste exclusivamente operacional discriminados.
- Banese, caixa local, patrimônio, dívidas, recebimentos e despesas preservados.
- Porto: um desconto de R$ 19,90 calculado por regra autorizada; não alegar
  componente aplicado explicitamente pela API. Não habilitar aprovação futura.
- Quatro descontos de Japoatã mantidos; pagamento atrasado permanece em
  conferência de composição, sem alterar quitação ou valor recebido.

## Implantação e validação

- Supabase confirmado: `kfekgwyqozhicpfuunpo`; operações somente MCP.
- `20261002010900_proesc_all_polos_opening.sql`: aplicada como
  `20261002020859 / proesc_all_polos_opening`.
- `20261002011000_proesc_porto_composition_approval.sql`: aplicada como
  `20261002020901 / proesc_porto_composition_approval`.
- `20261002011100_proesc_operational_closing_presentation.sql`: aplicada como
  `20261002021318 / proesc_operational_closing_presentation`.
- Ambas passaram em testes PGlite com escopo, replay, rejeição de conflito,
  preservação de dados e isolamento de pagamentos históricos posteriores.
- RPC real confirmou os quatro saldos de outubro acima e o desconto de Porto.
- RPC real confirmou setembro zero nos quatro polos e no consolidado, com
  histórico R$ 8.183,70 e ajuste operacional -R$ 8.183,70 discriminados. Outubro
  consolidado R$ 1.560,00; `get_contas_bancarias_saldos` confirmou o mesmo total.
- Oito recortes reais de polo/mês atravessaram o mapper canônico sem erro.
  Fluxo mensal, receitas, despesas e indicadores permaneceram idênticos.
- Fingerprints completos preservados: 6.958 recebíveis, seis contas bancárias,
  quatro despesas e 471 matrículas. As 32.085 evidências financeiras anteriores
  mantiveram o mesmo hash; o runtime acrescentou 405 snapshots durante
  a auditoria, sem alterar o conjunto original. Nenhuma nova advertência de
  segurança (cinco antes/depois). Permissões/metadados da RPC preservados.
- Teste de encerramento cobre Banese/caixa local/patrimônio/dívida não zerados,
  autorização parcial, acesso negado, histórico insuficiente e preservação dos
  demais meses. Não existe zero artificial quando falta prova do histórico.
- A primeira inspeção visual do PDF rejeitou compressão dos painéis inferiores.
  A explicação da implantação ganhou página canônica própria, somente quando o
  metadado de encerramento existe. Render final das páginas de resumo e
  fechamento aprovado por coordenador e revisão independente, sem sobreposição.
- 33 testes focados de mapper, UI, PDF e paginação passaram; revisão independente
  repetiu 17 deles. Sem fechamento, o paginador mantém as mesmas seis páginas do
  fixture; com fechamento, acrescenta somente uma página. Texto extraível e
  imagens limitadas aos recursos isolados de logo/marca, sem rasterizar folhas.
- O Hero apenas passou a identificar `saldosHoje` como saldo contábil atual;
  nenhum valor ou fonte foi alterado. Posição mensal e saldo atual ficam distintos.

## Limites da entrega

- Três migrations aplicadas no Supabase; nenhum commit, PR ou deploy frontend.
- Smoke autenticado da tela e exportação do PDF institucional real não executados:
  o fluxo Proesc segue a preferência de APIs/arquivos, sem abrir navegador.
  O PDF visualmente conferido é um fixture sintético do compositor nativo,
  enquanto os saldos financeiros foram validados nas RPCs reais.
- `npm run check:file-lines` continua falhando por 14 referências preexistentes
  ausentes de outros lotes. Os 20 arquivos deste manifesto foram contados
  diretamente: todos abaixo de 500 linhas (máximo 458). Nenhuma fonte aplicada
  anterior foi modificada. Não houve build global, pois não há publicação e os
  contratos/compositores afetados foram compilados e testados especificamente.
- Nenhuma skill, política ou memória foi alterada; as guardas do projeto exigiram
  preservação do histórico, cálculo no backend e revisão visual vetorial.

## Manifesto explícito

Total: 20 arquivos.

- `supabase/migrations/20261002010900_proesc_all_polos_opening.sql`
- `supabase/migrations/20261002011000_proesc_porto_composition_approval.sql`
- `supabase/migrations/20261002011100_proesc_operational_closing_presentation.sql`
- `supabase/tests/proesc_all_polos_opening.isolated.test.mjs`
- `supabase/tests/proesc_porto_composition_approval.isolated.test.mjs`
- `supabase/tests/proesc_operational_closing_presentation.isolated.test.mjs`
- `modules/gestor/caixa/caixa.types.ts`
- `modules/gestor/caixa/caixa.contracts.ts`
- `modules/gestor/caixa/caixa.mappers.ts`
- `modules/gestor/caixa/caixa-fechamento-implantacao.presentation.ts`
- `modules/gestor/caixa/components/CaixaStructuralOverview.tsx`
- `modules/gestor/caixa/components/CaixaFlowHero.tsx`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.summary.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.ts`
- `modules/gestor/caixa/report/CaixaReportDocument.tsx`
- `modules/gestor/caixa/report/caixa-report.pagination.ts`
- `modules/gestor/caixa/report/caixa-report.fixture.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts`
- `modules/gestor/caixa/report/caixa-report.fechamento-implantacao.test.tsx`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-todos-polos-encerramento.md`

## Preservação de trabalho paralelo

O lote ativo paralelo de redesenho do Caixa não foi sobrescrito. Migrations
anteriores aplicadas, memória e skills não são editadas neste hotfix. Não houve
indexação RAG: este registro histórico não integra o corpus padrão.
