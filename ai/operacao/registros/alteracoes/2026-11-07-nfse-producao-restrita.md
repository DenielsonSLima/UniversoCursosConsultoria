# NFS-e — publicação restrita 4.8.256

## Pedido, base e limite

O usuário autorizou publicar a estrutura NFS-e em produção, inicialmente apenas para seu usuário gestor. O aceite mantém o módulo em preparação: nenhuma emissão, gravação fiscal, cálculo financeiro no frontend ou coleta de credenciais é habilitada.

Base final: 4.8.255, commit 2617628b2c92012b82aa2ab76148d7449dfcecb0, árvore 1753cc68b5fe0cdc9703c14fc5ecd65d2b508738, deployment dpl_3KmzDyvuWhCHYRrpV7A1YjrhJKCW READY. A publicação paralela das carteirinhas foi preservada; versão, changelog e registro de manifestos foram reconciliados antes da nova Preview. Os arquivos compartilhados da fundação foram comparados com a base publicada. Alterações financeiras paralelas do workspace não pertencem ao manifesto nem à publicação.

## Comportamento entregue

Emissor NFS-e fica após Financeiro, com Preparar emissão, Pendentes, Emitidas, Erros e Modelos em subpastas. Configurações possui NFS-e Portal Contribuinte para a matriz, com abas do cadastro existente de polos. CNPJ pertence ao polo; company_id continua representando a instituição. Serviços, hooks, queries, Realtime e API interna ficam separados.

A liberação exige duas condições: permissão efetiva do módulo e concessão privada vinculada simultaneamente ao usuário institucional e à identidade Auth. O catálogo de polos verifica o acesso antes da consulta. O card e a seção de configuração exigem também o contexto de matriz. Erro, troca de identidade ou contexto, decisão malformada e negação do servidor fecham o acesso. Durante revalidação a tela preserva a rota e mostra carregamento.

A identidade Auth vem da projeção do contexto autenticado, sem persistência adicional no navegador. O cache inclui identidade e contexto. Perfis compartilhados não foram alterados; a operação administrativa concedeu apenas o módulo ao contexto individual solicitado.

## Backend aplicado e revisão

Migration 20261107182011_nfse_pilot_access aplicada via MCP; fonte preservada com o mesmo conteúdo e prefixo do ledger remoto. Cria schema privado, tabela com RLS e sem grants de cliente, e get_nfse_access_secure(uuid), que retorna somente booleano. A função exige auth.uid(), contexto ativo GESTOR, concessão, permissão efetiva e liberação institucional/horário. SECURITY DEFINER usa search_path vazio e EXECUTE restrito a authenticated.

Há exatamente uma concessão. A identidade autorizada possui um único contexto ativo, verificado remotamente; isso evita ambiguidade do helper legado de horário, que usa LIMIT 1. Antes de expandir o piloto para identidades com múltiplos contextos, revisar o helper de agenda por contexto.

Revisão independente não encontrou bloqueante na associação identidade/contexto, ACLs ou teste de papel autenticado. O advisor aponta intencionalmente RLS sem política na tabela privada (negação integral ao cliente) e RPC SECURITY DEFINER acessível a authenticated (necessária para consultar a concessão sem expor sua tabela). As duas decisões foram conferidas com testes diretos; não se declara ausência de avisos globais do projeto.

## Validação e limites

- 47 testes focados aprovados, incluindo escopo, valores monetários exatos, transporte fiscal fechado, identidade, cache, sessão trocada, resposta não booleana e negação mesmo com permissão editável marcada.
- TypeScript focado nos contratos, gate e configurações aprovado; lint aprovado em todos os TS/TSX/MJS do manifesto.
- Teste SQL real em supabase/tests/nfse-pilot-access.sql aprovado: gestor autorizado, outro gestor, contexto forjado, identidade ausente, anon sem EXECUTE e tabela privada inacessível ao cliente. Claims e role são locais à transação e restaurados com ROLLBACK.
- Safari sintético: cinco abas e formulário de modelo; matriz/filial nas configurações; combobox de ambiente; gravação bloqueada; contexto filial sem acesso à configuração.
- Safari 390 px: cabeçalhos legíveis, cadastro em uma coluna, resumo em duas colunas e abas com rolagem horizontal. Campos inferiores mobile não conferidos por duas falhas noWindowsAvailable; nenhuma operação real foi executada.
- Build e TypeScript globais do workspace foram interrompidos por alterações financeiras paralelas em despesas/outros-débitos, fora do manifesto. Não se alterou esse trabalho. O checkout isolado criado pela Preview/CI a partir da base remota é o gate de integração antes do merge.
- Teto local: os 64 arquivos manuais do manifesto estão abaixo de 500 linhas; o índice é gerado. O comando global check:file-lines encontrou 37 ausências preexistentes fora deste lote no workspace; não se recompôs histórico nem se alteraram arquivos de outros domínios. O gate global do checkout remoto permanece obrigatório.
- O candidato inicial passou os 16 checks e a Preview; a nova base das carteirinhas exige repetir esses gates no candidato final 4.8.256.
- Publicação: somente MCP GitHub, um commit do manifesto, Preview e checks verdes antes do merge; conferir READY e domínio no deployment final.
- Fiscal: RPCs de emissão, certificado, fila e Realtime remoto permanecem pendentes. Não confundir a RPC de acesso com habilitação fiscal.

