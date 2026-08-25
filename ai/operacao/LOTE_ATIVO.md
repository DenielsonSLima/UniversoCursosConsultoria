# Lote ativo

Estado: `PUBLICADO_PRODUCAO_4_8_0`

## Lote: 2026-08-24-identidade-auth-multiperfil-4-8-0

- Pedido: permitir que uma única identidade possua Gestor, Professor, Aluno e Responsável, selecionar o perfil dentro da audiência correta no login e publicar o lote completo em GitHub e Produção após revisão independente.
- Contrato: `/login` resolve somente Aluno/Responsável; `/sistema/login` resolve somente Gestor/Professor. Um perfil entra automaticamente e dois perfis exigem escolha explícita.
- Identidade: todos os perfis compartilhados devem possuir o mesmo CPF válido e o mesmo e-mail canônico do Supabase Auth.
- Registro: `ai/operacao/registros/alteracoes/2026-08-24-identidade-auth-multiperfil.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-24-identidade-auth-multiperfil.md`.
- Versão publicada: `4.8.0` estável.

### Critérios de aceite

1. Um UID Auth pode possuir no máximo um Gestor, um Professor, um Aluno e um Responsável compatíveis. `ATENDIDO_PRODUCAO`.
2. CPF ou e-mail divergente bloqueia o vínculo sem takeover, troca de senha ou convite indevido. `ATENDIDO_PRODUCAO`.
3. O login público nunca oferece Gestor/Professor e o institucional nunca oferece Aluno/Responsável. `ATENDIDO_PRODUCAO`.
4. Primeiro acesso, recuperação de senha, checkout e exclusão de um perfil preservam os demais contextos válidos. `ATENDIDO_PRODUCAO`.
5. O lote deve passar por branch e PR próprios, CI e Preview, Supabase, merge e smoke web de Produção. `ATENDIDO_PRODUCAO`.

### Evidências atuais

- Reunião de três revisores independentes de GitHub, produto e Supabase encerrada com três pareceres `GO` e nenhum finding funcional `P1` ou `P2` aberto.
- PR GitHub `#90` criada a partir da `main` remota `243cb89fe6f11fdf4b8af6f9444e99cf9c8fdd91`; CI, controle de versão e Vercel Preview aprovados no head `f0e41d54872d4bf8d6246b64b1498941ac5b822c`.
- As quatorze migrations foram aplicadas em Produção, na ordem registrada, entre os ledgers `20260825015246` e `20260825015455`; o smoke pós-DDL aprovou índices, triggers, ACLs, HMAC, ordem e invariantes de identidade.
- A Edge Function `portal-user-management` v35 está `ACTIVE`, com `verify_jwt: true`; requisição sem credencial retornou `401` e foi registrada na nova versão sem erro interno.
- A PR `#90` foi mesclada por squash em `db769c78b06fe74fc1752f6015337289e21e854d`; o deploy Vercel de Produção ficou verde e `/`, `/login` e `/sistema/login` responderam `200` no domínio público.
- Suítes de handlers, login, feedback e contratos de migrations, lint, TypeScript, teto de linhas e build de produção foram aprovadas.

### Ordem de publicação

1. Branch e PR GitHub publicadas por MCP somente com o manifesto registrado. `CONCLUIDO`.
2. CI, controle de versão e Vercel Preview aprovados. `CONCLUIDO`.
3. Quatorze migrations aplicadas em ordem e smoke SQL aprovado. `CONCLUIDO`.
4. `portal-user-management` v35 publicada e smoke de autorização aprovado. `CONCLUIDO`.
5. Atualizar evidências imutáveis, regenerar o RAG e revalidar o PR. `CONCLUIDO`.
6. Tornar a PR pronta, efetuar o merge e executar smoke web de Produção. `CONCLUIDO`.

### Limites

1. PRs antigas e alterações paralelas do workspace não integram este lote.
2. Nenhum usuário de teste ou dado pessoal será criado em Produção apenas para o smoke.
3. Migrations aplicadas tornam-se imutáveis e serão registradas com o identificador real do ledger.
4. O smoke autenticado do seletor não criará usuário artificial: Produção ainda possui zero UIDs naturalmente compartilhados entre perfis.
5. A inspeção visual automatizada pós-merge não foi executada porque a sessão não possuía navegador controlável; CI, Preview, contratos de UI e smoke HTTP final permaneceram verdes.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
