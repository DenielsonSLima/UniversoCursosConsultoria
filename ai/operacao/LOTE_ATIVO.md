# Lote ativo

## Lote: 2026-10-07-aviso-c2-antes-do-assistente

Estado: candidata 4.8.182; patch, testes focados e revisão aprovados; publicação em produção ainda não autorizada.
Objetivo/aceite: clicar em gerar C2 abre primeiro o aviso com parcelas abertas; Continuar abre o assistente existente sem emitir; Cancelar fecha; C1 permanece normal.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-07-aviso-c2-antes-do-assistente.md`.
Validação: reprodução do defeito, dez cenários React DOM, 31 testes de contrato/handler, lint e revisão independente; TypeScript e build da prévia remota aprovados. Navegador proibido pelo responsável; smoke visual não executado.
Base remota: main `3f7a749149050f6dac08b095e6d54106824fd9b0` (4.8.181). Sem mutation financeira, migration ou deploy de Edge Function.

## Contexto anterior preservado

Aviso original: `ai/operacao/registros/alteracoes/2026-10-07-aviso-segundo-ciclo.md`.
Correção anterior: `ai/operacao/registros/alteracoes/2026-10-07-correcao-financeira-limitada.md`.
A restauração operacional de três matrículas da T46 foi concluída em lote separado, registrada no PR #274; não integra este manifesto de interface.
