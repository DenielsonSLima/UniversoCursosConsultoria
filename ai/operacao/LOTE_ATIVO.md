# Lote ativo

## Lote: 2026-11-11-nfse-erros-arquivo-ambiente

Objetivo: permitir arquivar/restaurar rejeições definitivas na aba Erros e alinhar o ambiente fiscal entre Emissor e Configurações.
Status: implementação e validações focadas/build concluídas para 4.8.288; candidato para CI/Preview e publicação autorizada. Smoke nativo final pendente por cgWindowNotFound. Arquivamento é metadado reversível, sem excluir operação fiscal, origem ou financeiro. Ambiente compartilhado por contexto/unidade, Produção por padrão; histórico autorizado não é promovido a habilitação corrente. A emissão e o cancelamento anteriores permanecem preservados. Aceite, manifesto, evidência remota e publicação serão registrados no lote; nenhuma nova emissão ou remoção de registro real é necessária nesta entrega.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-11-nfse-erros-arquivo-ambiente.md`.
