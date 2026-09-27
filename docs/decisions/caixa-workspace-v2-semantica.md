# Decisão: semântica do workspace Caixa v2

Data: 2026-09-27

Status: contrato obrigatório vigente para as Etapas 0 a 2

## Objetivo

O Caixa v2 deve permitir que o gestor responda, sem misturar regimes financeiros:

1. quanto existe registrado agora;
2. quanto já foi realizado;
3. quanto está comprometido e quando vence;
4. se os recursos confirmados cobrem os próximos 7 e 30 dias;
5. qual é a estrutura patrimonial gerencial conhecida;
6. quão confiável e completa é cada resposta.

Todo cálculo, classificação, consolidação, rateio, corte temporal e indicador pertence à RPC. O frontend somente envia filtros, apresenta o payload canônico e formata valores já calculados.

## Glossário obrigatório

### `REALIZADO`

Fluxo com liquidação confirmada. Entradas e saídas são reconhecidas pela data efetiva de recebimento ou pagamento e pelo valor efetivamente liquidado.

- altera o caixa registrado uma única vez;
- não usa data de vencimento como substituta da data de liquidação;
- pagamento estornado deixa de ser realizado e a obrigação volta a aberto;
- pagamento parcial realiza somente a parcela efetivamente paga.

### `COMPROMETIDO`

Obrigação registrada e ainda aberta na data de corte, classificada pelo vencimento.

- não reduz o caixa registrado antes da liquidação;
- reduz a disponibilidade apenas em uma visão projetada;
- inclui parcelas abertas e saldos remanescentes de pagamentos parciais;
- deve distinguir vencido, vence hoje e a vencer.

### `PROJETADO_CONFIRMADO`

Projeção determinística formada somente por saldo registrado, entradas futuras confirmadas e obrigações abertas comprovadas no horizonte.

- não é previsão estatística;
- não é saldo bancário;
- não inclui promessa, oportunidade comercial ou recebível sem elegibilidade confirmada;
- deve declarar horizonte, corte e completude das fontes.

### `PATRIMONIAL_A_CUSTO`

Posição gerencial composta por caixa registrado, ativos cadastrados pelo custo e saldos de financiamento reconhecidos.

- não é patrimônio líquido contábil;
- não inclui valorização de mercado, depreciação, provisões, tributos ou passivos não cadastrados;
- contas a pagar abertas permanecem expostas como comprometido e não são abatidas novamente desta posição;
- uma conta paga reduz o caixa uma vez, sem uma segunda dedução patrimonial.

### `REEXPRESSADO`

Visão de uma data passada recalculada com o estado cadastral disponível no presente.

- usa datas imutáveis de criação e datas comprovadas de liquidação quando disponíveis;
- não promete fotografia histórica verdadeira quando cancelamentos, exclusões ou alterações não possuem vigência temporal;
- toda consulta histórica afetada por essa limitação deve declarar `criterio = POSICAO_REEXPRESSA_NO_CORTE`.

## Linguagem da interface

### Termos proibidos sem qualificação e prova contábil

- `saldo disponível`;
- `saldo bancário`;
- `lucro`;
- `patrimônio líquido`;
- `posição contábil`;
- `previsão` ou `previsto`;
- `caixa livre`;
- `histórico no corte`.

### Termos permitidos

- `saldo de caixa registrado`;
- `entrada realizada` e `saída realizada`;
- `obrigação comprometida`;
- `vence hoje`, `em atraso` e `a vencer`;
- `saldo projetado confirmado em 7 dias`;
- `saldo projetado confirmado em 30 dias`;
- `posição patrimonial a custo`;
- `posição reexpressa no corte`;
- `recursos vinculados identificados`;
- `saldo livre comprovado`, somente quando a vinculação estiver completa;
- `resultado operacional realizado`;
- `cobertura de obrigações`.

Rótulos exibidos devem carregar regime e período. Exemplos: `Saídas realizadas em setembro`, `Obrigações a vencer nos próximos 7 dias` e `Posição patrimonial a custo em 27/09/2026`.

## Contrato temporal

