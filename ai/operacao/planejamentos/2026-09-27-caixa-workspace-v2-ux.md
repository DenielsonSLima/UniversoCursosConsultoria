# Caixa Workspace v2 — Direção UX

Data: 27/09/2026

Status: etapas 0–1 autorizadas para planejamento
Escopo deste documento: direção visual, contrato de informação e critérios de aceite. Não autoriza alteração de backend, RPC, cálculo financeiro ou publicação.

## 1. Objetivo

Transformar o Caixa em uma **mesa de tesouraria**: uma área de trabalho sóbria, operacional e orientada a decisão. A primeira dobra deve responder, nesta ordem:

1. O que exige ação hoje?
2. Como está a competência selecionada?
3. Qual é a estrutura financeira e patrimonial do escopo?

A experiência deve manter a separação entre:

- valores realizados ou registrados;
- compromissos em aberto e projeções;
- posições patrimoniais;
- indicadores parciais ou em conferência.

O frontend não calcula saldos, percentuais financeiros, coortes, cobertura ou posição líquida. Ele apenas valida o contrato, organiza e formata valores canônicos devolvidos pelos serviços.

## 2. Princípios da mesa de tesouraria

- **Ação antes de inventário:** atrasos e vencimentos imediatos aparecem antes de patrimônio e financiamentos.
- **Contexto sempre visível:** polo, competência, corte e atualização acompanham a leitura.
- **Uma natureza por visual:** fluxo, estoque, projeção e patrimônio não são misturados sem distinção.
- **Exceção chama atenção:** vermelho fica reservado a atraso, perda ou posição negativa; âmbar indica atenção, parcial ou pendência.
- **Densidade controlada:** menos cartões independentes e mais áreas compostas com hierarquia interna.
- **Sem ambiguidade temporal:** todo valor relevante identifica competência ou corte.
- **Drill-down preserva contexto:** qualquer navegação futura deve carregar polo, competência, data e filtro de origem.
- **Progressive disclosure:** detalhes estruturais ficam disponíveis sem competir com a operação diária.

## 3. Linguagem visual

### 3.1 Direção estética

- Base azul-marinho institucional para estrutura e indicadores de posição.
- Superfícies claras, bordas discretas e contraste tipográfico forte.
- Verde para entradas realizadas e posições favoráveis.
- Vermelho para valores vencidos, perdas ou resultados negativos.
- Âmbar para valores abertos, parciais ou em conferência.
- Azul-cinza para patrimônio e informações não operacionais.
- Sem gradientes decorativos em excesso, contadores animados ou efeitos que prejudiquem a leitura financeira.

### 3.2 Natureza do dado

| Natureza | Tratamento visual | Regra |
|---|---|---|
| Registrado/realizado | cor sólida e contraste alto | representa fato confirmado no corte |
| Comprometido/projetado | fundo suave, borda ou padrão secundário | nunca aparenta disponibilidade realizada |
| Patrimonial | azul-cinza e seção própria | não se mistura com caixa disponível |
| Parcial/em conferência | selo persistente e explicação textual | nunca indicado apenas por cor |
| Indisponível | traço e motivo | nunca convertido visualmente em zero |

## 4. Hierarquia Hoje → Competência → Estrutura

### 4.1 Hoje

Área operacional de maior prioridade:

- contas em atraso no corte;
- vencimentos de hoje;
- próximos sete dias;
- faixa diária de hoje a D+7;
- data mais antiga em atraso;
- data de corte.

### 4.2 Competência

Leitura do período selecionado:

- saldo de caixa registrado;
- entradas operacionais recebidas;
- saídas operacionais pagas;
- resultado operacional;
- contas com vencimento na competência;
- pagamentos realizados na competência;
- contas a vencer na competência;
- receitas, despesas, inadimplência e conciliação.

### 4.3 Estrutura

Leitura secundária e patrimonial:

- distribuição do saldo entre contas e caixas;
- convênios;
- financiamentos e rateios;
- patrimônio a custo;
- posição patrimonial líquida;
- posição total registrada;
- linha de corte e ponto de equilíbrio.

## 5. Wireframes

### 5.1 Desktop — 1280 px ou mais

