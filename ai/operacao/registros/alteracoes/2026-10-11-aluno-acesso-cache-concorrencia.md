# Acesso do aluno: cache e concorrência

Continuação crítica do fluxo de acesso revisado na 4.8.208, entregue pela PR302. O usuário pediu nova revisão pelos três agentes; a autorização explícita para correção e produção do mesmo fluxo permanece válida. Entrega 4.8.209 com migration e função por MCP Supabase, manifesto atômico por MCP GitHub, CI, Preview e produção no projeto existente.

## Reprodução e resultado

- Smoke no Safari autenticado reproduziu a busca global fornecendo cadastro parcial à aba Acesso: e-mail ausente e situação desconhecida apesar dos dados completos no banco. A aba passa a reler cadastro e confirmação de e-mail, bloqueando as ações até concluir ambas as leituras. Reentrada cancela consultas anteriores; falha permite tentar novamente.
- O handler e os triggers reais, em banco isolado, reproduziram criação de senha durante reenvio seguida de retorno indevido à troca obrigatória. Todas as escritas do convite, inclusive vínculo e falha, passam a comparar identidade, escopo e prova de acesso no mesmo UPDATE, evoluindo o snapshot pelo RETURNING. Mudança concorrente retorna 409 sem entregar link manual nem sobrescrever senha ou termos; e-mail efetivamente enviado continua informado.
- A reserva temporária reutilizava permissões anteriores às locks. Reserva e confirmação passam a fixar gestor e fontes existentes de permissão herdada, reler o contexto atual e autorizar antes de replay ou escrita. Preservam os contratos de identidade, senha própria e consentimentos já publicados.

## Aceite e revisão

| Caso | Resultado esperado |
| --- | --- |
| Busca global com cadastro parcial | Ler cadastro completo e confirmação antes de liberar ações. |
| Senha criada em outra sessão | Exibir senha definida e termos pendentes, oferecendo recuperação. |
| Reentrada com consulta antiga em andamento | Cancelar a consulta anterior e usar a leitura desta entrada. |
| Falha de leitura ou conflito de envio | Bloquear ações até revalidar; permitir nova tentativa. |
| Senha ou identidade alterada durante reenvio | Recusar snapshot antigo; preservar senha e consentimentos. |
| Revogação de escopo, status ou permissão herdada | Recusar confirmação, reserva e replay sem alterações. |

Backend/Auth, interface e contratos possuem frentes independentes e revisão cruzada. A revisão cruzada identificou a deduplicação de consultas antigas em voo e a assimetria das fontes herdadas na confirmação; ambas foram incluídas no fechamento do mesmo domínio.

## Manifesto explícito

- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/ParceiroAcesso.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/StudentAccessSummary.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/student-access-refresh.ts`
- `modules/gestor/parceiros/components/viewparceiros/shared/student-access-refresh.test.ts`
- `modules/gestor/parceiros/student-first-access.contract.test.mjs`
- `supabase/functions/portal-user-management/handlers/send-student-invite.ts`
- `supabase/functions/portal-user-management/handlers/student-invite-state.ts`
- `supabase/functions/portal-user-management/handlers/student-invite-failure.ts`
- `supabase/functions/portal-user-management/handlers/student-access-identity.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.shared-identity.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.created-password.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.error-sanitization.test.ts`
- `supabase/tests/student_invite_state.isolated.test.mjs`
- `supabase/tests/fixtures/student-invite-state-harness.mjs`
- `supabase/migrations/20261011123000_revalidate_student_temporary_password_reservation_actor.sql`
- `supabase/tests/fixtures/student-email-confirmation-harness.mjs`
- `supabase/tests/student_email_confirmation.isolated.test.mjs`
- `scripts/test-student-email-access.mjs`
- `ai/operacao/registros/alteracoes/2026-10-11-aluno-acesso-cache-concorrencia.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 25 arquivos.

## Validação e entrega

- Validação local: 50 casos Node de interface/transporte, 26 Deno de convite/prova e 39 SQL/handler com funções e triggers reais (28 confirmação/reserva e 11 reenvio) passaram. Lint focado, compilação das entradas, build 4.8.209 e gate de linhas passaram; todos os arquivos do manifesto respeitam o teto de 500.
- Revisão cruzada aprovada nas três frentes. O revisor executou independentemente quatro casos de interface e quatro de CAS/delivery; backend comparou o corpo integral da confirmação e confirmou que somente as locks herdadas foram acrescentadas.
- O runner existente do CI inclui as regressões de cache e SQL/handler, preservando o workflow de qualidade já no teto de linhas. CI e Preview devem passar antes da promoção; resultados finais e smoke publicado serão registrados na PR de entrega.

As migrations aplicadas na 4.8.208 permanecem imutáveis. A nova migration substitui somente as funções de reserva e confirmação, sem alterar assinaturas ou grants efetivos. Foi aplicada por MCP com versão de ledger `20261011121928`, correspondente ao arquivo `20261011123000_revalidate_student_temporary_password_reservation_actor.sql`. Readback confirmou ambos os corpos idênticos à fonte local, SECURITY DEFINER com search_path vazio e execução exclusiva de service_role/proprietário.

`portal-user-management` está ACTIVE na versão 39, com JWT habilitado. Os 39 arquivos do pacote anterior foram preservados, substituindo somente três implementações autorizadas e acrescentando o helper de snapshot. Readback conferiu os 40 arquivos sem divergências contra o pacote candidato; testes ficaram fora do deploy.

A checagem transacional do contrato remoto passou: retry autorizado da confirmação, recusa de snapshot divergente e recusa de reserva para senha própria. Asserções preservaram integralmente Auth, perfil, credencial e contagem da auditoria. Nenhuma senha foi redefinida ou termo aceito nessa checagem.

O Preview desta branch recebe apenas as quatro configurações públicas necessárias já verificadas no projeto existente. Produção e demais branches mantêm seus escopos. Artefatos de testes, build e capturas ficam fora do manifesto.

## Limites comprovados

- As corridas são exercitadas por mutações intercaladas em PGlite com funções e triggers reais; não equivalem a disputa simultânea de locks entre sessões de produção.
- Fontes existentes de permissão herdada são fixadas. Um polo ausente no contexto textual não concede escopo global; sua eventual inserção pode ampliar o contexto posteriormente, sem revogar a permissão previamente válida para o alvo.
- Foi identificado um estado legado defensivo sem hash, sem evidência de senha e com troca obrigatória falsa. A consulta agregada remota encontrou zero ocorrências e não foi demonstrado um caminho normal que o produza. Finalizadores e recuperação em massa desse estado ficam fora deste manifesto.
- O smoke completo do login do aluno depende da interação específica no CAPTCHA. Nenhum termo é aceito pelo agente. O smoke do gestor é obrigatório para a entrega desta interface.
