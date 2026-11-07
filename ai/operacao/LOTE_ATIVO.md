# Lote ativo

## Lote: 2026-11-07-hotfix-foto-cadastro-individual

Corrigir fotos de Parceiros: MIME individual, avatar completo e recuperação privada única, com frescor da lista por remontagem/foco. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-07-hotfix-foto-cadastro-individual.md`; arquivos enumerados no registro. Candidato 4.8.258/revisão 267 sobre main257/035025ed8cc55e9e660312f72c6691b2500656eb; base isolada comprovada pelo responsável em 107/107 blobs. Preservar integralmente Carteirinhas 255, NFS-e 256 e Secretaria 257, RLS, ACL, sessão, bucket, TTL 300, origem/path, escopo polo/global e Realtime; sem polling nem cache persistente de autorização.

Chrome 3054 antes/depois comprovou card correto/cadastro quebrado e mesma foto sintética após correção, zero produção. Validação integrada: 22/22 testes, TypeScript, lint, teto de linhas e build 4531 módulos/13,89 s aprovados. Mudança de base exige um novo índice RAG final após congelar metadados, até 80 trechos. Comunicação adiada pelo usuário; Biblioteca é a próxima etapa após foto 258. Não sobrescrever metadados NFS-e paralelos no workspace; nenhuma sincronização ou operação remota nesta preparação.