- A data institucional é `timezone('America/Maceio', now())::date`.
- A competência é normalizada para o primeiro dia do mês.
- `periodo_inicio` é o primeiro dia da competência.
- `periodo_fim_exclusivo` é o primeiro dia da competência seguinte.
- `data_corte_competencia` é a menor data entre a data institucional e o último dia da competência.
- A agenda operacional é sempre ancorada na data institucional, independentemente da competência consultada.
- `proximos_sete_dias` significa D+1 até D+7. `vence_hoje` é D e não pode ser contado novamente nesse intervalo.
- O horizonte de 7 dias exigível inclui vencidos, vence hoje e D+1 a D+7.
- O horizonte de 30 dias exigível inclui vencidos, vence hoje e D+1 a D+30.
- Datas são inclusivas apenas quando o nome do campo assim declarar; intervalos de competência usam fim exclusivo.

## Snapshot canônico

A implementação posterior deve expor uma RPC orquestradora, conceitualmente:

```sql
get_caixa_painel_gestao_secure(
  p_polo_id uuid,
  p_competencia date,
  p_horizonte_dias integer default 30
) returns jsonb
```

O nome físico pode mudar, mas o contrato deve preservar:

- uma única transação e um único snapshot MVCC para todas as seções;
- `snapshot_id`, `gerado_em`, `data_institucional`, competência e cortes comuns;
- escopo `GLOBAL` ou `POLO` explícito;
- `criterio_historico` explícito;
- versão do payload;
- valores monetários serializados como texto decimal;
- quantidades como inteiros;
- indicadores de completude por seção e por métrica.

O frontend não pode somar respostas de RPCs independentes para formar um KPI do workspace.

## KPIs de Hoje

### Caixa e exigibilidade

- `saldo_caixa_registrado`: saldo derivado exclusivamente dos movimentos realizados elegíveis.
- `recursos_vinculados_identificados`: parte do caixa com vínculo canônico comprovado.
- `saldo_livre_comprovado`: `saldo_caixa_registrado - recursos_vinculados_identificados`, somente quando o universo de vínculos estiver completo; caso contrário, `null`.
- `em_atraso`: saldo aberto com vencimento anterior a D.
- `vence_hoje`: saldo aberto com vencimento igual a D.
- `proximos_sete_dias`: saldo aberto com vencimento entre D+1 e D+7.
- `proximos_trinta_dias`: saldo aberto com vencimento entre D+1 e D+30.
- `exigivel_sete_dias`: `em_atraso + vence_hoje + proximos_sete_dias`.
- `exigivel_trinta_dias`: `em_atraso + vence_hoje + proximos_trinta_dias`.

Cada KPI de obrigação retorna ao menos `valor` e `quantidade`. Pagamento parcial usa o saldo remanescente no valor, enquanto a quantidade representa o título econômico ainda aberto uma única vez.

### Projeção confirmada

- `entradas_confirmadas_7d`: entradas elegíveis com data entre D e D+7.
- `entradas_confirmadas_30d`: entradas elegíveis com data entre D e D+30.
- `recursos_confirmados_7d`: `saldo_caixa_registrado + entradas_confirmadas_7d`.
- `recursos_confirmados_30d`: `saldo_caixa_registrado + entradas_confirmadas_30d`.
- `saldo_projetado_confirmado_7d`: `recursos_confirmados_7d - exigivel_sete_dias`.
- `saldo_projetado_confirmado_30d`: `recursos_confirmados_30d - exigivel_trinta_dias`.
- `deficit_7d`: `greatest(-saldo_projetado_confirmado_7d, 0)`.
- `sobra_7d`: `greatest(saldo_projetado_confirmado_7d, 0)`.
- `deficit_30d`: `greatest(-saldo_projetado_confirmado_30d, 0)`.
- `sobra_30d`: `greatest(saldo_projetado_confirmado_30d, 0)`.
- `cobertura_7d_percentual`: `100 * recursos_confirmados_7d / exigivel_sete_dias`.
- `cobertura_30d_percentual`: `100 * recursos_confirmados_30d / exigivel_trinta_dias`.

Quando o denominador de cobertura for zero, o percentual é `null` e o estado é `SEM_OBRIGACOES`; não é `0%` nem `100%`.

### Agenda diária

A agenda retorna D até D+30, ainda que a interface destaque somente D até D+7. Cada dia informa:

- data;
- valor e quantidade a pagar;
- valor e quantidade de entradas confirmadas;
- saldo líquido diário confirmado;
- saldo projetado confirmado acumulado;
- completude e alertas aplicáveis.

Os vencidos aparecem em bloco próprio e não são redistribuídos artificialmente no dia atual.

## KPIs da Competência

