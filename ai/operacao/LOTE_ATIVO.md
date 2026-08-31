# Lote ativo

Estado: `CONCLUÍDO`

## Lote: 2026-08-30-recebimentos-na-conciliacao

- Pedido: reaproveitar `Financeiro > Conciliação > Conciliação & Baixas` como
  visão detalhada de recebimentos, sem criar um novo módulo.
- Autorização: implementação, GitHub e produção aprovados explicitamente pelo
  usuário em 30/08/2026.
- Risco: crítico — financeiro, dados pessoais, Supabase/RLS e desempenho.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-08-30-recebimentos-detalhados-na-conciliacao.md`.

### Escopo aprovado

1. Listar na mesma tela baixas automáticas Banese, manuais e histórico migrado.
2. Exibir cada cobrança em duas faixas: identidade do título e detalhes da baixa.
3. Incluir pagador com CPF mascarado, data/hora disponível, valores, ajustes,
   origem, forma, conta mascarada e responsável.
4. Adicionar filtros server-side por período, origem, empresa, polo e busca,
   mantendo paginação estável.
5. Não criar nova rotina de baixa, não alterar títulos e não inventar hora ou
   composição financeira ausente.

### Diagnóstico confirmado

- Produção contém 263 recebimentos: 48 automáticos Banese, 26 manuais e 189
  históricos migrados.
- A consulta atual restringe `gateway_provider = banese_card`, por isso enxerga
  somente os 48 automáticos e uma baixa manual ligada a título Banese.
- Hora canônica de registro existe para os 48 automáticos e 26 manuais; o
  histórico possui somente `data_pagamento`.
- A composição é explícita nas 26 baixas manuais; diferenças não comprovadas
  precisam permanecer identificadas como não discriminadas.
- O polo selecionado não participa da query atual.

### Aceite

- A visão `Pago` cobre os 263 recebimentos sem duplicar ou alterar baixas.
- CPF e conta saem mascarados do banco e o payload não contém dados bancários
  sensíveis nem evidências brutas.
- Gestor sem Financeiro/A Receber é negado; gestor local só acessa polo
  autorizado; escopo global é explícito.
- Período usa a data da baixa e a hora usa somente timestamp canônico de
  registro. Histórico mostra `horário não disponível`.
- Paginação, busca, origem, empresa e polo são aplicados no servidor.
- Desktop mostra duas faixas agrupadas e mobile usa cartão equivalente.
- Testes focados, contratos de segurança, TypeScript, build e limite de linhas
  passam antes do pedido de publicação.

### Implementação e validação local

- A visão abre em Pago e usa a RPC paginada e protegida para cobrir os 263
  recebimentos, com filtros server-side e duas faixas por cobrança.
- O histórico migrado permanece separado e sem hora ou componentes inventados.
- CPF/CNPJ revela somente os dois últimos dígitos; busca documental exige o
  documento completo; comprovantes manuais/históricos não reutilizam links de
  gateways antigos.
- A origem bancária exige evidência de liquidação, e o feed separa
  `production`/`sandbox` sem excluir baixas manuais ou histórico canônico.
- A consulta medida contra o schema real levou cerca de 30 ms para uma página
  de 20 itens e usou o índice existente.
- Os 48 testes do domínio, ESLint, TypeScript, build de produção e limite de
  linhas passaram.
- A migration foi aplicada em produção como `20260831010512`; a RPC real
  confirmou 263 recebimentos, sendo 48 Banese, 26 manuais e 189 históricos.
- ACL remota confirmada: execução apenas por `authenticated`; `PUBLIC`, `anon`
  e `service_role` permanecem revogados. A negação sem identidade e para polo
  fora do escopo também foi exercitada em produção.
- O advisor sinaliza somente o uso intencional de `SECURITY DEFINER` por usuário
  autenticado; a função mantém `search_path` vazio e guardas internas de módulo,
  aba e polo.
- Publicação versionada como `4.8.14` no `main`, com deploy de produção e checks
  remotos acompanhados no fechamento.
- Smoke visual autenticado permanece pendente se o navegador conectado continuar
  indisponível; o contrato remoto, filtros, payload, tipos e build foram validados.

## Lote anterior concluído

## Lote: 2026-08-30-conciliacao-banese-filtros-teto-p6

- Pedido: corrigir os filtros da conciliação, publicar o hotfix e limitar o
  piloto automático Banese ao teto P6 sem elevar o perfil efetivo diretamente.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-08-30-conciliacao-banese-filtros-teto-p6.md`.
