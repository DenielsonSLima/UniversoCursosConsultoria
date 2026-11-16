# Despesas — revisão de três agentes, filtros compactos e reconexão

Data: 16/11/2026. Mudança crítica de interface/leitura financeira e publicação.
Status: revisão funcional e ajuste visual aprovados, publicação 4.8.353 em fechamento. Produção explicitamente autorizada após concluir a revisão.
Base: 4.8.352, PR #441, commit 76de44f0b1c2ecf4a8c2d83cab4b16b5d5e23fae. Versão alvo: 4.8.353.

## Objetivo e aceite

- Revisar estimativas, mês sem cobrança, pagamento único, leitura mensal, situações, ordenação, resumos, grupos, PDFs, autorização e previsões Serasa.
- A pedido do gestor, colocar Situação e Ordem na mesma faixa das abas, com largura compacta e adaptação móvel. Preservar estados, filtros e dados canônicos.
- Corrigir recuperação automática após reconexão do Realtime, preservando filtros e invalidando apenas as consultas de despesas do polo ativo.
- Nenhuma alteração de dados financeiros, Auth ou migrations aplicadas; nenhum pagamento ou mês sem cobrança confirmado como teste.

## Revisão e achados

- Três frentes independentes: backend/dados; UI/integração; produção/Safari/PDF. Root revisou atomicidade, replay, travas e a regra canônica de baixa estimada.
- Achado P2: o hook de despesas assinava eventos sem tratar SUBSCRIBED e podia manter eventos perdidos durante desconexão. Correção mínima no hook reaproveita a invalidação debounced na assinatura/reconexão, limita as chaves ao polo ativo e ignora callbacks após desmontagem.
- Nenhuma divergência financeira/autorização identificada: Serasa mantém 13 previsões variáveis estimadas de R$ 117,60, total R$ 1.528,80, de 10/12/2026 a 10/12/2027. Novembro pago conserva hash, evento, componente Pix, fornecedor e categoria anteriores.
- Conferidos Todos/Em aberto (13), dezembro/2026 (1) e 2027 (12). Grupos de Fixas/Variáveis por mês/categoria/fornecedor nas duas ordens coincidem com os totais canônicos. Nove RPCs mantêm guarda autenticada, search_path vazio e execução negada a anon/service_role.
- A prévia estimada mantém a mesma regra da prévia canônica atual, com a projeção/guarda dedicadas comprovadas por comparação do corpo das funções. Autorizar/trancar a origem precede replay e alteração de estado.
- O helper compartilhado de saldo ainda usa data UTC, mas o modal usa somente quitado versus saldo aberto; rótulo de vencido e recorte mensal do workspace usam America/Maceio. Sem efeito novo comprovado que justifique ampliar o helper neste lote.

## Validação

- Teste novo de reconexão com React Query real aprovado: lacuna inicial, evento perdido offline, recuperação sem evento novo, coalescência físico/econômico, isolamento de outro polo e limpeza de timer/callback.
- Revisão independente da correção aprovada. TypeScript completo e lint focado aprovados.
- Interação das duas abas 9/9 e baixa estimada/mês sem cobrança 11/11 aprovadas; três avisos act preexistentes no harness de retomada, sem falhas. Duas suítes SQL isoladas aprovadas, com parcial/encargos, replay, versão, concorrência, rateio e calendário.
- Safari autenticado em 4.8.352 confirmou ordenação, situações, grupos padrão, pagamentos únicos, 13 Serasa em Todos/Em aberto, entrada do valor real e etapa sem cobrança. Formulários fechados sem salvar; nenhuma mutação financeira real.
- Novo layout das duas modalidades aprovado no Safari com componentes reais/CSS do produto: seletores no mesmo nível das abas em desktop; larguras 375/320 px com quebra limpa, menus acessíveis e sem overflow horizontal global. Harness temporário omitiu só animação de entrada para inspecionar a composição final; código do produto não foi alterado por esse recurso de QA.
- Build completo em Node 24.22.1 aprovado. Os 10 arquivos do manifesto estão abaixo de 500 linhas; verificação global do checkout mantém 14 referências históricas ausentes fora do lote. Registro remoto será derivado da main mais este registro, sem apontamentos locais paralelos.
- PDFs e regras financeiras não foram alterados por este patch visual; a revisão de fonte preserva o modelo e a mesma coorte/ordem canônica da exportação.
- Trabalho paralelo de cupons EAD e lote ativo local preservados; somente o manifesto explícito será publicado.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/components/DespesaPeriodControls.tsx`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `modules/gestor/financeiro/despesas/hooks/useDespesasRealtime.ts`
- `modules/gestor/financeiro/despesas/hooks/despesas-realtime.interaction.test.mjs`
- `.github/workflows/despesas-estimadas.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-11-16-revisao-despesas-filtros.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 10 arquivos.
