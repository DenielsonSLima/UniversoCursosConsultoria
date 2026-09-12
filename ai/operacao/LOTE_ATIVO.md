# Lote ativo

Estado: CONCILIACAO POR ORIGEM — IMPLEMENTACAO 4.8.50 EM ANDAMENTO

## Lote: 2026-09-12-conciliacao-origem-proesc-banese

Manifesto provisório: `ai/operacao/registros/alteracoes/2026-09-12-conciliacao-origem-proesc-banese.md`

- Pedido: remover Atualizar Dados e textos indevidos de Mercado Pago; acrescentar filtro Proesc/Banese junto à busca da Conciliação.
- Mudança crítica financeira/RPC/publicação; frentes backend e interface coordenadas pelo responsável do lote.
- Origem, filtro, paginação, contagens e totais pertencem ao backend. Frontend apresenta os dados canônicos.
- Preservar permissões/polos, monitores e histórico financeiro; nenhuma emissão, alteração de pagamentos ou reimportação faz parte deste lote.
- Base PR143/58a6675fcc531d4e907987b0d5281698fb6ad7e6. Versão preparada 4.8.50/revisão 59; implementação local concluída. Passaram 14 testes de contrato/modelo e 11 de renderização, TypeScript global e ESLint focado. Build completo aprovado; duas migrations aplicadas por MCP e teste SQL real aprovado, com nove chamadas de autorização/escopo, paginação, estados e paridade financeira. Publicação e smoke de produção pendentes.
- Filtro Todas/Proesc/Banese usa RPC; Proesc REVIEW aparece em conferência, sem vencimento presumido nem consulta Banese. Manifesto explícito de 24 arquivos; fontes das duas migrations aplicadas são imutáveis. Preservar alterações paralelas e construir publicação sobre a base remota. RAG somente no fechamento pelo coordenador.

## Entrega anterior: 2026-09-12-proesc-importacao-xls

Manifesto: `ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md`

- 4.8.49 concluída: PR143/squash 58a6675fcc531d4e907987b0d5281698fb6ad7e6, checks GitHub SUCCESS, Vercel SUCCESS, HTTP 200 no asset main-BVVN6ra3.js e versão 4.8.49 confirmada em acesso autenticado pela árvore de acessibilidade.
- Nove turmas, 392 matrículas e 385 pessoas; 6.071 cobranças, 3.536 pagas e R$ 898.688,99 recebidos. Auditorias de identidade, datas, valores e permissões sem divergências; T42/Radiologia preservadas.
- Nove históricos PARCIAL/PROESC_API idempotentes. Permanecem 2.535 obrigações em conferência e um CPF pendente; ciclo financeiro não é inferido.
- 6.417 vínculos monitorados, uma Conta Proesc compartilhada. Cron real HTTP200: 60 consultadas/sem alteração, zero falhas/revisões e sem timeout. RPCs resumo/rótulos aprovadas após as nove turmas.
- RAG reindexado uma vez pelo coordenador no fechamento. Payloads pessoais e executores reais permanecem privados.

## Entrega anterior: 2026-09-12-revisao-banese-proesc

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-revisao-banese-proesc.md`

- Entrega 4.8.47 concluída: PR 141 incorporado por squash e026a0f56c301f86ba9aee30c263042d97ff1631, Vercel success e versão pública confirmada pelo coordenador com HTTP 200 em main-BeqyXds2.js.
- Radiologia/Banese: pagamento no primeiro dia útil nacional de 2026 reconhecido sem alterar termos ou emitir novo título. Auditoria posterior confirmou PAGO por R$ 260,00 em 08/09/2026, com vencimento original em 06/09/2026.
- T42/Proesc: 346 vínculos, 204 pagos, 142 abertos e R$ 53.813,57 recebidos preservados. Duas provas históricas gravadas após a publicação; ambas VERIFIED e projetadas como CONCILIADO_POR_CONFERENCIA_PROESC, com desconto de R$ 19,90 cada, juros e multa zero. Recebíveis intactos e replay idempotente.
- Componentes desconhecidos continuam nulos; nenhum desconto inferido de diferença ou recebimento parcial. Calendário bancário limitado ao ano de 2026 comprovado.
- Validação local: 53 testes Caixa, 43 testes Deno, TypeScript, ESLint focado e build aprovados; ensaios SQL com rollback e PDF nativo renderizado aprovados.
- GitHub Actions do HEAD 17e83e67 permaneceu QUEUED sem runner ou etapas executadas, runs 34717154177/178. Não registrar CI aprovado. A consulta da branch main mostrou checks obrigatórios desativados.
- Worker100, payment-gateway-api32 e asaas-api96 publicados por MCP; migrations de composição/calendário aplicadas permanecem imutáveis. Detalhes e manifesto no registro anterior.
- A importação das nove turmas por XLS foi entregue nos PR142/143 e não integra o PR141.