- Autorização: o usuário autorizou GitHub, produção e teto automático P6.
- Risco: crítico — financeiro, Supabase e publicação.

### Diagnóstico confirmado

1. Os botões Todos, Pago, Pendente e Vencido alteravam o estado, mas a lista
   mantinha os dados anteriores com `keepPreviousData` enquanto a nova consulta
   executava. Isso fazia filtros diferentes parecerem idênticos.
2. Cada troca de filtro também disparava indicadores, histórico completo de
   transações e diagnóstico RPC. O histórico pesado sofreu timeout PostgREST e
   podia degradar a tela inteira.
3. Eventos Realtime invalidavam todas essas consultas em rajada, inclusive
   diagnósticos que não estavam visíveis.
4. O teto automático configurado era P9. O perfil efetivo de produção continuava
   P3; portanto, mudar somente o teto para P6 não exige salto de ritmo.
5. O `main` remoto tinha seis falhas mecânicas de lint deixadas pelo hotfix
   anterior. Elas foram isoladas em quatro arquivos Banese sem mudança de regra.

### Correção do lote

- A lista filtrada, os oito indicadores e os diagnósticos pesados usam consultas
  independentes.
- A aba de diagnóstico é a única que habilita histórico de transações e RPC de
  sincronização; falha parcial não apaga a lista.
- A lista não reaproveita linhas do filtro anterior. Estados bancários são
  mapeados explicitamente e Pendente exclui Pago e Vencido.
- Realtime separa invalidação de recebíveis e diagnósticos e agrupa rajadas por
  dois segundos.
- A interface deixa de prometer webhook Banese inexistente e informa claramente
  indisponibilidade temporária do histórico.
- A migration `20260830154500` torna P3–P6 a única escada automática,
  preserva P3 efetivo, estabilidade, cooldown e estado, e mantém P7–P20 somente
  no modo manual.
- A migration falha fechada se encontrar perfil automático efetivo ou estável
  acima de P6 e não altera títulos, baixas, fila ou tentativas.
- Os quatro reparos de lint qualificam globals Deno por `globalThis` e removem
  uma importação não usada; a lógica financeira permanece idêntica.

### Aceite e validação

- Trocar o status refaz apenas a lista e nunca mantém linhas do filtro anterior.
- Diagnóstico pesado não executa fora da aba correspondente.
- P6 é somente teto; o perfil efetivo permanece P3 e sobe gradualmente pelas
  condições existentes de amostra real e uma hora estável.
- 20 contratos Node focados, 25 testes Deno e 11 testes do controle Banese
  passaram.
- ESLint global, TypeScript, build de produção e teto global de 500 linhas
  passaram.
- Smoke autenticado da interface permanece pendente porque nenhuma sessão de
  navegador foi disponibilizada ao agente; a validação de produção será feita
  por checks, endpoint e estado remoto.
- A migration foi aplicada em produção como `20260830185530`: teto P6,
  efetivo P3, último estável P3, estado `OBSERVING`, estabilidade preservada e
  duas auditorias `SYSTEM_POLICY` com perfil efetivo 3 → 3.
- A primeira tentativa falhou antes do commit por conflito com a constraint P9;
  a transação reverteu por completo. A ordem foi corrigida, revisada de forma
  independente e reaplicada atomicamente.
- As oito execuções produtivas mais recentes depois da mudança concluíram em
  P3 com `SUCCESS`, zero falha e zero throttling, entre 0,86 s e 1,15 s.
- Os advisors não apontaram vulnerabilidade ou regressão criada pelo teto P6;
  avisos preexistentes de RLS, índices e funções administrativas permanecem
  fora deste lote e não foram ampliados silenciosamente.

### Manifesto explícito

Total: 24 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-30-conciliacao-banese-filtros-teto-p6.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `scripts/test-banese-reconciliation-control.mjs`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseAutopilotProgress.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/ConsultaApiBaneseConfig.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/banese-autopilot-cooldown.contract.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/ConciliacaoBancariaTab.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoOrigemBaixaPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoTransactionsPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.fetch.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filter-state.contract.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filters.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filters.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/hooks/useBaneseConciliacaoQueries.ts`
- `supabase/functions/banese-reconciliation-worker/error-classification.test.ts`
- `supabase/functions/banese/core/adapter/boleto-query-pix.test.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.test.ts`
- `supabase/functions/gateways/api/banese.ts`
- `supabase/migrations/20260830154500_cap_banese_automatic_profile_at_p6.sql`
- `supabase/tests/banese_automatic_p3_p6_ceiling.contract.test.ts`
