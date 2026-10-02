# Proesc V2 — evidência financeira de setembro/2026

Consulta em 01/10/2026, aproximadamente 21h06–21h10 de Brasília, unidade 3145. Estudo somente leitura com três agentes. Origem: relatório agregado `comparativo.md` produzido na sessão; não foram versionados payloads pessoais. A decisão posterior de migrar integralmente para V2 está [registrada separadamente](../../../../../docs/decisions/proesc-v2-operacional.md).

## Cobertura observada

V2 `/invoices`: `expiration_year=2026`, `expiration_month=09`, 16 páginas HTTP 200, 308 registros únicos, todos com vencimento em setembro. Todas as páginas informaram 308 no total; pessoa e matrícula estavam preenchidas e `person_id` concordou com `pessoa.id` em todos os registros.

V1 `/accounting_data`: tentativas novas terminaram em timeout de 30s, HTTP 429 e timeout de 60s. A comparação utilizou as últimas evidências contábeis não vazias de 307 vínculos locais, com 750 linhas. Não foi comparação de respostas simultâneas. A telemetria então observada em 24 horas tinha 53 sucessos, 43 timeouts e um erro HTTP.

O filtro V1 podia incluir movimentos pagos no mês de títulos com outro vencimento; V2 filtra vencimento. Não equiparar esses universos nem afirmar que o agregado pago abaixo é entrada de caixa de setembro.

| Estado V2 | Parcelas | Nominal | Pago informado |
| --- | ---: | ---: | ---: |
| PAGA | 124 | R$ 34.527,70 | R$ 31.814,00 |
| VENCIDO | 170 | R$ 47.776,99 | R$ 0,00 |
| PAGAMENTO PARCIAL | 9 | R$ 2.519,10 | R$ 2.573,64 |
| PAGAMENTO SUPERIOR | 5 | R$ 1.399,50 | R$ 1.418,25 |
| Total | 308 | R$ 86.223,29 | R$ 35.805,89 |

Pagamentos desse conjunto variavam entre abril e outubro. Em 304 parcelas encontradas nos vínculos locais, identificador, turma, CPF, principal e vencimento concordaram; CPF foi comparado apenas no servidor. Quatro V2 não tinham vínculo local. Três vínculos locais não apareceram: dois com cancelamento explícito nas provas V1, um desconhecido. Ausência não comprova estado.

## Aviso do Caixa reproduzido

No recorte do polo informado pelo usuário, com corte em 30/09:

| Indicador | Resultado original |
| --- | ---: |
| Base conferida / elegíveis | R$ 36.577,60 / 136 |
| Em conferência / nominal | 38 / R$ 10.636,20 |
| Vencido conferido / margem parcial | R$ 14.463,90 / 39,54% |

As 38 estavam PENDENTE localmente: 37 com prova UNKNOWN/REVIEW e uma CANCELED/REVIEW. A ausência de bloco de pagamento produzia `NO_PAYMENT_IN_OBSERVED_PERIODS`; isso não era prova de abertura/inadimplência.

| V2 para as 38 | Quantidade | Nominal |
| --- | ---: | ---: |
| VENCIDO | 35 | R$ 9.796,50 |
| PAGA | 2 | R$ 559,80 |
| Não encontrada | 1 | R$ 279,90 |

As 37 encontradas concordaram em identificador/turma/CPF/principal/vencimento. O identificador externo de matrícula não estava preenchido localmente, portanto esse campo específico não foi comparável. As duas pagas receberam R$ 260,00 cada, uma em 30/09 e outra em 01/10; a segunda ainda estava em aberto no corte histórico. A ausência correspondeu à prova antiga CANCELED.

## Revisão da base já conferida

Das 136 elegíveis, 106 têm vínculo Proesc e correspondem na V2; outras 30 são Banese.

| Estado local | V2 | Quantidade | Nominal |
| --- | --- | ---: | ---: |
| PAGO | PAGA | 60 | R$ 16.614,10 |
| PAGO | PAGAMENTO PARCIAL | 3 | R$ 839,70 |
| PAGO | PAGAMENTO SUPERIOR | 4 | R$ 1.119,60 |
| PENDENTE / OPEN | PAGA | 4 | R$ 1.119,60 |
| PENDENTE / OPEN | VENCIDO | 35 | R$ 9.895,70 |
| Banese PAGO | Fora do escopo Proesc | 16 | R$ 3.540,30 |
| Banese PENDENTE | Fora do escopo Proesc | 14 | R$ 3.448,60 |