```text
┌ Caixa ─ Escopo/Polo ─ Competência ─ Corte ─ Atualização ─ PDF ┐
├──────────────────────────────────────┬─────────────────────────┤
│ SALDO REGISTRADO                     │ OBRIGAÇÕES IMEDIATAS    │
│ R$ valor principal                   │ Em atraso               │
│ Banco registrado | Caixa local       │ Hoje | Próximos 7 dias  │
│ Entradas | Saídas | Resultado        │ Antiga | Quantidades    │
│                                      │ [D0][D1]...[D7]         │
├──────────────────────────────────────┴─────────────────────────┤
│ CONTAS DA COMPETÊNCIA | PAGAMENTOS REALIZADOS | A VENCER      │
├──────────────────────────────────────┬─────────────────────────┤
│ FLUXO DE CAIXA 6/12 MESES            │ ONDE ESTÁ O SALDO       │
│ Barras de entradas e saídas          │ Contas e caixas         │
│ Linha de saldo registrado            │ Composição compacta     │
├──────────────────────────────────────┴─────────────────────────┤
│ [Operação] [Obrigações] [Estrutura patrimonial]               │
│ Conteúdo analítico da seção selecionada                       │
└────────────────────────────────────────────────────────────────┘
```

Regras:

- A barra de contexto é compacta e pode permanecer sticky após o cabeçalho global.
- O lado esquerdo do cockpit explica a posição; o direito concentra risco e ação.
- A primeira dobra de 1440 × 900 deve conter contexto, cockpit e agenda diária.
- Gráficos e estrutura começam após a área operacional.

### 5.2 Tablet — 768 a 1279 px

```text
┌ Contexto em duas linhas ┐
├─────────────────────────┤
│ Saldo registrado        │
│ Entradas | Saídas       │
│ Resultado               │
├─────────────────────────┤
│ Em atraso | Hoje | 7d   │
│ [D0][D1][D2][D3]        │
│ [D4][D5][D6][D7]        │
├─────────────────────────┤
│ Contas | Pagamentos |   │
│ A vencer                │
├─────────────────────────┤
│ Fluxo                   │
│ Onde está o saldo       │
└─────────────────────────┘
```

Regras:

- Não reduzir tipografia a ponto de comprometer leitura.
- Transformar quatro colunas em duas antes de reduzir conteúdo.
- A agenda usa grade 4 × 2, sem rolagem horizontal obrigatória.

### 5.3 Mobile — 360 a 767 px

```text
┌ Caixa | Competência | Filtros ┐
├───────────────────────────────┤
│ EM ATRASO                     │
│ valor, quantidade e data      │
├───────────────────────────────┤
│ HOJE | PRÓXIMOS 7 DIAS        │
├───────────────────────────────┤
│ [D0][D1][D2] ... [D7] →       │
├───────────────────────────────┤
│ SALDO REGISTRADO              │
│ Resultado                     │
│ Entradas | Saídas             │
├───────────────────────────────┤
│ Contas | Pagamentos | A vencer│
├───────────────────────────────┤
│ Operação ▾                    │
│ Obrigações ▾                  │
│ Estrutura patrimonial ▾       │
└───────────────────────────────┘
```

Regras:

- Ordem orientada à urgência, não mera redução do desktop.
- A agenda pode usar rolagem horizontal com `scroll-snap`, indicação de continuidade e D0 sempre primeiro.
- Áreas estruturais ficam recolhidas por padrão.
- Nenhuma rolagem horizontal deve existir no `body`.

## 6. Contrato visual e fontes canônicas

### 6.1 Hoje — contas a pagar

