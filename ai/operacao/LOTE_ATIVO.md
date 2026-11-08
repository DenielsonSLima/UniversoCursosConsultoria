# Lote ativo

## Lote: 2026-11-08-nfse-preparacao-modelos

Corrigir timeout dos recebimentos históricos; exibir mês por extenso no cabeçalho; preservar alunos adicionados em Preparar emissão; cadastrar e escolher modelos por polo com campos de serviço, NBS, ISSQN, informações complementares e seletores dos catálogos oficiais. Acesso piloto Denielson e totais via RPC preservados; emissão fiscal desabilitada.

Mudança crítica autorizada, candidata 4.8.266 sobre 4.8.265. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-08-nfse-preparacao-modelos.md`. Três migrations aplicadas; outubro em 170,89 ms, sem divergência. Validados 65 testes frontend, 29 SQL e Safari local desktop/390 px. CI, Preview e produção conferidos no recibo `tmp/nfse-preparacao-production-receipt.json` antes do encerramento.