- `entradas_realizadas`: valores efetivamente recebidos dentro da competência.
- `saidas_realizadas`: valores efetivamente pagos dentro da competência.
- `resultado_operacional_realizado`: `entradas_operacionais_realizadas - saidas_operacionais_realizadas`.
- `contas_da_competencia`: obrigações cujo vencimento pertence à competência.
- `pagas_na_competencia`: liquidações cuja data de pagamento pertence à competência, independentemente do vencimento original.
- `abertas_da_competencia`: saldo aberto de obrigações com vencimento na competência.
- `vencidas_da_competencia`: subconjunto aberto com vencimento anterior a D.
- `vence_hoje_da_competencia`: subconjunto aberto com vencimento igual a D.
- `a_vencer_da_competencia`: subconjunto aberto com vencimento posterior a D.
- `inadimplencia_percentual`: `100 * valor_vencido_elegivel / valor_exigivel_elegivel`.

`a_vencer` é sempre estritamente posterior ao corte. Obrigações que vencem hoje nunca são classificadas como atrasadas nem como a vencer.

### Linha de cobertura operacional

Os buckets `fixas`, `variaveis` e `nao_classificadas` devem ser mutuamente exclusivos. Rateio é uma dimensão de alocação, não um quarto custo a ser somado novamente.

- `custos_operacionais_realizados`: `fixas_realizadas + variaveis_realizadas + nao_classificadas_realizadas`.
- `margem_apos_fixas`: `entradas_operacionais_realizadas - fixas_realizadas`.
- `margem_operacional_realizada`: `entradas_operacionais_realizadas - custos_operacionais_realizados`.
- `cobertura_operacional_percentual`: `100 * entradas_operacionais_realizadas / custos_operacionais_realizados`.

Estados permitidos:

- `ABAIXO_DA_LINHA`: entradas operacionais menores que custos fixos;
- `COBRINDO_FIXAS`: entradas cobrem fixas, mas não todos os custos operacionais;
- `LINHA_SUPERADA`: entradas cobrem todos os custos operacionais;
- `SEM_BASE`: classificação ou completude insuficiente para concluir.

Crédito de empréstimo, amortização de principal e transferências internas não integram o resultado operacional. Juros e encargos podem integrar um bucket de custo financeiro separado, nunca disfarçados como custo operacional.

## KPIs de Estrutura

- `ativos_a_custo`: soma canônica de quantidade por valor de aquisição dos ativos elegíveis.
- `saldo_devedor_financiamentos`: principal ainda devido nos contratos elegíveis.
- `posicao_patrimonial_a_custo`: `saldo_caixa_registrado + ativos_a_custo - saldo_devedor_financiamentos`.
- `servico_divida_30d`: principal, juros e encargos exigíveis até D+30, apresentados separadamente.
- `recursos_vinculados_identificados`: recursos com vínculo canônico, incluindo convênios quando comprovados.

A estrutura não subtrai novamente contas já pagas. Contas a pagar abertas são exibidas como comprometido e projeção; não transformam esta métrica gerencial em patrimônio líquido contábil.

## Regras de rateio e consolidação

- Uma Conta a Pagar rateada nasce fisicamente na Matriz e tem uma única baixa física.
- Polos recebem alocação econômica, sem título ou pagamento duplicado.
- Valores devem permanecer por fração econômica para respeitar pagamentos parciais, datas distintas e cortes históricos.
- Quantidades são consolidadas por título econômico: um título é pago somente quando todas as frações existentes no corte estiverem liquidadas.
- Um título parcialmente pago pode contribuir com valor realizado e valor aberto no mesmo corte, mas não pode ser contado simultaneamente como um título totalmente pago e um título aberto.
- No consolidado global, transferências internas entre polos se anulam.
- No escopo de polo, entrada e saída de transferência podem aparecer, identificadas como transferência e fora do resultado operacional.

## Invariantes

1. Um evento financeiro afeta cada medida exatamente uma vez.
2. Obrigação aberta não reduz `saldo_caixa_registrado`.
3. Liquidação reduz o caixa pelo valor realizado; estorno desfaz esse efeito e reabre o saldo.
4. Cancelados e excluídos não integram a posição corrente.
5. Ausência de histórico temporal de cancelamento ou exclusão torna o passado reexpressado, nunca histórico verdadeiro.
6. Financiamento não contamina o resultado operacional.
7. Rateio não duplica título, baixa, caixa ou valor global.
8. Soma da agenda e dos detalhamentos deve reconciliar com os KPIs do mesmo corte e horizonte.
9. Todos os componentes do painel compartilham o mesmo snapshot e escopo.
10. Nenhuma fórmula monetária, percentual, classificação ou fallback financeiro existe no frontend.
11. Valores realizados usam valor efetivo. Valor programado só pode ser fallback quando uma regra canônica comprovar liquidação integral e expuser a origem do fallback.
12. Escopo global e escopo de polo usam as mesmas regras semânticas; muda apenas o universo autorizado.

