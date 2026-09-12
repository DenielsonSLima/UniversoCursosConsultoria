# Lote ativo

Estado: CAIXA INDICADORES MENSAIS — FECHAMENTO 4.8.51 EM ANDAMENTO

## Lote: 2026-09-12-caixa-indicadores-mensais

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-caixa-indicadores-mensais.md`

- Pedido: inadimplência e margem do Caixa para o mês e polo selecionados. Usuário acrescentou antes do PR uma linha laranja de inadimplência no gráfico Movimentação dos últimos três meses, calculada pela mesma regra RPC mensal.
- RPC usa principal vencido não liquidado no corte sobre principal elegível com vencimento no mês/polo. Pagamento posterior mantém a posição histórica; desconto em pagamento até o corte quita o principal. Proesc sem prova fica fora das bases com metadados de conferência.
- Preservar seleção mês/polo, pagamentos e demais indicadores. Não acrescentar cálculo financeiro no frontend.
- Base PR144/4b513e085dcb6c0dcf133cf9c0975f28a0023caf. Versão preparada 4.8.51/revisão 60; migration aplicada/imutável, SQL real e paridade dashboard/PDF aprovados. Julho Matriz: R$ 8.676,90/R$ 38.806,30 = 22,36%; 39 obrigações/R$ 11.035,20 em conferência.
- Manifesto final de 26 arquivos, incluindo série mensal/linha laranja e teste do gráfico; duas migrations aplicadas/imutáveis. 64 testes, TypeScript global, ESLint, SQL real/dashboard/PDF e gráfico desktop/mobile aprovados. Build final aprovado em 7,42 segundos; smoke autenticado do Caixa setembro recuperado na versão pública 4.8.50, confirmando RPC novo R$ 4.288,30/25,98%; smoke dos novos rótulos/linha na 4.8.51 ainda pendente após deploy. Negativa específica para usuário restrito sem fixture ativa; guardas sem identidade/privilégios aprovadas. Série validada: julho R$ 8.676,90, agosto R$ 4.198,50 e setembro R$ 4.288,30. Produção será solicitada após PR pronto. Nenhuma publicação ou reindexação desta revisão foi feita.

## Entrega anterior: 2026-09-12-conciliacao-origem-proesc-banese

Manifesto: `ai/operacao/registros/alteracoes/2026-09-12-conciliacao-origem-proesc-banese.md`

- PR144 incorporado após autorização explícita, squash 4b513e085dcb6c0dcf133cf9c0975f28a0023caf. Vercel SUCCESS, deployment J7mkS62Avibmi9AXPuR42EGj3jpE; HTTP200 asset main-B8U4uhUw.js confirma 4.8.50. Smoke autenticado final ainda acompanhado pelo coordenador.
- Filtro Todas/Proesc/Banese e estados/totais canônicos nas RPCs, sem Atualizar Dados ou atualização em lote. Proesc REVIEW não presume vencimento nem oferece consulta Banese.
- Duas migrations aplicadas e imutáveis; testes reais de autorização, escopo, paginação, estados e paridade V2 aprovados. Build, TypeScript, ESLint e testes focados aprovados.
- RAG reindexado uma vez pelo coordenador: 11 fontes, 71 chunks. Não repetir nesta continuação documental.

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

