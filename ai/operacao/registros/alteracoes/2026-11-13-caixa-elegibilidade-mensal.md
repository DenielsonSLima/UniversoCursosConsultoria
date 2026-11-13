# Caixa: elegibilidade mensal limitada antes das consultas por título

## Objetivo e aceite
Corrigir o custo de carregamento da prestação principal sem alterar lançamentos, cálculo, valores, histórico, classificação NFS-e, Proesc/EAD, parcial/estorno, permissões ou Realtime.
Pedido de correção e atualização do projeto inclui publicação após verificações.
Base remota conferida: main `4515b2a87a04a1b70ee240095dfba103dd55f41a`, versão 4.8.335.
Branch exclusiva; arquivos de autenticação e trabalho paralelo não integram este lote.

## Causa e alteração
Logs de 13/11/2026 às 13:08–13:09 UTC mostram SQLSTATE 57014 em diferentes etapas da prestação.
O plano de inadimplência aplica elegibilidade EAD à projeção completa antes do filtro mensal proveniente de uma CTE.
A nova CTE MATERIALIZED limita primeiro apenas vencimento, polo e os cinco status já existentes.
As consultas de evidência recebem explicitamente o mesmo tipo `public.contas_receber`.
Demais filtros, regras e agregações permanecem iguais; não há cache temporal, aumento de timeout nem alteração da fila.
A migration aborta em drift de definição e verifica preservação integral dos metadados/ACL/owner.
O diagnóstico não atribui todos os timeouts a um único operador.

## Validação
- PGlite em memória: 80 combinações de polo/mês/corte, JSON integral idêntico.
- Pagamento parcial em componentes, pagamento posterior ao corte e estorno: equivalência integral.
- Proesc verificado/revisão/cancelado, ciclo manual sem emissão, EAD opcional, empréstimo e status excluído.
- Vencimento nulo, competência no meio do mês, polo vazio e cortes antes/durante/depois do mês.
- Chamadas de elegibilidade no cenário sintético: 321 antes, 19 depois; metadados/ACL idênticos e drift/reaplicação recusados.
- Produção somente leitura, timeout diagnóstico de 5s: 15 comparações (setembro/outubro/novembro, quatro polos e consolidado), todas idênticas.
- Comparação sequencial com cache quente, consulta de novembro consolidado: 374,760 ms / 43.684 shared hits antes; 140,524 ms / 11.609 hits depois. Ambas sem leituras físicas; não é benchmark de concorrência.
- Prestação completa antes do patch, service_role/consolidado/novembro/3 meses: 2.951,058 ms; também houve cancelamento diagnóstico anterior aos 5s. Não confundir esses limites de diagnóstico com alteração do timeout da aplicação.
- Revisão independente do frontend: 20 testes aprovados; sem loop, retry de 57014 ou polling. Resumos complementares paralelos podem competir por recursos; sem prova de causa dominante.
- CI inclui a nova regressão SQL e mantém relatórios, primeira carga e invalidação por escopo.
- Aplicação remota, SHA final, checks e Vercel ficam comprovados na PR do lote; smoke autenticado Safari não foi executado.

## Manifesto explícito
- `supabase/migrations/20261113182000_bound_caixa_monthly_eligibility.sql`
- `supabase/tests/caixa_monthly_bounded_eligibility.isolated.test.mjs`
- `.github/workflows/caixa-regressions.yml`
- `ai/operacao/registros/alteracoes/2026-11-13-caixa-elegibilidade-mensal.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-08-versoes-4-8-268-a-269.md`
Total: 9 arquivos.

## Risco e recuperação
Materializar c.* acrescenta uma barreira e pode usar temporários em meses grandes; conferir RPC completa e buffers após aplicar.
Nenhuma tabela financeira é escrita. A migração altera apenas o corpo da função privada e preserva identidade, grants e RLS.
Em caso de regressão, restaurar a definição anterior por nova migration auditada; não apagar histórico aplicado.
A entrega usa versão 4.8.337 para não disputar a 4.8.336 reservada ao lote paralelo de e-mail/login.
