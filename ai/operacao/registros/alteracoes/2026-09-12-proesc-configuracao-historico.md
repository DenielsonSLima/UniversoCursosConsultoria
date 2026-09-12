# Proesc: configuração e histórico por turma

Data: 2026-09-12. Versão: 4.8.43, revisão 52.
Estado: validações automatizadas aprovadas; publicação em andamento.

## Pedido e aceite

- O gestor configura o token em uma aba e acompanha histórico por turma em outra.
- Remover a referência fixa à T42 da identificação do módulo.
- Retirar consulta manual, filtros, retomada e registros externos brutos do painel.
- Bloquear ações operacionais no backend para sessões normais do gestor.
- Importações, consultas e atualizações ficam sob operação interna por turma.
- Preservar credencial, financeiro, Banese e migrations anteriores.
- Correção e publicação autorizadas no contexto vigente do submódulo Proesc.

## Implementação

- UI com duas abas, histórico somente leitura e estados de carregamento/erro/vazio.
- Token fora do estado React e do cache de mutações; campo limpo ao enviar.
- Edge permite somente status, salvar/remover token e histórico agregado/eventos.
- Ações internas, inclusive flags forjadas, recebem 403 antes de RPC ou rede.
- RPC de histórico restrita a service_role e gestor global ativo com Configurações.
- Eventos internos idempotentes, sem dados pessoais ou credenciais no histórico.
- Referência de histórico anterior comprovado apresentada sem data inventada;
  a conferência no Proesc continua pendente e não equivale a importação pela API.
- Banco: migration proesc_class_history aplicada como 20260912152628.
- Edge proesc-api v2 ACTIVE; autenticação própria preservada.

## Validação

- TypeScript, ESLint focado e Deno check aprovados.
- 14 testes Deno de contrato/autorização aprovados.
- Teste SQL transacional por MCP aprovado: privilégios, RLS, replay, paginação,
  origem de eventos, referência legada e preservação financeira; rollback integral.
- Revisão paralela de interface, histórico e bloqueio de operações concluída.
- Smoke visual pendente: auto-review bloqueou selecionar Safari por risco de
  exposição de conteúdo privado de outras abas. Não houve tentativa de contorno.
- Build de integração e limite de linhas aprovados.
- Endpoint publicado recusa requisição anônima com HTTP 401.

## Manifesto explícito

- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/configuracoes/proesc/ProescConfig.tsx`
- `modules/gestor/configuracoes/proesc/ProescResults.tsx`
- `modules/gestor/configuracoes/proesc/proesc.service.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/migrations/20260912152628_proesc_class_history.sql`
- `supabase/tests/proesc_class_history.transaction.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-configuracao-historico.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 13 arquivos.

## Publicação

- Base remota: 2fa0953f6804353a89fe619ebfb66f993446ae09.
- Árvore sobre main com manifesto explícito; preservar trabalho paralelo do PR 134.
- CHANGELOG e registro de manifestos remotos compostos sobre main; entradas locais
  de outros lotes não integram esta publicação.
