# Emissor NFS-e: permissão efetiva e lista de piloto

## Diagnóstico

O cadastro marca `emissor-nfse` como liberado, mas a RPC de acesso também exige
uma linha privada do rollout inicial. A interface de permissões não administra
nem exibe essa segunda condição, tornando a informação de liberação ambígua.

## Correção preparada

- A RPC passa a respeitar a permissão institucional efetiva, própria ou herdada.
- Mantém identidade vinculada ao contexto, usuário ativo, papel Gestor e horário.
- Não concede módulos, não muda perfis e preserva guardas de polo/ambiente/ações.
- Tabela de piloto permanece privada e inalterada como registro histórico.
- Retirada da permissão passa a bloquear mesmo se houver grant antigo.

Manifesto: migration `20261112134516_nfse_effective_module_access.sql`, teste
`supabase/tests/nfse_effective_access.isolated.test.mjs`, comentários/nomes do
gate de interface e este registro.

## Evidências

Oito testes PostgreSQL isolados: permissão própria/herdada/customizada,
revogação, identidade/contexto forjados, anonimato, inatividade, horário, grants
mínimos, acesso privado negado e guarda real de polo ativo/ambiente.
284 testes do contrato/frontend NFS-e aprovados, incluindo troca de
sessão, revogação e falha fechada. Nenhuma nota emitida/cancelada.

## Estado

Migration 20261112134516 aplicada via MCP após autorização explícita e revisão independente.
Três liberações individuais confirmadas pelo proprietário; acesso efetivo conferido.
Correção não concede novos módulos: elimina requisito oculto para permissões já efetivas.
Novas liberações futuras passam a funcionar pelo mesmo controle institucional.
Smoke visual autenticado pendente; nenhum documento fiscal emitido/cancelado.
Publicação GitHub e CI em preparação.

## Manifesto explícito

- `supabase/migrations/20261112134516_nfse_effective_module_access.sql`
- `supabase/tests/nfse_effective_access.isolated.test.mjs`
- `modules/gestor/gestor-module-access.ts`
- `modules/gestor/emissor-nfse/access/nfse-pilot-access.test.ts`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-effective-access.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-23-versao-4-8-233.md`

Total: 11 arquivos