Os quatro PAGA ainda abertos localmente foram quitados até 30/09. Os 67 já pagos tinham valor/data idênticos à V2, inclusive os sete com rótulos parcial/superior. Trocar somente as 38 deixaria informação desatualizada na base conferida.

## Limites que a integração deve conservar

- `updated_invoice_amount` igualou o original em 308/308. Esse campo não provou saldo residual.
- Todas as nove parciais tinham pago maior que original. Exemplo anônimo: original R$ 279,90, pago R$ 285,58 um dia depois do vencimento. Rótulo não autoriza reabrir dívida.
- Nos sete parciais com prova V1, a composição fechava: R$ 1.959,30 de principal + R$ 2,07 de juros + R$ 39,13 de multa = R$ 2.000,50 recebidos. Os dois restantes somavam R$ 573,14 recebidos, ainda ausentes nas provas V1 disponíveis.
- Nos cinco superiores, a composição V1 também fechava: R$ 1.399,50 + R$ 1,98 de juros + R$ 16,77 de multa = R$ 1.418,25. Preservar essas provas é diferente de continuar consultando V1.
- Em 123 de 124 PAGA, recebido menor que nominal correspondia ao desconto de adimplência. Desconto fixo e de adimplência não podem ser somados automaticamente.
- `late_payment_fees` retornou `fine: "2"`, `interest: "0.033"`. Sem unidade/fórmula homologada, não tratá-los como valores monetários recebidos.
- Nenhum rótulo de cancelamento/renegociação apareceu. Isso não comprova cobertura desses eventos nem autoriza excluir os ausentes.

## Simulação, não aplicação

Incorporar as 37 provas e as quatro quitações adicionais resultaria em vencido conhecido de R$ 23.420,70 no corte. Mantendo superiores como quitadas, haveria dois cenários condicionais:

| Tratamento das três parciais já PAGO | Base | Conferência | Margem |
| --- | ---: | ---: | ---: |
| Revisão até esclarecer saldo | R$ 46.094,20 | 4 / R$ 1.119,60 | 50,81% |
| Quitação integral comprovada | R$ 46.933,90 | 1 / R$ 279,90 | 49,90% |

Esses números não são indicador homologado nem resultado de migração. O estudo não alterou recebíveis, baixas ou matrículas. As 19 respostas temporárias foram removidas após a análise; permanecem somente agregados e histórico financeiro original.

## Resultado aplicado posteriormente — 01/10 às 22h21 de Brasília

A migração autorizada posteriormente concluiu o inventário e a projeção antes
de ativar o runtime. A auditoria independente confirmou o segundo cenário:
base R$ 46.933,90, 173 elegíveis, uma cobrança em conferência de R$ 279,90,
vencido no corte R$ 23.420,70 e margem 49,90%. Não se trata mais de simulação.

As 35 vencidas ganharam prova explícita e as duas pagas foram conciliadas;
as outras quatro quitações da base também foram aplicadas. A única pendência
mantém CANCELED/REVIEW histórico: ausência V2 não comprovou cancelamento.
O indicador permanece incompleto, embora 37 das 38 pendências tenham sido
resolvidas. Pagamento em 01/10 continuou vencido no corte de 30/09.

Os 38 pagamentos aplicados no FULL de 47 meses são um agregado global distinto
das 38 pendências originais; apenas seis dessas novas quitações pertencem a
este recorte de setembro/polo. Pagamentos anteriores, inclusive as quitações
com rótulos parcial/superior respaldadas por prova contábil, foram preservados.
As duas parciais sem essa prova continuam em revisão, sem saldo presumido.

Histórico integral, fingerprints de contas fora do Proesc e matrículas foram
preservados. Detalhes de implantação e limites de publicação constam no
[registro auditado](../../../registros/alteracoes/2026-10-01-proesc-v2-operacional.md).
