# Retenção efetiva dos sinais Realtime

Estado: IMPLEMENTADO — INSTALADO INATIVO, EM VALIDAÇÃO DE ENTREGA.

## Problema e escopo

A política existente remove sinais de atualização de tela com mais de 24 horas somente quando um emissor alcança determinados IDs. Sem esse evento, sinais vencidos permanecem no banco. A manutenção passa a executar de forma independente e limitada.

O pedido do usuário é corrigir crescimento técnico desnecessário preservando dados úteis em produção. A mudança mantém o prazo já implementado; não cria uma política de expurgo para dados financeiros ou logs de acesso.

Tabelas elegíveis: `public.finance_realtime_events`, `public.gestao_realtime_events` e `public.portal_realtime_signals`. A revisão remota encontrou uso como sinais de invalidação, sem referências de histórico financeiro. Assinaturas de Gestão que recebiam todos os tipos de mudança passam a receber somente INSERT, como os demais consumidores desses sinais.

## Aceite e ordem de entrega

1. Função privada, privilégios mínimos, prazo fixo de 24 horas e lotes limitados, sem bloquear linhas ocupadas.
2. Sinais recentes e no limite temporal preservados; reexecução segura.
3. Testes isolados do SQL e das assinaturas; revisão independente.
4. Instalar manutenção sem ativar o agendamento; publicar assinaturas antes de executar a operação de ativação versionada.
5. Ativar somente após conferir a publicação; executar limpeza limitada e verificar a preservação dos sinais recentes.
6. Medir tamanho físico separadamente de bytes lógicos; não prometer que DELETE reduz imediatamente o painel.

## Manifesto explícito

- `supabase/migrations/20260922023953_install_realtime_signal_retention.sql`
- `supabase/operations/activate_realtime_signal_retention.sql`
- `supabase/tests/realtime_signal_retention.fixture.sql`
- `supabase/tests/realtime_signal_retention.isolated.test.mjs`
- `modules/gestor/gestao/hooks/useGestaoRealtime.ts`
- `modules/gestor/gestao/hooks/useTurmaPresencialRealtime.ts`
- `modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadRealtime.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaTecnicoRealtime.ts`
- `modules/gestor/gestao/hooks/gestao-realtime-retention.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-21-caixa-desempenho-calculo-canonico.md`
- `ai/operacao/registros/alteracoes/2026-09-21-realtime-retencao-efetiva.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 15 arquivos. O registro do Caixa anterior recebe apenas a confirmação da entrega já concluída.

## Validação e operação

- Migration aplicada via MCP sob a versão 20260922023953; fonte imutável, hash de função e permissões conferidos. Agendamento inicialmente inativo.
- SQL isolado aprovou fronteira de 24 horas, preservação de recentes/futuros, limite de 5.000 por tabela, ordem, reexecução, autorização e guardas de divergência.
- Treze testes de assinaturas e contratos aprovados; lint focado e build completo aprovados.
- Revisão independente do SQL e dos quatro hooks concluída.
- A ativação é configuração runtime do cron, sem DDL, por script versionado após confirmação do frontend publicado.
- Drenagem inicial limitada começa com 500 por tabela, seguida de lotes de até 5.000 sob orçamento de tempo.
- Eventual recuperação física fica restrita às três tabelas de sinais após zerar o backlog: lock NOWAIT, trava de manutenção compartilhada, orçamento de 5 segundos, limites de volume e preservação de conteúdo/metadados conferida. Nenhuma tabela de fatos financeiros entra nessa manutenção.
- CI, publicação, ativação e conferência final são etapas de entrega ainda a executar após este registro.

## Limites

- Retenção de logs de acesso, provas e histórico financeiro permanece inalterada.
- Expiração de arquivos técnicos após 90 dias e agregação de itens Proesc sem consulta exigem lote próprio.
- O reaproveitamento de observações Proesc continua aguardando um ciclo natural elegível bem-sucedido; erros de consulta não comprovam essa validação.
- Métricas privadas de produção e conteúdos financeiros não integram este registro público.
