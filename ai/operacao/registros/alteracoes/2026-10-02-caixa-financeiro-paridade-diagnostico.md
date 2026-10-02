# Caixa e Financeiro: diagnóstico de critérios em outubro de 2026

## Escopo e método

- Diagnóstico somente leitura, em 02/10/2026, para Japoatã/SE.
- Competência: outubro de 2026; corte do Caixa: 02/10/2026, America/Maceio.
- Conferidas as definições remotas das RPCs e os conjuntos de registros no banco via MCP Supabase.
- A reprodução SQL utilizou os predicados das RPCs, sem simular identidade autenticada ou alterar lançamentos.
- Não houve consulta Proesc V1, mutação financeira, mudança de produto ou publicação nesta investigação.
- Este registro não contém nomes de pessoas, documentos, identificadores de cobrança ou payloads privados.

## Resultado reproduzido

| Leitura | Escopo | Quantidade | Valor nominal |
| --- | --- | ---: | ---: |
| Financeiro — pendentes do mês | Técnico; vencimento de 01 a 31/10 | 147 | R$ 39.365,60 |
| Financeiro — a vencer | Técnico; vencimento de 02 a 31/10 | 145 | R$ 38.885,70 |
| Financeiro — vencidos | Técnico; status persistido VENCIDO | 0 | R$ 0,00 |
| Caixa — aberto no mês | Todas as modalidades; outubro; elegibilidade confirmada | 145 | R$ 39.065,50 |
| Caixa — vencido no mês | Elegíveis em aberto com vencimento anterior a 02/10 | 1 | R$ 279,90 |

Os dois conjuntos com 145 registros não são idênticos. A quantidade igual é coincidência.

## Reconciliação exata da diferença

Partindo do Financeiro “a vencer”, a composição do Caixa é:

```text
R$ 38.885,70  Financeiro Técnico, a vencer de 02 a 31/10
+ R$  279,90  Parcela Banese/Radiologia vencida em 01/10
+ R$   99,90  Matrícula EAD, vencimento em 03/10
- R$  100,00  Rematrícula técnica preparada, vencimento em 15/10
- R$  100,00  Rematrícula técnica preparada, vencimento em 15/10
= R$ 39.065,50  Caixa, aberto confirmado de outubro
```

Diferença líquida: R$ 179,80. Não decorre de desconto, tarifa Proesc ou arredondamento.

O total mensal do Financeiro também inclui uma matrícula preparada de R$ 200,00, vencida em 01/10. Ela não aparece no recorte “a vencer” iniciado em 02/10 nem no aberto confirmado do Caixa.

## Causas distintas

### 1. Status persistido versus vencimento

A parcela de R$ 279,90 tem vencimento em 01/10/2026, status local PENDENTE e instrumento Banese registrado, com status remoto PENDING.

- O Caixa a posiciona como vencida porque a data de vencimento é anterior ao corte de 02/10.
- O Financeiro calcula os indicadores e o filtro de vencidos apenas com `status = 'VENCIDO'`.
- Assim, um título PENDENTE cuja data passou pode ficar fora dos vencidos e também fora do recorte “a vencer”.
- O diagnóstico não prova pagamento, baixa bancária nem necessidade de mudar o status informado pela origem.

### 2. Modalidades diferentes

- O Financeiro observado estava filtrado em Técnico.
- O Caixa do polo agrega todas as modalidades elegíveis.
- A matrícula EAD de R$ 99,90 explica parte legítima da diferença. Não deve ser incluída no Técnico apenas para igualar os totais.

### 3. Pré-emissões versus obrigações confirmadas

As duas rematrículas de R$ 100,00 e a matrícula de R$ 200,00 possuem ciclo manual preparado. Não têm identificador de pagamento do gateway, nosso número ou registro CNAB nos estados confirmados aceitos pelo Caixa.

- O Financeiro inclui esses registros por categoria, modalidade, vencimento e status.
- O Caixa os exclui de sua base confirmada pelo predicado de preparação do ciclo manual.
- A exclusão do indicador não significa apagar o cadastro nem presumir cancelamento.
- Qualquer alinhamento deve explicitar “preparado” e “confirmado”, sem somar silenciosamente pré-emissões ao confirmado.

## Contratos e referências

- `public.get_receivables_modality_summary_v3_secure(text,uuid,uuid,text,date,date)`: resumo do Financeiro; a leitura “a vencer” utiliza início em 02/10, enquanto o resumo mensal utiliza 01/10.
- `public.get_receivables_modality_page_v3_secure(...)`: o escopo `overdue` também depende do status VENCIDO, exigindo alinhamento entre resumo e listagem numa eventual correção.
- `supabase/migrations/20260912133702_align_receivables_summary_payment_period.sql`: linhas 49–57 contêm os agregados por status e a distinção entre vencimento e pagamento.
- `supabase/migrations/20260912230000_proesc_summary_linked_history.sql`: adiciona histórico Proesc vinculado à elegibilidade de categoria, preservando os demais critérios.
- `supabase/migrations/20261002011400_caixa_review_drilldown.sql`: linhas 29–36 definem escopo, estados e exclusão de ciclos manuais preparados; a elegibilidade mensal considera a evidência Proesc aplicável.
- `supabase/migrations/20261002011500_caixa_receivables_position.sql`: separa aberto, vencido e a vencer por competência e corte.

## Atualização posterior: conciliação Banese

Em 02/10/2026 às 04:14:02 UTC, após o commit da confirmação de portal (migration 118), a sincronização Banese atualizou a parcela de Radiologia usada como exemplo: status PAGO, recebimento de R$ 260,00 e data de pagamento em 01/10/2026.

Após atualizar a leitura, seu nominal de R$ 279,90 deixa de integrar o aberto e o vencido. Essa foi uma atualização concorrente da conciliação Banese, não uma alteração de status causada pela migration 118.

A tabela e a equação acima documentam o estado observado antes dessa conciliação. O diagnóstico histórico dos critérios permanece válido: status versus data, Técnico versus todas as modalidades e pré-emissões versus confirmado. O ajuste desses critérios no Financeiro continua pendente de decisão/autorização.

## Encaminhamento

- Diagnóstico concluído; não há patch de produto neste registro.
- Aguardar definição/autorização do responsável para ajustar os critérios do Financeiro.
- Preservar a diferença legítima entre Técnico e todas as modalidades.
- Se houver correção, alinhar card, filtro, listagem e contagem de vencidos usando a mesma regra de corte; manter separado o que é apenas preparado.
- Validar novamente os conjuntos, não apenas os totais. Não alterar status bancário ou pagamento para forçar paridade visual.