| Visual | Campo canônico esperado | Observação |
|---|---|---|
| Data de corte | `contasPagarResumo.dataCorte` | mostrar junto ao título da área |
| Em atraso | `contasPagarResumo.emAtraso.valor` | string monetária; apenas formatação |
| Quantidade em atraso | `contasPagarResumo.emAtraso.quantidade` | inteiro canônico |
| Mais antiga | `contasPagarResumo.emAtraso.dataMaisAntiga` | ausência não significa erro |
| Vence hoje | `contasPagarResumo.agendaFinanceira.hoje.valor` | não somar novamente os dias |
| Quantidade hoje | `contasPagarResumo.agendaFinanceira.hoje.quantidade` | usar a data de `hoje.data` |
| Próximos sete dias | `contasPagarResumo.agendaFinanceira.proximosSeteDias.valor` | janela amanhã até D+7 |
| Quantidade nos sete dias | `contasPagarResumo.agendaFinanceira.proximosSeteDias.quantidade` | sem incluir hoje |
| Faixa D0…D7 | `contasPagarResumo.agendaFinanceira.dias[]` | renderizar exatamente os oito pontos validados |

### 6.2 Competência — posição e movimento

| Visual | Campo canônico esperado | Observação |
|---|---|---|
| Saldo registrado | `statement.saldosHoje.registradoTotal` | posição registrada no sistema no corte |
| Banco registrado | `statement.saldosHoje.bancarioRegistrado` | detalhe do saldo |
| Caixa local | `statement.saldosHoje.caixaLocal` | detalhe do saldo |
| Entradas operacionais | `statement.resumoCompetencia.entradasRecebidasBrutas` | fluxo realizado |
| Saídas operacionais | `statement.resumoCompetencia.saidasPagas` | fluxo realizado |
| Resultado operacional | `statement.resumoCompetencia.resultado` | usar valor e status devolvidos |
| Status do resultado | `statement.resumoCompetencia.resultadoStatus` | não inferir novamente pelo sinal |
| Contas da competência | `contasPagarResumo.contasCompetencia` | valor e quantidade pelo vencimento |
| Pagamentos da competência | `contasPagarResumo.pagasCompetencia` | valor inclui pagamentos efetivos parciais; quantidade conta títulos integralmente quitados |
| A vencer na competência | `contasPagarResumo.aVencerCompetencia` | posição aberta no corte |
| Receitas por modalidade | `statement.receitasPorModalidade[]` | usar valores, quantidades e percentuais canônicos |
| Despesas por categoria | `statement.despesasPorCategoria[]` | não recalcular percentuais |
| Conciliação | `statement.conciliacao` | contagens e atualização canônicas |
| Qualidade de dados | `statement.qualidadeDados` e `statement.classificacao` | alertas operacionais, sem ocultar dados válidos |

Não montar um percentual “pago versus aberto” com `pagasCompetencia` e `contasCompetencia`: valor pago e quantidade quitada possuem semânticas diferentes e não formam, por si só, uma coorte comparável.

### 6.3 Estrutura

| Visual | Campo canônico esperado | Observação |
|---|---|---|
| Onde está o saldo | `statement.contas[]` | usar `valorExibido` e `tipoValorExibido` |
| Convênios | `conveniosResumo.*` | distinguir `saldoDisponivel` de `saldoProjetado` |
| Financiamentos | `financiamentoResumo.*` | crédito não é receita operacional |
| Patrimônio | `patrimonioResumo.posicaoFechamento` | valores monetários textuais permanecem canônicos |
| Posição patrimonial líquida | `posicaoLiquidaResumo.valorLiquido` | nunca recompor patrimônio menos empréstimos no React |
| Posição total registrada | `posicaoTotalResumo.dados.valorTotalLiquido` | nunca recompor os três componentes no React |
| Linha de corte | `linhaCorteResumo.cobertura`, `.receitas`, `.despesas` | usar percentuais, margens e status devolvidos |

## 7. Gráficos

### 7.1 Linha

Usar para evolução temporal contínua:

- saldo registrado por competência;
- inadimplência ao longo do tempo, em visual separado.

Requisitos:

- mínimo recomendável de seis períodos; ideal de doze;
- eixo, unidade e zero identificáveis;
- pontos acessíveis por teclado e toque;
- não usar linha para categorias sem ordem temporal.

### 7.2 Barras

Usar para comparação direta:

- entradas versus saídas por competência;
- receitas por modalidade;
- despesas por categoria;
- valores diários da agenda financeira.

Preferir barras horizontais para listas com muitos rótulos. Ordenação e percentuais devem vir do contrato canônico quando tiverem significado financeiro.

