# Proesc V2 — abertura de outubro e composição dos recebimentos

Estado: CORREÇÕES APLICADAS E AUDITADAS NO BACKEND. Autorizadas explicitamente
pelo usuário após diagnóstico das imagens de 01/10/2026, às 22h22 e 22h24.
Validação dos dados/textos do PDF concluída; renderização visual completa e
smoke autenticado de tela não realizados.

## Causa reproduzida

A migração V2 projetou 17 pagamentos no polo do recorte: 12 anteriores a outubro,
somando R$ 3.139,90, e cinco de 01/10, somando R$ 1.300,00. Existia uma despesa
histórica de implantação de R$ 535.989,69, paga em 30/09. O ajuste fixo deixou
de zerar a posição depois das novas confirmações históricas: a posição atual
passou a R$ 4.439,90. As entradas mensais de outubro estão corretas.

A conta Controle Proesc é compartilhada; `data_saldo` nula é parte do contrato
histórico. Mudar esse campo isoladamente afetaria outros polos e a consulta de
setembro. A correção deve separar abertura operacional por escopo e histórico.

Cinco recebimentos chegam ao PDF e ao Financeiro com componentes nulos e
diferença de -R$ 19,90 cada. A projeção V2 confirma o pagamento, mas o resolver
anterior só admite os tipos contábeis V1 em seu ramo de composição calculada.
O novo `API_V2_INVOICE_PAID` ficou fora desse ramo. Mappers e renderizadores
conservam corretamente os valores canônicos; 12 testes focados aprovados.

## Aceite autorizado

- Abertura operacional de 01/10 no polo afetado com saldo anterior zero;
  pagamentos reais de outubro somam R$ 1.300,00 e permanecem contabilizados.
- Backfill de pagamentos anteriores não volta a aumentar o saldo operacional.
- Histórico até 30/09, recebimentos, despesas, contas e Banese preservados.
- Quatro parcelas vencidas em 05/10, pagas em 01/10, com desconto calculável de
  R$ 19,90: exibir proveniência calculada pela regra autorizada, não prova API.
- Parcela vencida em 16/09 permanece em conferência de composição: há prova
  portal OPEN anterior e regra de atraso incompatível com o recebido. Descontos
  configurados e bloco histórico sem data de pagamento não provam aplicação.
- Não somar desconto fixo e antecipação; não fabricar linhas contábeis.
- Sem alterações de layout, versão, publicação frontend ou emissão de cobrança.

## Manifesto explícito

Total: 9 arquivos, sem alteração no frontend.

- `supabase/migrations/20261002010700_proesc_opening_cutover.sql`
- `supabase/migrations/20261002010800_proesc_v2_calculated_composition.sql`
- `supabase/tests/proesc_opening_cutover.isolated.test.mjs`
- `supabase/tests/proesc_v2_calculated_composition.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-v2-virada-composicao.md`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-v2-operacional.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/integracoes/proesc/references/v2-operacional.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Harness temporário/PDF de QA não integra o lote. Migrations anteriores
0100–0106 aplicadas são imutáveis. O lote paralelo da interface Caixa 4.8.148 e
seu `LOTE_ATIVO.md` permanecem intactos.

## Implantação e resultado

- Migration local 010700 aplicada via MCP como `20261002013812`;
  010800 como `20261002013906`. Ambas agora são imutáveis.
- Abertura privada por conta/polo, saldo zero em 01/10. Três leitores de posição
  usam o marco, sem alterar `data_saldo`, fatos ou relatório mensal de movimentos.
- Posição atual no polo: R$ 4.439,90 → R$ 1.300,00. A posição histórica em
  setembro permanece R$ 3.139,90; novos backfills anteriores não entram em outubro.
  Setembro nos quatro polos e posições atuais dos outros três mantidos.
- Aprovação privada de quatro vínculos/snapshots. Preview identificou 14
  candidatos globais, mas os outros dez permaneceram inalterados. Não foi
  habilitada composição calculada indiscriminadamente para novas parcelas V2.
- Quatro descontos de R$ 19,90, total R$ 79,60, com proveniência
  `CALCULADO_REGRA_INFORMADA_PROESC`; juros/multa/acréscimo zero e residual zero.
- Um pagamento atrasado continua `NAO_DISCRIMINADA`, diferença -R$ 19,90.
  Snapshot permanece quitado; conferência é da composição, não do recebimento.
- Relatório real de outubro: cinco recebimentos, base R$ 1.399,50, recebido
  R$ 1.300,00, desconto identificado R$ 79,60 e uma composição não discriminada.
- RPC real `get_receivables_modality_page_v4_secure` confirmou os mesmos cinco:
  quatro calculados com proveniência `REGRA_INFORMADA_USUARIO` e um não
  discriminado. Não depende de alteração/publicação do frontend para exibir.

## Testes e preservação

- PGlite com SQL canônico real: corte por escopo, abertura, backfill, histórico,
  transferências de ambos os lados, manual, contas a pagar, Banese e ACLs.
- PGlite da composição: quatro aprovados, atraso, candidato não aprovado,
  22 guardas adversariais, rollback por escopo/drift, histórico portal/V1,
  nova observação equivalente, ACLs e dados imutáveis. Coordenador e revisor
  executaram os testes independentemente, com PASS.
- 12 testes de mapper/apresentação e dois de texto do compositor aprovados.
- Payload remoto intacto atravessou mapper real e gerador de textos real do
  PDF: quatro linhas calculadas sem residual e uma em conferência; totais e
  recursos institucionais preservados. Payload pessoal temporário removido.
- Checksums integrais idênticos antes/depois: 6.958 recebíveis, seis contas,
  quatro despesas e 402 matrículas. Não existe baseline global de snapshots;
  nos cinco examinados valores/datas/componentes nulos permanecem intactos.
  Nenhuma linha contábil foi fabricada. Advisors: nenhuma advertência nova.
- Manifesto com nove arquivos, máximo de 240 linhas físicas e zero violações.
  Verificador global ainda aponta 14 referências ausentes de outros lotes;
  nenhuma foi alterada neste escopo. Build global não repetido por não haver
  alteração frontend; testes SQL/contratos reais exercitam o caminho corrigido.

## Limites da validação

O layout/compositor não mudou. Não foi renderizado novo PDF real: a marca
paisagem veio embutida, mas a logo JPEG configurada não estava disponível
localmente e o MCP não oferecia download binário. Uma tentativa GET somente
leitura via pg_net respondeu HTTP200, porém truncou o binário em quatro bytes;
a resposta temporária exata foi removida. Não foi usada marca substituta.
O harness permanece temporário; não afirmar inspeção visual ou smoke autenticado.

O usuário deve atualizar os dados da tela e gerar nova prévia; o Blob aberto
antes da correção não muda retroativamente. Nenhuma nova versão frontend ou
publicação conjunta com Caixa 4.8.148 foi realizada neste lote.

Memória/contrato V2 atualizados; RAG reindexado uma vez no fechamento desta
correção: 20 fontes/162 trechos, estado ATUAL e busca de abertura/composição
retornando a decisão corrente. Não foram indexados payloads pessoais ou PDFs.
