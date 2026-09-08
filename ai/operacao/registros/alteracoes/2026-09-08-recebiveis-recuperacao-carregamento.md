# Recuperação do carregamento de A Receber

Estado: correção 4.8.35 validada, publicação em andamento.

## Pedido e evidência

Gestor relatou espera aparentemente infinita, recuperada ao recarregar a página.
Janela exata inspecionada: 08/09/2026, 00:15–00:26 America/Maceio.

- Grupos e dois resumos v3 retornaram HTTP500 após cerca de 18.8 segundos;
  as tentativas seguintes retornaram HTTP503. Banco registrou 57014 (statement
  timeout), e PostgREST registrou PGRST002 (falha ao carregar schema cache),
  reconexões e reinicializações do pool. Outras consultas também foram afetadas.
- Após a recuperação, grupos responderam em 116–283ms e resumos em 46–140ms
  nos logs HTTP; auditoria v4 em 3–87ms. EXPLAIN da página de grupos do mesmo
  mês retornou 97.749ms com papel service_role (sem custo de autorização do usuário).
- Primeira carga usa grupos/resumos v3; não chegou a chamar a RPC v4 de auditoria.
- Causa observada: indisponibilidade transitória da API/banco. A razão operacional
  que provocou as reconexões não foi determinada; não atribuir a avisos de preload
  ou ao bloqueador do navegador apenas pela captura.
- Defeito confirmado na interface: consultas sem prazo no cliente, ausência de
  recuperação visível na lista e detalhes, e falha inicial apresentada como vazio.

## Manifesto explícito

- `modules/gestor/financeiro/financeiro.receivables-request.ts`
- `modules/gestor/financeiro/financeiro.receivables-request.test.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/receber/hooks/useModalidadeReceberQueries.ts`
- `modules/gestor/financeiro/receber/components/ModalidadeReceberTab.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesQueryRecovery.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesList.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.types.ts`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-08-recebiveis-recuperacao-carregamento.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 14 arquivos.

## Correção e aceite

- Prazo de 15 segundos por leitura, incluindo espera anterior ao fetch; abortar
  transporte e ignorar respostas tardias. Cancelamento dos filtros via TanStack.
- Timeout local, timeout do banco e acesso negado não repetem automaticamente;
  demais falhas transitórias conservam no máximo uma repetição.
- Falhas mostram Tentar novamente com filtros preservados; estado offline
  informa retomada pela conexão. Detalhes em tabela/cards também recuperam.
- Nenhuma alteração de banco, permissões, rotina de baixa ou cálculo financeiro.

## Validação

- Cinco testes com QueryClient/QueryObserver reais: pendência que nunca termina,
  saída de loading, retry com filtros preservados, cancelamento, sucesso, limpeza
  do timer, erros originais e política de retry; aprovados.
- TypeScript completo, lint do escopo, build 4.8.35 e teto de linhas aprovados.
- Revisão independente sem bloqueadores; paginação também preservada em erro.
- Smoke Safari com transporte simulado sem resposta, TanStack e componente reais:
  carregamento -> mensagem de falha -> Tentar novamente -> sucesso com período
  preservado. Prazo reduzido para 1.5s apenas no harness descartável em tmp.
- Smoke autenticado de produção 4.8.34 recuperada confirmou lista/indicadores
  disponíveis. Validar abertura normal após publicar a correção.
