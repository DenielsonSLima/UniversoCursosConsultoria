# Padronização do Portal — etapas de 07/11/2026

Os módulos desta sequência já estão autorizados pelo usuário. Concluir e validar Parceiros antes de iniciar qualquer módulo seguinte; a passagem entre etapas é um gate técnico do responsável, sem nova pergunta de autorização. Preservar informações, campos, regras, validações, permissões, exportações e dados canônicos. O padrão visual está em docs/design/interface-compacta.md.

| Etapa | Frente | Estado | Critério de passagem |
| --- | --- | --- | --- |
| 0 | Parceiros: cadastros Aluno/Professor/PF/PJ, cartões, Responsáveis e seletores | Verificado localmente; publicação atual autorizada | Publicar somente Financeiro 4.8.251 + Parceiros 4.8.252 conforme nova solicitação; CSS móvel aceito por PF real a 390 px e marcador compartilhado; respeitar os limites de cobertura documentados e os gates de publicação. |
| 1 | Caixa: prioridade de carregamento e origem dos cálculos | Pendente; não iniciado nesta rodada | Primeiro mapear RPCs, cadeia de requests, duplicações, cache e cálculos no frontend; medir o cenário real com métricas agregadas sem dados pessoais. Revisar diagnóstico e proposta antes do patch. |
| 2 | Configurações | Pendente; não iniciado nesta rodada | Delimitar submódulos, comparar com o padrão compacto, preservar campos e contratos, implementar e validar quando o gate técnico anterior estiver satisfeito. |
| 3 | Comunicação | Pendente; não iniciado nesta rodada | Conferir o fluxo real e seu contrato; mudanças visuais não autorizam envio, ativação, push ou operação remota. |
| 4 | Biblioteca | Pendente; não iniciado nesta rodada | Mapear o escopo após o gate técnico anterior; preservar conteúdo, permissões e comportamento; smoke proporcional após o patch. |

## Prioridade específica de Caixa

O pedido atual prioriza desempenho, não um redesign principal. Só após o aceite de Parceiros, investigar o tempo até os dados, waterfalls, requests duplicados e retorno das RPCs. Registrar métricas comparáveis antes/depois e distinguir rede, banco, cache e renderização. Consultas remotas devem seguir MCP e as guardas do projeto.

Valores e cálculos financeiros devem vir do contrato canônico do backend/RPC. Se a auditoria encontrar cálculo financeiro no frontend, demonstrar o caminho e preparar a correção contratual; não reproduzir fórmula no cliente nem mudar números, reconciliação ou permissões por CSS. A origem canônica e o resultado real devem ser validados antes de avançar.

## Execução e publicação

- Um módulo por vez; não iniciar análise de código, implementação ou operação do seguinte enquanto o atual aguarda validação técnica. A aprovação de cada etapa é conferência do responsável, não uma nova autorização do usuário.
- Cada etapa terá escopo, manifesto, riscos, teste focado e smoke do fluxo afetado. Build completo no fechamento quando a integração/publicação justificar.
- Registrar erros e limitações reais; teste sintético não substitui conferência visual nem prova acesso a produção.
- Preservar alterações paralelas e não incluir tmp, harnesses, PDFs ou screenshots gerados na entrega.
- A orientação mais recente autoriza publicar AGORA somente Financeiro 4.8.251 e Parceiros 4.8.252, já implementados, para conferência posterior do usuário em produção. Ela substitui a condição anterior de esperar todos os módulos. Não há publicação de implementação futura de Caixa, Configurações, Comunicação ou Biblioteca neste lote.

Este plano registra intenção e sequência. Não afirma que os próximos módulos foram analisados ou alterados.
