# Caixa — carregamento e origem dos cálculos

Análise de 07/11/2026. Evidências: auditorias locais do caminho ativo, métricas SQL agregadas e definições aplicadas obtidas pelo responsável via MCP; ensaio de ordem com CaixaPage real e transporte sintético. Não houve mutação financeira ou mudança de backend por esta frente. Não registrar cadastros, IDs de escopo ou payloads pessoais.

## Caminho ativo e prioridade

O módulo Caixa abre CaixaPage mensal diretamente; a alternativa CaixaWorkspaceModule não é a entrada desta rota. O cockpit compartilhado do Financeiro tem outro fluxo e não deve ser usado como prova do tempo de abertura do módulo Caixa.

A tela mensal monta 10 leituras financeiras por polo/competência, além da lista de polos quando o contexto permite. Posição a receber, prestação mensal e composição compartilham uma fila serial; os outros 7 resumos são independentes. Não foi identificado N+1 de rede por cartão. Detalhes interativos têm prioridade e cancelamento próprios; não é seguro remover a fila ou abrir concorrência ilimitada para tentar acelerar.

Na ordem anterior, a posição a receber iniciava antes da prestação; o bloco principal aguardava a prestação. O patch prioriza a prestação visível na mesma fila e mantém a leitura da carteira e composição. Não reduz o número de RPCs nem seu trabalho SQL total; procura antecipar a primeira informação principal, sem omitir a carteira.

## Estatística SQL histórica real

Agregados consultados pelo responsável, acumulados desde 31/08/2026 00:07:35 UTC:

| RPC | Chamadas | Média SQL, ms | Máximo SQL, ms |
| --- | ---: | ---: | ---: |
| get_caixa_composicao_mensal_v2_secure | 173 | 2702,04 | 7970,10 |
| get_caixa_receivables_position_secure | 160 | 2182,79 | 7505,43 |
| get_caixa_prestacao_mensal_secure | 659 | 1453,40 | 7959,22 |
| get_caixa_linha_corte_secure | 395 | 438,61 | 7001,14 |
| get_caixa_posicao_total_resumo_secure | 626 | 389,55 | 7833,17 |

Essas médias misturam versões, meses, escopos e concorrência. Não representam TTI, p95, rede, renderização ou a sessão atual; não somá-las para anunciar tempo de tela. Blocos temporários e shared hits elevados justificam inspecionar planos, mas não identificam sozinhos o operador dominante. Nenhum ganho real de produção foi medido nesta etapa.

As definições aplicadas já incluem composição em passagem única, reaproveitamento de evidência do mês, projeções canônicas de pagamentos e contagem distinta por título. Não reaplicar uma otimização histórica apenas por encontrar um CREATE antigo: alterações posteriores usam DO com guarda. Suspeitas de materialização/function scan e trabalho repetido entre RPCs continuam hipóteses para outro gate, sem migration ou índice neste patch.

## Plano de acesso inspecionado sem execução

O responsável obteve via MCP um EXPLAIN VERBOSE JSON sem ANALYZE para uma contagem sobre internal_financial_payments.cash_receivables(), com polo controlado e status relevantes. O plano mostrou Aggregate → FunctionScan de cash_receivables(), com filtro de polo/status fora da função. Isso confirma a barreira de pushdown nesse plano, sem medir tempo, executar o plano ou identificar qual helper domina o custo. Não houve operação financeira, leitura de payload pessoal ou migration.

Os helpers inspecionados estão marcados STABLE; cash_receivables usa search_path vazio. Esses metadados não substituem validação de autorização em sessão real. Um refinamento SQL posterior exige medição representativa e equivalência dos resultados canônicos, incluindo histórico, parcial, desconto, estorno e escopo; não faz parte do ganho de ordem de apresentação nem deste patch sem backend.

## Ensaio sintético controlado

O ensaio usa CaixaPage real e fixtures válidas, com delays fixos inspirados nas médias históricas; zero requests externos. Uma execução produziu:

| Marco do ensaio | Ordem anterior | Prestação priorizada |
| --- | ---: | ---: |
| Prestação disponível no modelo, ms | 3684,5 | 1465,6 |
| Resumo montado em DOM, ms | 3714,1 | 1493,1 |

A fila pesada permaneceu serial e as 10 leituras foram preservadas. A carga pesada inteira continuou perto do orçamento fixo de 6,338 s do simulador; diferenças de temporização do ambiente não comprovam ganho de throughput. Os números são somente demonstração de ordenação no harness, não promessa de economia de 2,2 s em produção. O cenário equivalente precisa ser medido em sessão autenticada para avaliar o efeito real.

## Conferência no Chrome com transporte sintético

O responsável conferiu o cenário AFTER em Chrome com componentes reais e fixture controlada: prestação disponível em 1464,2 ms, resumo DOM em 1468,6 ms, 10 de 10 consultas e zero rede externa. Trata-se de execução local com delays sintéticos, não medição autenticada de produção.

A tentativa BEFORE no Chrome chegou a 17/18 consultas por refoco/DevTools; ela não forma par comparável com AFTER e foi excluída de qualquer anúncio de ganho. A comparação válida de ordem continua sendo o ensaio CLI pareado acima, cujas duas execuções preservam 10 consultas e o mesmo orçamento pesado de 6338 ms. Não comparar métricas de tentativas diferentes para calcular porcentagem, TTI ou economia real.

## Consistência de Realtime

A auditoria encontrou a linha de corte fora da invalidação do hook mensal, enquanto outras posições já eram atualizadas. StaleTime não agenda atualização sozinho. A correção deve invalidar a chave canônica do polo afetado e a visão consolidada, preservando competência, prefixos existentes, debounce e refetch somente de consultas ativas. Isso é correção de frescor/consistência, não uma medição de performance.

## Valores financeiros e operações de interface

No caminho local auditado não foi identificado cálculo de saldo, juros, multa, desconto, rateio ou resultado financeiro no React. Valores e percentuais são fornecidos pelas RPCs; equações textuais apenas os apresentam. Coerções de contrato, Intl, formatação decimal exata, coordenadas SVG, clamp de barras, datas e paginação são operações de adaptação/geometria, não contabilidade. Não há fórmula financeira para migrar neste patch.

Preservar autorizações, evidência histórica, Proesc/EAD, pagamentos parciais e estorno, snapshot/corte America/Maceio e separação do principal de financiamento. Não trocar projeções canônicas por SELECT direto de tabelas nem recalcular totais no cliente para contornar latência. Nenhum contrato, cálculo SQL, RLS, índice, schema ou compositor PDF é alterado neste lote.

## Cobertura e pendências

Testes e validação local estão consolidados no registro do lote; TypeScript, build completo e gates de linhas/RAG/operação aprovados. O responsável conferiu AFTER normal e troca de competência Novembro→Outubro com fixtures responsivas ao mês; regressões de ordem/cache/escopo têm provas contratuais e DOM. Essa aceitação local não equivale a teste visual de todos os estados, TTI autenticado real ou operações financeiras de produção. A cobertura de Parceiros a 390 px pertence à etapa anterior e não comprova o Caixa; esta etapa não é um novo redesign CSS.

Artefatos temporários usados para rastrear a análise: universo-caixa-rpc-audit.md, universo-caixa-rpc-applied-adendo.md, universo-caixa-frontend-audit.md, universo-caixa-rpc-metrics.json e universo-caixa-order-benchmark.json em tmp. Apenas o resumo sanitizado deste documento pertence à entrega; fixtures, dumps, logs, dados pessoais e planos com IDs não entram no manifesto.