### 7.3 Rosca

Usar apenas para composição de um total homogêneo:

- composição do saldo entre até cinco grupos;
- composição de despesas quando as categorias forem mutuamente exclusivas.

Não usar rosca para:

- evolução temporal;
- pago versus aberto com contratos de coortes diferentes;
- mais de cinco segmentos sem consolidar “Outros” no backend;
- comparar estoque com fluxo.

### 7.4 Waterfall

Usar para explicar a ponte entre uma posição inicial e final:

```text
Saldo inicial → Entradas realizadas → Saídas realizadas → Ajustes canônicos → Saldo registrado
```

O waterfall somente pode ser implementado quando todos os degraus e o saldo inicial forem fornecidos por um contrato canônico conciliável. O frontend não deve deduzir degraus faltantes para fechar a conta.

### 7.5 Regras gerais

- Não usar dois eixos para séries de naturezas distintas.
- Não sobrepor resultado, inadimplência, entradas e saídas em um gráfico congestionado.
- Toda visualização possui resumo textual ou tabela equivalente.
- Tooltips informam valor, quantidade, competência/data, escopo e eventual parcialidade.
- Cor nunca é a única forma de distinguir séries ou estados.

## 8. Estados

### Zero

- Mostrar o zero canônico formatado.
- Não representar zero como indisponibilidade.
- Não usar automaticamente verde ou mensagem de sucesso sem um status canônico que justifique isso.

### Parcial ou em conferência

- Exibir selo “Parcial” ou “Em conferência”.
- Preservar quantidades e observações canônicas.
- Explicar quais dados não foram incluídos.
- Não projetar nem estimar a parte ausente.

### Indisponível

- Mostrar “—” e o motivo conhecido.
- Usar o estado discriminado do contrato, como `posicaoTotalResumo.disponivel` e `motivo`.
- Não converter ausência, restrição ou histórico insuficiente em `R$ 0,00`.

### Erro

- Isolar a falha por painel.
- Falha em contas a pagar não esconde o statement; falha no statement não esconde contas a pagar.
- Oferecer nova tentativa quando o fluxo suportar refetch.
- Manter o último contexto selecionado.

### Carregamento

- Skeleton preserva aproximadamente a geometria final.
- Evitar trocar toda a página por spinner único.
- Mudança de polo ou competência não deve exibir dados do escopo anterior.

## 9. Interações e drill-down

- Cards acionáveis usam botão ou link semântico.
- Em atraso abre títulos vencidos no mesmo polo, competência e corte.
- Hoje ou um dia da faixa abre vencimentos da data selecionada.
- Entradas e saídas abrem movimentos da competência e natureza correspondentes.
- Conta bancária abre seu extrato contábil quando existir destino autorizado.
- O retorno restaura polo, competência, seção e posição de leitura.
- Perfil sem acesso não recebe CTA inoperante.
- Enquanto não houver destino confiável, o indicador permanece informativo e não aparenta ser clicável.
- Hover, foco e toque oferecem a mesma informação essencial.

## 10. Responsividade

- Breakpoints de aceite: 360, 390, 768, 1024, 1280, 1440 e 1920 px.
- Alvos de toque com pelo menos 44 × 44 px.
- Valores monetários longos podem quebrar linha ou reduzir moderadamente; nunca somem por truncamento sem alternativa.
- Controles de polo e competência permanecem acessíveis sem ocupar toda a primeira dobra.
- Em mobile, detalhes estruturais usam disclosure e não uma sequência permanente de cartões.
- Tabelas viram linhas empilhadas ou regiões roláveis identificadas; o `body` não ganha rolagem horizontal.
- Nenhuma informação essencial depende de hover.

## 11. Acessibilidade

- Contraste mínimo WCAG AA.
- Hierarquia de títulos consistente: um `h1`, seções em `h2` e subseções em `h3`.
- Foco visível em filtros, cards acionáveis, agenda e pontos de gráfico.
- Ordem de tabulação acompanha a ordem visual e a prioridade Hoje → Competência → Estrutura.
- Ícones decorativos ficam ocultos da árvore acessível.
- Valores devem possuir nome, natureza, período e status compreensíveis para leitor de tela.
- Gráficos possuem alternativa textual ou tabular.
- Tooltips abrem por foco, ponteiro e toque, e não contêm a única cópia de informação crítica.
- Animações respeitam `prefers-reduced-motion`.
- Alertas usam texto e ícone além de cor.

