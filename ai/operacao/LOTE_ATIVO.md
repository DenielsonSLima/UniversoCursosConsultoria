# Lote ativo

## Lote: 2026-11-12-nfse-servicos-recebiveis-bolepix
Objetivo: gerar os recebíveis obrigatórios de serviços após autorização da NFS-e, com parcelamento, BolePix e cancelamento bancário automático comprovado.
Status: candidato 4.8.327, revisão 336, reconstruído sobre a correção fiscal 4.8.326; dezesseis migrations aplicadas via MCP e quatro Edges ACTIVE/JWT conferidas pelo responsável; PR 416 em rascunho até o novo CI.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-nfse-servicos-recebiveis-bolepix.md`.
Aceite: títulos únicos por parcela, Financeiro > A Receber > Serviços, termos canônicos, permissão Receber para BolePix, prova bancária antes da baixa, pagamentos preservados e retorno por Realtime/TanStack Query.
Validação: regressões locais e PostgreSQL17 do pacote canônico aprovados; novo CI valida a integração sobre PIX 4.8.325 e retorno automático 4.8.326.
Limitação: nenhum envio bancário/fiscal real de teste; smoke visual interativo fica com o usuário no sistema local; worker bancário ativado após conferência, com cron ativo e zero jobs de criação/cancelamento.