O registro anterior da fundação conserva os limites observados naquela etapa. Este registro documenta a liberação restrita e a validação posterior. O índice RAG é regenerado uma vez no fechamento, sem dados pessoais ou segredos. Arquivos temporários, prévias, dependências e artefatos de build não integram a entrega.

## Manifesto explícito

- `modules/gestor/access-control.ts`
- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/configuracoes/usuarios/components/user-access-options.tsx`
- `modules/gestor/gestor-navigation.config.ts`
- `modules/gestor/gestor-navigation.config.test.ts`
- `modules/gestor/gestor-navigation.tsx`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/api/nfse-api.contract.ts`
- `modules/gestor/emissor-nfse/api/nfse-api.ts`
- `modules/gestor/emissor-nfse/components/NfseDataState.tsx`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/components/NfsePager.tsx`
- `modules/gestor/emissor-nfse/components/NfseTabContext.tsx`
- `modules/gestor/emissor-nfse/components/nfse.presentation.test.ts`
- `modules/gestor/emissor-nfse/components/nfse.presentation.ts`
- `modules/gestor/emissor-nfse/emitidas/EmitidasNfseTab.tsx`
- `modules/gestor/emissor-nfse/erros/ErrosNfseTab.tsx`
- `modules/gestor/emissor-nfse/hooks/useNfseMutations.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseQueries.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseRealtime.ts`
- `modules/gestor/emissor-nfse/modelos/ModelosNfseTab.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.tsx`
- `modules/gestor/emissor-nfse/nfse-access.contract.test.ts`
- `modules/gestor/emissor-nfse/nfse.css`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/PrepararNfseTab.tsx`
- `modules/gestor/emissor-nfse/queries/nfse.queryKeys.ts`
- `modules/gestor/emissor-nfse/realtime/nfse.realtime.ts`
- `modules/gestor/emissor-nfse/services/nfse-contract.test.ts`
- `modules/gestor/emissor-nfse/services/nfse.errors.ts`
- `modules/gestor/emissor-nfse/services/nfse.mappers.ts`
- `modules/gestor/emissor-nfse/services/nfse.runtime.ts`
- `modules/gestor/emissor-nfse/services/nfse.service-core.ts`
- `modules/gestor/emissor-nfse/services/nfse.service.ts`
- `modules/gestor/emissor-nfse/services/nfse.validation.ts`
- `modules/gestor/emissor-nfse/types/nfse.scope.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/NfsePortalContribuinteConfig.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCompanyPanel.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseConfigurationForm.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/hooks/useNfsePolos.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/nfse-portal-contribuinte.css`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/queries/nfse-config.queryKeys.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/services/nfse-polos.service.ts`
- `scripts/test-nfse-local-stage1.mjs`
- `docs/contracts/nfse-local-stage1.md`
- `ai/operacao/registros/alteracoes/2026-11-07-nfse-fundacao-local.md`
- `modules/gestor/emissor-nfse/access/nfse-access.contract.ts`
- `modules/gestor/emissor-nfse/access/nfse-access.service.ts`
- `modules/gestor/emissor-nfse/access/useNfsePilotAccess.ts`
- `modules/gestor/emissor-nfse/access/nfse-pilot-access.test.ts`
- `modules/gestor/gestor-module-access.ts`
- `modules/gestor/gestor.page.tsx`
- `modules/login/portal-session.ts`
- `.github/workflows/nfse-regressions.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `supabase/migrations/20261107182011_nfse_pilot_access.sql`
- `supabase/tests/nfse-pilot-access.sql`
- `docs/estudos/2026-11-07-nfse-nacional.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-07-nfse-producao-restrita.md`

Total: 65 arquivos.
