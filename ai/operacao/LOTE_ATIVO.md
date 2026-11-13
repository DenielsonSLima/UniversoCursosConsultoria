# Lote ativo

## Lote: 2026-11-12-nfse-emitidas-colunas-alinhadas
Objetivo: padronizar as colunas e ações de todas as notas emitidas, incluindo a última linha sem menu de operação.
Status: implementação e validação DOM/CSS concluídas; candidato 4.8.329, revisão 338, para PR em rascunho sobre Caixa 4.8.328.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-nfse-emitidas-colunas-alinhadas.md`.
Base: Caixa 4.8.328, commit ad2240ac6628433cfc4743014196861d891badf1 (PR #417), herdando Serviços 4.8.327, PIX 4.8.325 e retorno fiscal 4.8.326.
Aceite: grade comum entre notas, espaço consistente para ações com ou sem menu, padrão compacto e quebra responsiva preservando informações e handlers.
Validação: teste DOM da lista e smoke DOM/CSS temporário com nome extenso, última linha sem menu, ações e contratos de 1440/768/390 px aprovados.
Limitação: nenhuma interface ou navegador aberto; JSDOM não mede a geometria renderizada. Smoke visual autenticado permanece pendente no acesso local.
