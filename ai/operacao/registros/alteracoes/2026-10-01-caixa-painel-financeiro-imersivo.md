# Caixa — painel financeiro imersivo e composição mensal

Estado: MIGRATION APLICADA E VALIDADA — PUBLICAÇÃO 4.8.147 AUTORIZADA

## Objetivo

Reorganizar a tela Caixa sem remover as informações existentes, tornando explícita a sequência entre fluxo realizado, compromissos, composição dos movimentos, distribuições, evolução, conciliação e posição estrutural. Incluir os cards de composição dos recebimentos e das despesas com os mesmos componentes financeiros usados pelo PDF.

## Decisões do domínio

- O backend continua sendo a única fonte de valores, quantidades, percentuais, resultado e completude; o React apenas valida, formata e apresenta.
- Entradas recebidas, saídas pagas e resultado operacional formam a leitura realizada. Posição contábil, contas em aberto, patrimônio, convênios e financiamento permanecem separados dessa equação.
- A trilha a receber expõe recebido, carteira futura confirmada, vencido e margem parcial/completa. A trilha a pagar preserva total da competência, pago, a vencer, em atraso, hoje e próximos sete dias.
- As roscas usam exclusivamente percentuais canônicos já devolvidos pela prestação mensal; o acumulado calculado no cliente serve apenas para posicionamento SVG.
- Ausência, erro, zero comprovado e composição parcial continuam estados distintos. Campo não comprovado aparece como `—`, nunca como zero inferido.
- Posição e patrimônio ficam abertos por padrão; convênios, financiamento e linha de corte permanecem disponíveis em disclosures para reduzir a carga inicial.
- O PDF não foi alterado. A nova RPC reutiliza seus cores detalhados e confronta total e quantidade com a prestação mensal antes de devolver a composição.

## Contrato e segurança

- Nova RPC `get_caixa_composicao_mensal_secure(uuid, date)` aplicada na migration remota `20261002003956`, em `SECURITY DEFINER`, `STABLE` e `search_path` vazio.
- A prestação mensal existente é chamada primeiro para preservar autorização e escopo antes do acesso aos cores privilegiados.
- A função agrega sem limite de 300 movimentos, valida as identidades dos componentes e falha se total ou quantidade divergirem do statement.
- Valores monetários são devolvidos como strings decimais com duas casas; o cliente rejeita número JavaScript, drift estrutural, período ou escopo incompatível.
- `PUBLIC` e `anon` não recebem execução; `authenticated` e `service_role` recebem somente `EXECUTE`.
- O Realtime invalida a composição por polo ou de forma ampla junto com os demais snapshots financeiros.

## Resultado local

- A primeira leitura mostra `Entradas recebidas − Saídas pagas = Resultado operacional` e mantém a posição contábil em um bloco separado.
- Contas a receber e contas a pagar são apresentadas em trilhas paralelas, preservando realizado, aberto, vencido, pago, a vencer e agenda.
- Dois cards novos reproduzem Base, Juros, Multa, Acréscimo, Desconto, Diferença a conferir, total, quantidade e completude para recebimentos e despesas.
- Receitas por modalidade e despesas por categoria ganham roscas acessíveis e estado vazio textual.
- O gráfico existente de barras/linhas e o painel de contas passam a compor uma única leitura de evolução e localização do saldo.
- Conciliação permanece visível; posição total, posição líquida, patrimônio, convênios, financiamento e linha de corte permanecem completos na análise avançada.
- O conteúdo passa a usar melhor a largura disponível, com foco visível, alvos de 44 px, teclado, redução de movimento e disclosures móveis.

## Validação local

- `npm run test:caixa-report`: 108/108 aprovados, incluindo contratos do PDF e os novos testes de composição/layout.
- PostgreSQL/WASM: 1/1 aprovado, cobrindo 301 recebimentos, paridade, isolamento por polo, ACL, anônimo negado, service role, vazio e divergência deliberada.
- Revisão independente final: nenhum achado crítico ou importante; componentes financeiros desconhecidos permanecem nulos, enquanto período comprovadamente vazio preserva zero real.
- Supabase remoto: contrato v1 executado com `service_role`, ACL conferida (`anon` negado; `authenticated` e `service_role` autorizados) e total/quantidade reconciliados para a competência atual.
- Advisors pós-migration mantiveram o baseline anterior; surgiu somente o aviso esperado de RPC `SECURITY DEFINER` executável por `authenticated`, necessário e mitigado pela autorização canônica chamada antes dos cores privilegiados.
- `npx tsc --noEmit --pretty false`: aprovado.
- ESLint focado no manifesto: aprovado.
- `npx vite build`: aprovado; somente avisos preexistentes de chunks grandes e import estático/dinâmico.
- Smoke autenticado no Safari local: aprovado para competência atual e setembro, troca de mês, déficit, trilhas, roscas, gráfico, contas, conciliação, posição, patrimônio, convênios, financiamento e linha de corte.
- O smoke confirmou que a RPC ainda ausente no ambiente conectado afeta somente os cards de composição; o restante do Caixa continua funcional.
- Todos os arquivos manuais deste manifesto têm menos de 500 linhas; o maior possui 360 linhas.
- `npm run check:file-lines` permanece bloqueado por 12 referências antigas ausentes e fora deste lote; nenhuma falha pertence ao manifesto atual.

## Fechamento remoto autorizado

- A migration foi aplicada pelo MCP Supabase no projeto `kfekgwyqozhicpfuunpo` e permanece versionada neste lote com o mesmo número do ledger remoto.
- A entrega 4.8.147 foi autorizada explicitamente para commit, Pull Request, Preview e produção.
- O fechamento deve confirmar Preview, CI/Vercel, merge, domínio público e smoke autenticado no Safari com os dois cards preenchidos.

## Manifesto explícito

### Operação

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-01-caixa-painel-financeiro-imersivo.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

### Caixa e testes

- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/useCaixaRealtime.ts`
- `modules/gestor/caixa/caixa-composicao.types.ts`
- `modules/gestor/caixa/caixa-composicao.validation.ts`
- `modules/gestor/caixa/caixa-composicao.service.ts`
- `modules/gestor/caixa/caixa-composicao.queries.ts`
- `modules/gestor/caixa/caixa-composicao.test.ts`
- `modules/gestor/caixa/components/CaixaStatementSection.tsx`
- `modules/gestor/caixa/components/CaixaCompositionCards.tsx`
- `modules/gestor/caixa/components/CaixaCompositionCards.test.tsx`
- `modules/gestor/caixa/components/CaixaFlowHero.tsx`
- `modules/gestor/caixa/components/CaixaCommitmentTracks.tsx`
- `modules/gestor/caixa/components/CaixaDistributionDonuts.tsx`
- `modules/gestor/caixa/components/CaixaMovementAndAccounts.tsx`
- `modules/gestor/caixa/components/CaixaAdvancedAnalysis.tsx`
- `modules/gestor/caixa/components/CaixaImmersiveLayout.test.tsx`
- `modules/gestor/caixa/caixa-linha-corte.test.ts`
- `modules/gestor/caixa/caixa-patrimonio-resumo.test.ts`
- `scripts/test-caixa-report.mjs`

### Banco

- `supabase/migrations/20261002003956_create_caixa_composicao_mensal_secure.sql`
- `supabase/tests/caixa_composicao_mensal.isolated.test.mjs`

Total: 26 arquivos.
