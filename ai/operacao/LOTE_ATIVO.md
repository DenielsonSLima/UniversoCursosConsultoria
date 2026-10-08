# Lote ativo

## Lote: 2026-10-07-aviso-c2-antes-do-assistente

Estado: entrega financeira 4.8.182 autorizada para produção em 08/10/2026, após revisão de três agentes.
Objetivo/aceite: C2 abre aviso de parcelas antes do assistente; Continuar não emite; Cancelar fecha; C1 normal. Fonte da restauração T46 já aplicada sincronizada sem reaplicação.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-07-aviso-c2-antes-do-assistente.md`.
Validação: dez cenários React DOM, 31 testes de contrato/handler, cinco regressões T46, lint, TypeScript, build e revisão independente aprovados. CI e Vercel são conferidos no commit integrado do PR #275.
Base remota: main `3f7a749149050f6dac08b095e6d54106824fd9b0` (4.8.181). Nenhuma nova mutation financeira ou emissão nesta publicação.
Limitação: navegador proibido pelo responsável; smoke visual autenticado não executado.

## Rastreabilidade

Restauração T46 já aplicada: PR #274 e `ai/operacao/registros/alteracoes/2026-10-07-restauracao-c1-t46.md`. Fonte da migration idêntica ao ledger remoto, sem reaplicação.
Editor do contrato: PR #276, candidata 4.8.183 em revisão final separada.
