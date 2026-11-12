# Lote ativo

## Lote: 2026-11-12-nfse-retorno-automatico
Objetivo: acompanhar automaticamente o retorno de emissão/cancelamento e atualizar o Emissor via Realtime/TanStack Query, sem consulta manual.
Status: concluído e publicado em produção na versão 4.8.319; PR #412 integrada, 15 workflows aprovados e domínio público verificado por HTTP.
Autorização: usuário autorizou correção, automação e publicação em produção. Nenhuma emissão ou cancelamento real foi realizado como teste.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-nfse-retorno-automatico.md`.
Implantação: duas migrations aplicadas; nfse-national-individual v33 ativa com JWT verificado; worker e cron habilitados; Vercel READY no domínio público.
Limitações: validação visual pelo usuário; latência de uma nova emissão/cancelamento fiscal após a publicação ainda não medida.
