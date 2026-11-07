# Lote ativo

## Lote: 2026-11-07-caixa-prioridade-carregamento

Priorizar a prestação mensal no Caixa ativo e manter a linha de corte coerente no Realtime, preservando valores canônicos, escopo, fila serial, cancelamento e operações. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-07-caixa-prioridade-carregamento.md`. Frentes independentes de ordem da tela, invalidação e documentação; sem RPC/schema/cálculo financeiro no frontend nem redesign principal. O diagnóstico distingue médias SQL históricas, simulação e tempo real de produção ainda não medido.

Base Parceiros 4.8.252 integrada na PR #347; produção READY confirmada pelo responsável com HTTP público 200 e asset 4.8.252, sem acesso autenticado ou dados. Caixa 4.8.253 tem validação local concluída para ordem de leitura e frescor; manifesto consolidado de 14 arquivos e CI dedicado. Chrome conferiu AFTER e troca de mês sob fixture, sem medição autenticada de produção. O usuário autorizou entregar o pronto e continuar; publicação exige os checks e o gate técnico desta etapa, sem nova confirmação. Configurações, Comunicação e Biblioteca aguardam. O fechamento inclui um único RAG e gates de integração; sync de workspace e publicação seguem comando do responsável. Cobertura móvel de Parceiros não comprova Caixa.