## 12. Primeiro lote visual

O primeiro lote visual poderá ser prototipado com fixtures tipadas enquanto o Workspace v2 é validado, mas seu cutover para produção depende da paridade aprovada da RPC agregadora. Ele deverá:

1. Criar o cockpit da primeira dobra.
2. Exibir a agenda canônica de oito dias.
3. Reorganizar saldo, entradas, saídas e resultado sem duplicação.
4. Reposicionar contas da competência, pagamentos e a vencer como contexto do período.
5. Preservar o gráfico e os painéis inferiores atuais abaixo da nova hierarquia.
6. Consumir uma única query do Workspace v2 no cutover, sem recompor valores de contratos v1 no React.

Componentes estimados:

- novo `CaixaExecutiveOverview`;
- novo `CaixaPayablesAgenda`;
- ajuste de composição em `CaixaPage`;
- ajuste em `CaixaStatementSection` para retirar KPIs duplicados;
- ajuste ou divisão de `CaixaContasPagarResumoCard`;
- testes focados de overview, agenda, estados e orquestração.

Não fazem parte do primeiro lote:

- gráfico de 6/12 meses;
- waterfall;
- nova biblioteca de gráficos;
- cálculo financeiro no frontend;
- drill-down para destinos inexistentes;
- personalização livre do layout.

## 13. Critérios de aceite

### Informação e contrato

- Todo valor exibido possui fonte canônica documentada.
- Nenhum saldo, percentual, resultado, patrimônio líquido ou posição total é recalculado no React.
- `pagasCompetencia.valor` e `pagasCompetencia.quantidade` mantêm suas semânticas distintas.
- Agenda renderiza exatamente os oito dias validados pelo mapper.
- Hoje não é somado novamente ao agregado dos próximos sete dias.
- Estoque, fluxo, projeção e patrimônio são visualmente distinguíveis.

### Hierarquia visual

- Em 1440 × 900, contexto, saldo, atraso, hoje, sete dias e agenda aparecem na primeira dobra.
- Nenhum KPI crítico aparece duplicado.
- Conteúdo estrutural não compete visualmente com obrigações imediatas.
- A ordem mobile começa por atraso e vencimentos.

### Estados e segurança semântica

- Zero, parcial, indisponível e erro têm tratamentos distintos.
- Erros são isolados por painel.
- Dados de polo ou competência anterior não aparecem durante troca de escopo.
- O protótipo não cria requests próprios; no cutover, uma query Workspace v2 substitui a composição de resumos da página.

### Responsividade e acessibilidade

- Não existe rolagem horizontal do `body` nos breakpoints de aceite.
- Todos os controles são operáveis por teclado.
- Foco, contraste, nomes acessíveis e alvos de toque atendem aos requisitos deste documento.
- Valores monetários extremos continuam legíveis.

### Smoke obrigatório

- Safari autenticado em desktop.
- Conferência responsiva em 390 × 844, 768 × 1024 e 1440 × 900.
- Matriz consolidada e polo individual.
- Competência atual e histórica.
- Cenários com atraso, sem atraso, pagamento parcial e dados em conferência.
- Loading, erro isolado, retry, zero, indisponível e valor negativo.
- PDF continua acessível.
- Nenhum erro de console, quebra de layout ou navegação sem permissão.

## 14. Decisões que ficam para lotes posteriores

- Biblioteca ou estratégia definitiva de gráficos.
- Ampliação da série temporal para 6 ou 12 competências.
- Contrato canônico para waterfall.
- Agrupamento definitivo das seções inferiores em abas ou disclosures.
- Rotas e filtros de drill-down.
- Personalização controlada dos painéis secundários.

Essas decisões não bloqueiam o protótipo visual. A integração publicável do cockpit e da agenda permanece condicionada ao contrato Workspace v2, ao snapshot único e à paridade financeira aprovados.
