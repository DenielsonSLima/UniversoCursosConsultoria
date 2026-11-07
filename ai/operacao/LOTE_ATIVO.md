# Lote ativo

## Lote: 2026-11-07-parceiros-cadastros-compactos

Padronizar cadastros, seletores e cartões de Parceiros, preservando campos, valores, validações, escopo e quatro cartões por linha no desktop amplo. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-07-parceiros-cadastros-compactos.md`. Três frentes independentes: formulários; cartões/Responsáveis; auditoria de carregamento. Conferência local no Chrome a pedido do usuário. Análise de dados separa paginação local, filtro de polo e cache, com consultas remotas somente de leitura. A skill visual e sua especificação pertencem a manifesto operacional separado, solicitado expressamente pelo usuário.

Base técnica: Financeiro PR #347, 4.8.251; entrega Parceiros depende desse código. A orientação mais recente do usuário autoriza produção AGORA somente para Financeiro 4.8.251 e Parceiros 4.8.252 implementados, para conferência posterior. Substitui a condição anterior de esperar todas as etapas; Caixa, Configurações, Comunicação e Biblioteca continuam pendentes, sem início nesta rodada. Parceiros verificado localmente; CSS móvel compartilhado aceito por PF real a 390 px e markup comum, com limites de cobertura documentados. Não alterar dados, RLS ou consultas operacionais como efeito de manutenção visual.
