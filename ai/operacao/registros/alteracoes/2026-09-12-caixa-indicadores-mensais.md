# Caixa: inadimplência e margem mensais — 4.8.51

Estado: publicado pelo PR145; banco, build, validação focada e smoke autenticado do Caixa em produção concluídos. PDF final autenticado não repetido.

Base publicada: PR144, squash 4b513e085dcb6c0dcf133cf9c0975f28a0023caf, versão 4.8.50/revisão 59. Revisão preparada: 4.8.51/60.

## Problema e resultado

Inadimplência e margem no Caixa precisam corresponder ao mês e polo escolhidos. A RPC passa a usar o principal das obrigações com vencimento no mês selecionado como base, em vez de combinar um saldo de outro período com o recorte apresentado. A interface e o relatório recebem o mesmo resultado canônico.

A mudança é crítica por envolver indicadores financeiros, RPC e sua apresentação no PDF oficial. O escopo inicialmente cobriu os dois indicadores e seus contratos. Antes do PR, o usuário acrescentou uma linha laranja de inadimplência no gráfico Movimentação dos últimos três meses, usando a mesma regra mensal canônica da RPC. Os demais indicadores e fatos financeiros são preservados.

## Contrato aplicado

- Denominador: principal elegível das obrigações cujo vencimento pertence ao mês/polo selecionado. Numerador: principal dessa mesma base que estava vencido e não liquidado no corte.
- O corte é hoje para o mês corrente e o encerramento para mês passado. Vencimento de hoje não é tratado como atraso; pagamento feito hoje é considerado liquidado. Em mês futuro, não se antecipa atraso.
- Pagamento até o corte quita a obrigação mesmo com desconto. Pagamento posterior ao encerramento permanece aberto na posição histórica; não se subtrai o valor recebido do principal nominal para inventar saldo.
- Proesc UNKNOWN/REVIEW ou evidência incompatível fica fora do numerador e denominador. Quantidade e principal em conferência são devolvidos com indicador de incompletude, visível na tela e no PDF.
- CANCELADO/SUSPENSO e ciclos manuais preparados sem emissão são excluídos. Empréstimos financeiros mantêm a classificação operacional anterior.
- Base zero retorna percentual zero definido pelo servidor, com metadados de completude preservados. Mês/polo acompanham consulta, cache e resposta; frontend apenas apresenta bases, percentual e identificação do período.
- O wrapper mantém seu OID, autorização existente e demais campos. Polo global exige permissão global; polo específico continua sujeito à permissão correspondente. Helper de agregação permanece privado.
- Migration 20260913010000 aplicada por MCP com sucesso; fonte de 278 linhas agora imutável. Nenhum pagamento, cadastro ou cobrança foi alterado pelo cálculo.

## Complemento implementado antes do PR

- Linha laranja de inadimplência acrescentada ao gráfico Movimentação dos últimos três meses.
- A série vem do backend, com mês/polo e a mesma coorte, corte e exclusões do indicador mensal. A interface não recalcula a inadimplência.
- Migration 20260913011000 aplicada por MCP com sucesso para a série; ela e a 20260913010000 são imutáveis. Contratos, parser e gráfico foram atualizados no mesmo lote.
- Manifesto final ampliado para 26 arquivos, substituindo o de 23 da etapa inicial. Nenhum PR desta revisão foi publicado nesta preparação; RAG será reindexado uma vez pelo coordenador no fechamento.

## Validação

