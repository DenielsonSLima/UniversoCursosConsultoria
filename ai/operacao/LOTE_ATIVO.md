# Lote ativo

Estado: `EM_REVISAO_GITHUB`

## Lote: 2026-08-24-identidade-auth-multiperfil-4-8-0

- Pedido: revisar as alterações locais mais recentes e atualizar o GitHub com o lote de identidade multiperfil, sem aplicar banco, Edge Functions, merge ou Produção nesta autorização.
- Contrato: `/login` resolve somente Aluno/Responsável; `/sistema/login` resolve somente Gestor/Professor. Um perfil entra automaticamente e dois perfis exigem escolha explícita.
- Identidade: todos os perfis compartilhados devem possuir o mesmo CPF válido e o mesmo e-mail canônico do Supabase Auth.
- Registro: `ai/operacao/registros/alteracoes/2026-08-24-identidade-auth-multiperfil.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-24-identidade-auth-multiperfil.md`.
- Versão proposta: `4.8.0` estável.

### Critérios de aceite

1. Um UID Auth pode possuir no máximo um Gestor, um Professor, um Aluno e um Responsável compatíveis. `ATENDIDO_LOCAL`.
2. CPF ou e-mail divergente bloqueia o vínculo sem takeover, troca de senha ou convite indevido. `ATENDIDO_LOCAL`.
3. O login público nunca oferece Gestor/Professor e o institucional nunca oferece Aluno/Responsável. `ATENDIDO_LOCAL`.
4. Primeiro acesso, recuperação de senha, checkout e exclusão de um perfil preservam os demais contextos válidos. `ATENDIDO_LOCAL`.
5. O lote deve ser publicado em branch e PR próprios, com CI e Preview verificados antes de Supabase, merge e Produção. `EM_ANDAMENTO`.

### Evidências atuais

- Revisões independentes de frontend, backend e migrations identificaram riscos bloqueadores de audiência, prova de convite, mensagens internas e concorrência; todos foram corrigidos e revalidados localmente.
- Supabase de Produção confirmado como `kfekgwyqozhicpfuunpo`; preflight sem duplicidades, divergências ou locks bloqueadores.
- Banco remoto ainda não contém as quatorze migrations do lote; nenhuma aplicação de migration ou publicação de Edge Function foi autorizada ou executada.
- Suítes de handlers, login, feedback e contratos de migrations, lint, TypeScript, teto de linhas e build de produção foram aprovadas localmente.
- `main` remota confirmada em `243cb89fe6f11fdf4b8af6f9444e99cf9c8fdd91`, versão 4.7.7; a referência Git local não será usada como base de publicação.

### Ordem de publicação

1. Criar branch GitHub por MCP a partir da `main` remota e publicar somente o manifesto registrado.
2. Abrir PR em rascunho e aguardar CI e Vercel Preview.
3. Corrigir no mesmo PR qualquer falha de gate ou Preview, sem ampliar o manifesto silenciosamente.
4. Somente após nova autorização explícita: aplicar as quatorze migrations na ordem registrada, publicar `portal-user-management`, executar smoke remoto e avaliar o merge.
5. Produção e smoke pós-produção permanecem fora do escopo atual.

### Limites

1. PRs antigas e alterações paralelas do workspace não integram este lote.
2. Nenhum usuário de teste ou dado pessoal será criado em Produção apenas para o smoke.
3. Migrations aplicadas tornam-se imutáveis e serão registradas com o identificador real do ledger.
4. A abertura do PR não autoriza merge, alteração do Supabase ou publicação em Produção.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
