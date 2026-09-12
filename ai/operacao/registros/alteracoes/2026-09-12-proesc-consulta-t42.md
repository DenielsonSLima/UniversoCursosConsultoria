# Proesc — configuração e consulta para conferência T42

Data: 2026-09-12
Estado: publicação autorizada — 4.8.42; backend aplicado e contrato SQL aprovado.

## Objetivo e aceite

- Configurações do gestor recebe submódulo Proesc carregado sob demanda.
- Token cadastrado no servidor, protegido pelo Vault, sem retorno ao navegador.
- Somente gestor global ativo com acesso a Configurações pode operar a Edge.
- Consultar pessoas/matrículas e todas as cobranças retornadas no período informado.
- Registrar páginas privadas, com cursor, data e origem; permitir pausa, retomada e histórico paginado.
- Mostrar histórico T42 existente como referência, sem presumir que esteja correto.
- Nenhuma emissão, baixa, importação, alteração acadêmica ou sincronização automática nesta etapa.
- Ciclo 2 Banese e demais turmas preservados.

## Manifesto explícito

- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/configuracoes/proesc/ProescConfig.tsx`
- `modules/gestor/configuracoes/proesc/ProescResults.tsx`
- `modules/gestor/configuracoes/proesc/proesc.service.ts`
- `supabase/migrations/20260912150751_proesc_readonly_workspace.sql`
- `supabase/functions/proesc-api/index.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/contract.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/contract.test.ts`
- `supabase/tests/proesc_workspace.transaction.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-consulta-t42.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 16 arquivos.

## Contrato e segurança

- GET exclusivo em api.proesc.com/api/v2/people e /invoices; host fixo, sem redirects.
- Filtros de unidade e período explícitos; não restringir somente mensalidades ou pendentes.
- Token fora do storage, cache de mutations, logs e respostas do frontend.
- Esquema internal_proesc sem acesso anon/authenticated e RLS habilitada.
- RPC pública executável apenas por service_role, com guarda interna; autenticação, perfil e escopo na Edge.
- CAS do cursor impede gravações concorrentes duplicadas. Rotação invalida retomada antiga.
- Respostas sem paginação reconhecida ou erros não encerram consulta silenciosamente.
- Armazenar campos selecionados de pessoas/cobranças; não armazenar payload bruto de erros nem segredos.
- Não presumir vínculo financeiro por nome, descrição ou data; conferência real permanece necessária.
- Os registros recebidos não constituem snapshot transacional do Proesc durante mudanças na origem.

## Validação local

- 10 testes Deno aprovados: autorização negativa, segredo, ações permitidas, host, paginação e erros.
- Deno check da Edge e TypeScript do projeto aprovados.
- ESLint do manifesto de implementação aprovado.
- Build do projeto aprovado; aviso já existente sobre chunks grandes.
- Revisão independente: sem achados P0/P1. P2 da lista limitada corrigido com paginação.
- Smoke Safari com componente real e serviço fictício isolado: estado inicial, token limpo após envio,
  consulta concluída, página seguinte, seleção de aluno e exibição de histórico aprovados.
- Smoke não usou credenciais ou dados reais e não substitui validação autenticada remota.
- Script SQL transacional versionado para testar Vault, grants, CAS, rotação e preservação financeira;
  aprovado via MCP após aplicação da migration 20260912150751; transação revertida.

## Pendências de entrega e operação

- Publicação deste lote autorizada explicitamente pelo usuário em 12/09/2026.
- Migration 20260912150751 e Edge proesc-api v1 aplicadas via MCP; contrato SQL aprovado.
- Edge valida sessão, acesso institucional, gestor global e Configurações antes da RPC.
- Advisor reporta RLS sem políticas nas três tabelas privadas: negação intencional; acesso somente RPC interna.
- Publicar somente este manifesto; preservar alterações independentes (inclusive PR 134).
- Validar tela autenticada no ambiente entregue.
- Gestor cadastra token; testar respostas e permissões reais sem pedir segredo no chat.
- Comparar as cobranças Proesc da T42 com o histórico existente antes de propor correções.
- Frequência automática, vínculo definitivo e correções financeiras são etapas futuras após conferência.

## Fontes oficiais consultadas

- https://proesc.readme.io/reference/autorizacao
- https://proesc.readme.io/reference/pessoas
- https://proesc.readme.io/reference/parcelas
- https://supabase.com/docs/guides/database/vault