- Revisão independente do SQL aprovada, incluindo corte atual/histórico, pagamento com desconto, exclusões e fronteira de autorização.
- Teste SQL real aprovado em 2,6 segundos: indicadores e relatório PDF usam o mesmo resultado, demais compromissos e posição de Caixa preservados. Foram sete chamadas RPC de 132 a 241 ms, com polos, soma global e relatório aprovados. Não havia usuário restrito ativo para a negativa específica por polo/global; o teste registrou essa limitação. Negativas sem identidade e de privilégios aprovadas; a guarda raw permanece inalterada.
- Julho/2026, Matriz: R$ 8.676,90 de principal vencido sobre R$ 38.806,30 elegíveis, margem de 22,36%. Outras 39 obrigações/R$ 11.035,20 permanecem em conferência e não compõem a base.
- Setembro/Matriz: R$ 4.288,30 e 25,98%; outubro futuro: R$ 0,00 e 0%, sem atraso antecipado.
- 64 testes aprovados: 57 Caixa (incluindo sete PDF), três dos cards e quatro do gráfico. TypeScript global e ESLint sem diagnósticos.
- PDF nativo validado: cinco páginas, fonte Inter incorporada, conteúdo vetorial e primeira página completa/em conferência inspecionada. Interface sintética em 1280 e 390 sem overflow.
- Teste SQL da série aprovado no banco real em 2,2 segundos, incluindo helper privado, negativas, valor zero, meses e paridade do relatório. Consultas de três/seis meses concluíram em 512/278 ms. Julho R$ 8.676,90, agosto R$ 4.198,50 e setembro R$ 4.288,30; registros em conferência respectivamente 39, 56 e 110.
- Build final aprovado em 7,42 segundos. Gráfico e tooltip inspecionados em PNG desktop/mobile, sem overflow.
- A sessão autenticada foi recuperada: Caixa setembro na versão pública 4.8.50 confirmou os novos dados RPC de R$ 4.288,30 e 25,98%. Após publicação, o coordenador conferiu o Caixa em produção: rótulos mensais, linha laranja, setembro R$ 4.288,30/25,98% e bases em conferência corretos; Recebíveis carregou R$ 11.937,07 recebidos e 93 cobranças a vencer.

## Publicação

PR145 publicado após autorização renovada do usuário, squash `02409544d1def71a655e2831c0a6c72cd30fc891`. Vercel SUCCESS e HTTP200 confirmados, asset `main-C8lAX0ye.js` contém 4.8.51. As imagens do usuário às21:15 confirmam os novos rótulos, a linha laranja e os valores mensais em produção/setembro e localhost/agosto. O teste autenticado do PDF final ainda não foi repetido; o compositor e sua paridade RPC foram validados antes da publicação. RAG final deste lote:11fontes/68chunks; bootstrap17867bytes após compactar referências históricas do lote ativo.

## Manifesto explícito

Total: 26 arquivos.

Quinze arquivos de interface/PDF/serviço/contratos/testes, duas migrations, dois testes SQL e sete de versão/documentação/registro, com o teste de gráfico contado entre os arquivos de interface. Publicar somente os caminhos abaixo sobre 4b513e085dcb6c0dcf133cf9c0975f28a0023caf. O registro de manifestos usa a base remota mais este lote; três referências locais paralelas permanecem fora da publicação, assim como a alteração isolada Sistema anterior no utilitário financeiro.

- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/components/CaixaCompromissosCards.tsx`
- `modules/gestor/caixa/components/CaixaMovimentacaoChart.tsx`
- `modules/gestor/caixa/components/CaixaCompromissosCards.test.tsx`
- `modules/gestor/caixa/report/CaixaReportDocument.tsx`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.summary.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts`
- `modules/gestor/caixa/caixa.service.ts`
- `modules/gestor/caixa/caixa.types.ts`
- `modules/gestor/caixa/caixa.contracts.ts`
- `modules/gestor/caixa/caixa.mappers.ts`
- `modules/gestor/caixa/caixa-data-scope.test.ts`
- `modules/gestor/caixa/caixa-patrimonio-resumo.test.ts`
- `modules/gestor/caixa/report/caixa-report.mapper.test.ts`
- `supabase/migrations/20260913010000_caixa_monthly_delinquency.sql`
- `supabase/tests/caixa_monthly_delinquency.readonly.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/registros/alteracoes/2026-09-12-conciliacao-origem-proesc-banese.md`
- `ai/operacao/registros/alteracoes/2026-09-12-caixa-indicadores-mensais.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/caixa/components/CaixaMovimentacaoChart.test.tsx`
- `supabase/migrations/20260913011000_caixa_monthly_delinquency_series.sql`
- `supabase/tests/caixa_monthly_delinquency_series.readonly.sql`