## Incompletude, `null` e zero

Zero significa que o universo elegível foi consultado integralmente e a soma comprovada é zero.

`null` significa que o sistema não possui base suficiente para afirmar o valor ou percentual. Nunca converter `null` em zero no backend ou frontend.

Cada seção deve informar:

- `completo`: booleano;
- `motivos_incompletude`: códigos estáveis;
- `fontes_consideradas`;
- `fontes_indisponiveis`;
- `itens_nao_classificados` e seu valor conhecido, quando aplicável.

Motivos mínimos:

- `SALDO_BANCARIO_NAO_INTEGRADO`;
- `VINCULACAO_INCOMPLETA`;
- `ENTRADAS_FUTURAS_NAO_CONFIRMADAS`;
- `VALOR_REALIZADO_AUSENTE`;
- `CLASSIFICACAO_OPERACIONAL_AUSENTE`;
- `HISTORICO_TEMPORAL_INCOMPLETO`;
- `SEM_OBRIGACOES`;
- `SEM_BASE_ELEGIVEL`.

Valor conhecido pode continuar visível como subtotal parcial, mas não pode receber rótulo de total completo.

## Casos críticos obrigatórios

Os testes contratuais e executáveis devem cobrir:

1. virada de dia em UTC sem mudar prematuramente a data de Maceió;
2. competência passada, atual e futura;
3. pagamento posterior ao corte reabrindo corretamente a obrigação na posição reexpressa;
4. rateio de duas frações de R$ 50 pagas em meses diferentes;
5. rateio com uma fração paga e outra pendente;
6. pagamento parcial com saldo remanescente;
7. estorno de baixa;
8. cancelamento e exclusão, incluindo o aviso de reexpressão histórica;
9. obrigação vencendo hoje, sem classificá-la como atraso;
10. fronteiras D+7, D+8, D+30 e D+31;
11. escopo Matriz, polo e global;
12. transferência interna neutra no consolidado global;
13. crédito, principal, juros e encargos de financiamento em buckets distintos;
14. convênio sem duplicar caixa nem recurso vinculado;
15. denominador zero em percentuais;
16. saldo projetado negativo e positivo;
17. recebível não confirmado excluído da projeção;
18. dado ausente retornando `null` e motivo, nunca zero silencioso;
19. valores altos, centavos e arredondamento somente no banco;
20. identidade entre KPI, agenda e detalhamento;
21. leituras concorrentes preservando um único snapshot;
22. acesso permitido e negado por perfil, módulo, aba e polo.

## Critérios de aceite da Etapa 1

- O workspace responde Hoje, Competência e Estrutura com regimes visivelmente separados.
- Todas as seções vêm de uma RPC orquestradora e do mesmo snapshot.
- O frontend não contém soma, subtração, percentual, rateio, classificação temporal ou decisão de fallback.
- Agenda, KPIs e detalhamento reconciliam exatamente para o mesmo filtro.
- Pagamento afeta o caixa uma única vez; obrigação aberta afeta apenas comprometido e projeção.
- Rateios preservam valores por fração e quantidades consolidadas por título.
- Financiamentos e transferências ficam fora do resultado operacional.
- Histórico limitado é rotulado `POSICAO_REEXPRESSA_NO_CORTE`.
- Saldo bancário ou livre não é inferido sem integração e vínculo completos.
- Toda métrica incompleta apresenta `null` ou subtotal parcial acompanhado de motivo explícito.
- Valores monetários são texto decimal canônico; datas usam ISO 8601; percentuais vêm prontos do backend.
- A RPC aplica autorização de identidade, empresa, módulo, aba e polo antes de ler dados, com grants mínimos.
- Testes críticos passam para escopo global e de polo.
- O orçamento de desempenho e o limite máximo de payload são definidos e medidos antes da publicação.

## Fora da Etapa 1

- saldo bancário conciliado sem integração bancária;
- patrimônio líquido contábil;
- previsão probabilística, sazonalidade ou aprendizado estatístico;
- cenários otimista, base e pessimista;
- orçamento versus realizado;
- personalização livre do layout;
- fotografia histórica verdadeira antes da temporalização de cancelamentos, exclusões e alterações relevantes.
