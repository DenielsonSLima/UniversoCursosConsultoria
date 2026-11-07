# Padronização do Portal — etapas de 07/11/2026

Os módulos desta sequência já estão autorizados pelo usuário. Concluir e validar Parceiros antes de iniciar qualquer módulo seguinte; a passagem entre etapas é um gate técnico do responsável, sem nova pergunta de autorização. Preservar informações, campos, regras, validações, permissões, exportações e dados canônicos. O padrão visual está em docs/design/interface-compacta.md.

| Etapa | Frente | Estado | Critério de passagem |
| --- | --- | --- | --- |
| 0 | Parceiros: cadastros Aluno/Professor/PF/PJ, cartões, Responsáveis e seletores | Concluída e publicada em produção | PR #347/merge 2b29a02745fe44ebc7f64373c67123235103d6b5, 14 checks verdes e deployment dpl_8bJCAmbfhmQq97jHZEM4yX1bXTdY READY. HTTP público 200 e asset com 4.8.252 confirmados; não equivale a validação autenticada ou de operações. |
| 1 | Caixa: prioridade de carregamento e origem dos cálculos | Concluída e publicada em produção | PR #348/merge 7696675efb8db16b585d13a99c43ed2d2af72caf, sete checks verdes e deployment dpl_8UUawZsgmARrmxFLBxr7tN3s5nLe READY. HTTP público 308 → www 200 e asset 4.8.253 confirmados; sem medição autenticada de ganho em produção. |
| 2 | Configurações | Publicada em produção | PR #349/merge 73ea12b82dcd392761a19a84aa0eaf17002e553e, oito checks verdes e deployment dpl_FtSxWJPujuETjp6Qwx3q78nLMTuY READY; raiz 308 → www 200 e asset 4.8.254 confirmado pelo responsável. |
| 2a | Hotfix da foto em Parceiros | PR #354 integrada; deployment em andamento | Main 2ff0ac6c1a09c91c49e47841c28cbdb38ad6755c, dez checks verdes; candidato 4.8.258/revisão267 com MIME individual, avatar completo, recuperação privada e revalidação por remontagem/foco. |
| 3 | Comunicação | Adiada pelo usuário | Candidato isolado preservado, sem fundir ou publicar neste hotfix. |
| 4 | Biblioteca | Candidato 260/revisão 269 em conferência local | Interface compacta; explorador, liberação e publicação em etapas com contratos preservados. Gate visual representativo aprovado; validação integrada final e identidade da base main259, preservando foto258 e Histórico259 antecedem a publicação. |

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
