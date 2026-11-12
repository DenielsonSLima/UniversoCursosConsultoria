# Lote ativo

## Lote: 2026-11-12-nfse-worker-central
Objetivo: acompanhar operações fiscais já submetidas sem depender da sessão, sem novos envios fiscais.
Status: integração 4.8.318 sobre a 4.8.317; gates finais antes da publicação e ativação.
Autorização: usuário solicitou correção e publicação do acompanhamento central; sem emitir ou cancelar notas reais.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-nfse-worker-central.md`.
Limitações: scheduler permanece desativado até implantação JWT verificado e smoke protegido sem claim fiscal.
