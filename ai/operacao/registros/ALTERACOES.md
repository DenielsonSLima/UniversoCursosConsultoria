# Registro de alterações

Registre aqui o encerramento de cada lote. Este arquivo complementa, mas não substitui, o changelog de produto.

| Data | Lote | Resultado | Validações | Observações |
| --- | --- | --- | --- | --- |
| 2026-08-06 | `operacao-memoria-rag` | Implantação da memória canônica, protocolo de lotes e RAG local | Testes focados, busca de amostra e validação de skill aprovados | Pronto para publicação atômica; sem alteração de produto |
| 2026-08-06 | `patrimonio-contas-a-pagar-emprestimos` | Patrimônio por polo, Contas a Pagar, empréstimos com rateio canônico e Caixa operacional separado | Financeiro 4/4, Caixa 20/20, Gestor 30/30, Empréstimos 7/7, ESLint focado e build aprovados; RLS/RPC/Realtime verificados por MCP | Pronto para uma única PR/Preview; produção web não foi solicitada |
| 2026-08-07 | `patrimonio-contas-a-pagar-emprestimos` | Complemento de rateio: CxP física na Matriz com custo econômico por polo; empréstimo da Matriz rateado ou empréstimo próprio `SEM_RATEIO` no polo | Gestor 30/30, contratos financeiros 6/6, empréstimos Deno 9/9, Caixa 20/20, lint focado e build aprovados; RPC/RLS/Realtime e revogação das rotas legadas verificados pelo MCP | Pronto para uma única PR/Preview; produção web não foi solicitada |
| 2026-08-07 | `documentos-secretaria-calendario` | Modelos de contrato, carteirinha de preceptor e calendário; emissões isoladas na Secretaria; grade/horários canônicos e validação QR | PDF vetorial 3/3, validador público 26/26, calendário 4/4, contratos SQL/RPC 6/6, validação documental 124/124, lint e build aprovados; inspeção de texto e recursos sem imagem A4 | Prévia, download e impressão compartilham o mesmo Blob vetorial para os três documentos; produção autorizada e pendente do commit/Preview final |
