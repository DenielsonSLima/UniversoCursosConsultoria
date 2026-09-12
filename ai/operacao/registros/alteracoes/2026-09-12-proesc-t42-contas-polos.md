# Proesc: teste de conexão e contas dos polos

Data: 2026-09-12. Versão 4.8.44, revisão 53.
Estado: implementação validada; publicação em preparação.

## Pedido e aceite

- Conferir internamente o legado da T42 e avaliar consulta automática.
- Preservar todos os boletos Banese da T42, que pertencem ao segundo ciclo.
- Criar Caixa individual ao cadastrar/reativar polo; compartilhar Proesc e Banese.
- Incluir Testar token e alinhar o visual Proesc ao padrão do sistema.
- Operações de importação e conciliação continuam internas.

## Resultado da conferência

- Origem e identidade da parcela são obrigatórias para separar os ciclos;
  vencimentos dos dois sistemas podem coincidir. Referência legada não é ID Proesc.
- Consulta local confirmou a separação das cobranças; nenhum recebível foi alterado.
- Autenticação/endpoints revisados nas documentações oficiais:
  https://proesc.readme.io/reference/autorizacao,
  https://proesc.readme.io/reference/pessoas,
  https://proesc.readme.io/reference/parcelas.
- GETs pelo banco e pelo runtime Edge receberam HTTP 403 nos dois recursos.
- Não foi possível comparar dados externos nem validar IDs e estados de pagamento.
- Não foi habilitada sincronização financeira ou cron sem contrato real confirmado.
- Tentativa registrada no histórico por turma como não concluída; nenhum dado
  consultado foi apresentado como importação confirmada.
- Usuário informou abertura do ticket Proesc #166788 para investigar a recusa.

## Implementação

- Teste do token salvo: GETs fixos, timeout, limite de resposta, erro sanitizado,
  sem retorno de dados pessoais ou credencial e sem importação.
- Teste normal exige gestor global autorizado; teste interno usa segredo próprio
  no Vault e RPC service_role com verificação do responsável pela conexão.
- Alteração de token durante teste invalida o resultado por revisão da credencial.
- UI com duas abas, cabeçalho/cartões padronizados e resultado por recurso.
- Caixa idempotente e exclusivo por polo; Conta Proesc de controle compartilhada,
  sem agência/conta inventadas, saldo inicial zero e sem saldo presumido do legado.
- Listagem de contas usa disponibilidade por polo; edição respeita titularidade.
- Migrations 20260912154809 e 20260912154818 aplicadas; Edge proesc-api v3 ACTIVE.

## Validação

- TypeScript e ESLint focado aprovados; 19 testes Deno aprovados.
- SQL de contas aprovado com rollback: idempotência, criação/reativação de polo,
  exclusividade de Caixa, compartilhamento e preservação de movimentações.
- SQL do teste interno aprovado com rollback, privilégios mínimos e fixture sem Auth.
- Chamada real pelo runtime de produção validou o diagnóstico de recusa HTTP 403.
- Revisões independentes de documentação, dados T42, contas e interface realizadas.
- Smoke visual automatizado indisponível: seleção do Safari foi bloqueada por
  revisão automática por possível exposição de outras abas; pendência preservada.
- Build de produção e teto de linhas aprovados.

## Manifesto explícito

- `modules/gestor/configuracoes/proesc/ProescConfig.tsx`
- `modules/gestor/configuracoes/proesc/ProescResults.tsx`
- `modules/gestor/configuracoes/proesc/proesc.service.ts`
- `modules/gestor/configuracoes/contas-bancarias/contas-bancarias.service.ts`
- `modules/gestor/configuracoes/contas-bancarias/components/CompanyAccountsManager.tsx`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/test-token.ts`
- `supabase/functions/proesc-api/test-token.test.ts`
- `supabase/migrations/20260912154809_proesc_internal_probe.sql`
- `supabase/tests/proesc_internal_probe.transaction.sql`
- `supabase/migrations/20260912154818_proesc_shared_account_and_polo_cash.sql`
- `supabase/tests/proesc_accounts.transaction.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-t42-contas-polos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 18 arquivos.

## Publicação e pendências

- Base remota: d629b64de2e4f1d448d2a18e06b87e50201abd5a.
- Publicação via MCP com manifesto isolado; preservar trabalho paralelo PR 134.
- Changelog/registro remoto compostos sobre main, preservando entradas locais paralelas.
- Próxima etapa depende do acesso Proesc: confrontar identidades e cobranças antes
  de habilitar atualização automática do legado da T42.
