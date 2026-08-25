# Lote ativo

Estado: `EM_REVISAO_FINAL_PRODUCAO`

## Lote: 2026-08-24-identidade-auth-multiperfil-4-8-0

- Pedido: permitir uma única identidade Auth com acessos compatíveis de Gestor, Professor, Aluno e Responsável; selecionar o perfil quando houver mais de um acesso na audiência do login; revisar em três frentes e publicar o lote completo no GitHub e em Produção.
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
- Banco remoto ainda não contém as quatorze migrations do lote; a aplicação em Produção e a publicação da Edge Function foram autorizadas, mas ainda não foram executadas.
- Suítes de handlers, login, feedback e contratos de migrations, lint, TypeScript, teto de linhas e build de produção foram aprovadas localmente.
- `main` remota confirmada em `243cb89fe6f11fdf4b8af6f9444e99cf9c8fdd91`, versão 4.7.7; a referência Git local não será usada como base de publicação.

### Ordem de publicação

1. Criar branch GitHub por MCP a partir da `main` remota e publicar somente o manifesto registrado.
2. Abrir PR em rascunho e aguardar CI e Vercel Preview.
3. Corrigir no mesmo PR qualquer falha de gate ou Preview, sem ampliar o manifesto silenciosamente.
4. Com os gates verdes e GO das três revisões, aplicar as quatorze migrations na ordem registrada, interrompendo no primeiro erro.
5. Publicar `portal-user-management` com o fechamento runtime completo e `verify_jwt: true`; executar invariantes, logs e smoke remoto.
6. Atualizar no mesmo PR as evidências reais da aplicação, revalidar CI/Preview, mesclar e acompanhar o deploy de Produção.
7. Executar smoke público e institucional pós-produção sem criar usuário ou dado pessoal artificial.

### Limites

1. PRs antigas e alterações paralelas do workspace não integram este lote.
2. Nenhum usuário de teste ou dado pessoal será criado em Produção apenas para o smoke.
3. Migrations aplicadas tornam-se imutáveis e serão registradas com o identificador real do ledger.
4. Esta autorização inclui branch, PR, migrations, Edge Function, merge e Produção, condicionados aos gates e ao GO final das três frentes.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
