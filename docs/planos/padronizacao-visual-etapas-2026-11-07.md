# Padronização do Portal — etapas de 07/11/2026

Os módulos desta sequência já estão autorizados pelo usuário. Concluir e validar Parceiros antes de iniciar qualquer módulo seguinte; a passagem entre etapas é um gate técnico do responsável, sem nova pergunta de autorização. Preservar informações, campos, regras, validações, permissões, exportações e dados canônicos. O padrão visual está em docs/design/interface-compacta.md.

| Etapa | Frente | Estado | Critério de passagem |
| --- | --- | --- | --- |
| 0 | Parceiros: cadastros Aluno/Professor/PF/PJ, cartões, Responsáveis e seletores | Concluída e publicada em produção | PR #347/merge 2b29a02745fe44ebc7f64373c67123235103d6b5, 14 checks verdes e deployment dpl_8bJCAmbfhmQq97jHZEM4yX1bXTdY READY. HTTP público 200 e asset com 4.8.252 confirmados; não equivale a validação autenticada ou de operações. |
| 1 | Caixa: prioridade de carregamento e origem dos cálculos | Validação local concluída; aguardando publicação | Priorizar prestação na fila e invalidar linha de corte; manter cálculos no backend e separar estatística histórica, simulação e medição real. Regressões e smoke local de ordem/troca de mês conferidos; build/TypeScript/RAG aprovados, publicação sob o responsável antes de avançar. |
| 2 | Configurações | Aguardando etapa anterior; não iniciado | Delimitar submódulos, comparar com o padrão compacto, preservar campos e contratos, implementar e validar quando o gate técnico anterior estiver satisfeito. |
| 3 | Comunicação | Aguardando etapa anterior; não iniciado | Conferir o fluxo real e seu contrato; mudanças visuais não autorizam envio, ativação, push ou operação remota. |
| 4 | Biblioteca | Aguardando etapa anterior; não iniciado | Mapear o escopo após o gate técnico anterior; preservar conteúdo, permissões e comportamento; smoke proporcional após o patch. |

## Prioridade específica de Caixa

O pedido atual prioriza desempenho, não um redesign principal. Com Parceiros integrada, investigar o tempo até os dados, waterfalls, requests duplicados e retorno das RPCs. Registrar métricas comparáveis antes/depois e distinguir rede, banco, cache e renderização. Consultas remotas devem seguir MCP e as guardas do projeto.

Valores e cálculos financeiros devem vir do contrato canônico do backend/RPC. Se a auditoria encontrar cálculo financeiro no frontend, demonstrar o caminho e preparar a correção contratual; não reproduzir fórmula no cliente nem mudar números, reconciliação ou permissões por CSS. A origem canônica e o resultado real devem ser validados antes de avançar.

## Execução e publicação

- Um módulo por vez; não iniciar análise de código, implementação ou operação do seguinte enquanto o atual aguarda validação técnica. A aprovação de cada etapa é conferência do responsável, não uma nova autorização do usuário.
- Cada etapa terá escopo, manifesto, riscos, teste focado e smoke do fluxo afetado. Build completo no fechamento quando a integração/publicação justificar.
- Registrar erros e limitações reais; teste sintético não substitui conferência visual nem prova acesso a produção.
- Preservar alterações paralelas e não incluir tmp, harnesses, PDFs ou screenshots gerados na entrega.
- O usuário autorizou entregar o que estiver pronto e continuar a sequência. Não é necessário perguntar novamente ao concluir cada módulo; os checks e o gate técnico do responsável antecedem sua publicação. Nada deste plano autoriza publicar implementação não validada ou afirmar que uma integração já está Ready em produção.

Este plano registra intenção e sequência. Não afirma que os próximos módulos foram analisados ou alterados.
