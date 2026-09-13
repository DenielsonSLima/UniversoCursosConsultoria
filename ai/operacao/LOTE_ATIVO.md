# Lote ativo

Estado: RECUPERAÇÃO DA LEITURA INTERNA DOS WORKERS — EDGE PUBLICADA; FECHAMENTO 4.8.53

## Lote: 2026-09-13-workers-configuracao-resiliente

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-13-workers-configuracao-resiliente.md`

- Pedido: continuar investigação e corrigir a instabilidade, com agentes e autorização de publicação já concedida.
- Três frentes: implementação/testes, revisão independente e comparação dos bundles remotos. Coordenador integra e publica apenas o manifesto revisado.
- HTTP504 intermitente nos getters internos antecede consultas bancárias. Leitura SQL direta em 2,740 ms; origem exata da espera pela API permanece inconclusiva.
- Patch limitado a uma repetição da leitura dos segredos Banese/Push, com prazo total, abort e telemetria sanitizada. Não repete operações financeiras ou envios, nem altera banco, credenciais ou agendamentos.
- Preparação 4.8.53 sobre main b2b11a5cbd5fba8e4fd8fdea8d76b537e9add785; 45 testes Deno, revisão independente e build aprovados. Edge v101/v16/v6 ativas; smoke natural: 14 execuções HTTP200, incluindo duas falhas504 recuperadas na segunda leitura. Causa da instabilidade da API continua aberta.

## Entrega anterior concluída

- 4.8.52: PR146/squash b2b11a5c, CI/Vercel e HTTP200 confirmados. Smoke autenticado em produção confirmou Configurações, cinco abas Proesc, Caixa/linha laranja, Recebíveis e filtros Proesc/Banese. Registro: `ai/operacao/registros/alteracoes/2026-09-12-consulta-api-proesc-banese.md`.
- A conferência financeira residual e o EDI7 ausente continuam descritos nos registros anteriores; este lote não modifica esses estados.
