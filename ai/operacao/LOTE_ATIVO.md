# Lote ativo

## Lote: 2026-11-12-servicos-receber-padrao-financeiro
Objetivo: alinhar Serviços ao padrão Técnico/EAD e ao mesmo recebimento canônico, com correção local nº 6/nº 7 expressamente autorizada.
Status: implementação e testes concluídos; candidato 4.8.330, revisão 339, em validação de publicação.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-servicos-receber-padrao-financeiro.md`.
Base: versão 4.8.329 integrada em a43ee0f4d538bda5b0e459bd54c6f763f05a13ca, preservando Serviços, Caixa, Pix e retorno fiscal automático.
Aceite: padrão visual existente, botão Receber nos títulos elegíveis, histórico acessível sem permitir baixa de nota cancelada, grupos e totais canônicos por polo.
Validação: reproduzido o motivo real do bloqueio na nº 6; usuário confirmou criação local para a nº 7 com vencimento em 30/11/2026 e sem BolePix.
Limitação: nenhuma interface ou navegador aberto; teste DOM não substitui a conferência geométrica autenticada pelo usuário.
