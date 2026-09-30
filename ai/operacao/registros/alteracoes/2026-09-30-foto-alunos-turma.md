# Foto do aluno nas matrículas da turma

Estado: BACKEND PUBLICADO — FRONTEND VALIDADO E AUTORIZADO PARA PRODUÇÃO

## Objetivo e aceite

Exibir em Gestão > Turma > Alunos a foto já cadastrada para o aluno, preservando a inicial quando não houver foto ou quando a URL falhar. A correção deve reutilizar o contrato acadêmico protegido, não ampliar escopo de acesso e chegar à produção na versão 4.8.136.

## Causa confirmada

- O cadastro guarda a foto em `parceiros.foto_url`, e o card de Parceiros já a apresenta corretamente.
- `get_turma_alunos_academico(uuid)` retornava dez campos sem `foto_url`.
- `AcademicStudent` não declarava a foto e `TurmaAlunosTable` desenhava sempre `nome.charAt(0)`.
- A definição remota e o código local convergiram com as capturas fornecidas. A RPC não possui dependentes catalogados e mantém owner `postgres`.

## Correção

- Migration nova recria somente o wrapper público e acrescenta `foto_url` como 11ª coluna, preservando as dez posições históricas.
- A função interna acadêmica, frequência, remoção e ordenação nominal permanecem inalteradas.
- `AcademicStudent` transporta `foto_url`, e o avatar usa `object-cover`, restaura a tentativa quando a URL muda e volta à inicial em erro.
- A alteração alcança também a visão de plano financeiro único que reutiliza `TurmaAlunosTable`.

## Segurança e compatibilidade

- Permanecem `can_operate_turma_academics`, `SECURITY DEFINER`, `search_path` vazio e relações totalmente qualificadas.
- `PUBLIC`, `anon`, `authenticated` e `service_role` são revogados antes de restaurar execução somente a `authenticated` e `service_role`.
- A migration passou em transação real com rollback, conferindo assinatura exata, foto retornada, grants e restauração integral do contrato anterior.
- Backend é compatível com o frontend anterior; a migration pode ser aplicada antes da publicação visual.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/academic-lifecycle.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/TurmaAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/turma-alunos-photo.contract.test.mjs`
- `supabase/migrations/20260930200000_add_photo_to_turma_students_rpc.sql`
- `supabase/tests/turma_alunos_photo.contract.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-foto-alunos-turma.md`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 11 arquivos.

## Validação concluída

- Quatro contratos focados aprovados para transporte, fallback, assinatura SQL e guardas.
- ESLint focado e TypeScript sem emissão aprovados.
- Build de produção aprovado.
- Arquivos manuais do manifesto abaixo de 500 linhas.
- Revisão independente: nenhum achado crítico ou importante após preservar a ordem posicional.
- Migration aplicada em produção pelo MCP Supabase sob o identificador `20260930185331:add_photo_to_turma_students_rpc`.
- Assinatura remota confirmada com os dez campos históricos na mesma ordem e `foto_url` como 11º campo.
- Smoke remoto do contrato encontrou três matrículas na turma conferida, duas com foto pública válida, sem liberar execução a `anon`.
- A checagem global de limite de linhas continua bloqueada por 12 referências antigas ausentes no manifesto histórico; nenhuma pertence a este lote.

## Fechamento remoto pendente

- Criar commit atômico/PR e Preview Vercel pelo MCP, validar o fluxo no Safari autenticado e publicar em produção.
- Registrar no fechamento da entrega os identificadores de PR, commit e deployment e o resultado da observabilidade.
