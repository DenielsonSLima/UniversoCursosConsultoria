# Identidade do link manual de recuperação do aluno

Revisão crítica de Auth solicitada com três agentes, restrita à recuperação manual do mesmo fluxo de acesso. A tela publicada 4.8.209 foi conferida no Safari autenticado: carregamento bloqueia ações, estado atual separa e-mail/senha/termos e atualização relê o cadastro completo sem alterar credenciais.

## Falha reproduzida e correção

O e-mail do Auth podia mudar entre a validação do vínculo e generateLink. Se outra identidade passasse a usar o endereço anterior, o handler retornava um link dessa identidade atribuído ao aluno original. A nova guarda exige user.id igual ao Auth validado e action_link presente antes de escrever o estado pendente ou retornar o link. Identidade divergente/ausente responde conflito sanitizado; link ausente falha explicitamente.

Não há redefinição de senha, envio real de recuperação, aceite de termos, migration ou conciliação financeira durante esta revisão. A reprodução usa identidade sintética e a fronteira Auth controlada; não altera contas reais.

## Manifesto explícito

- `supabase/functions/portal-user-management/handlers/send-student-invite.ts`
- `supabase/functions/portal-user-management/handlers/student-recovery-link.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.created-password.test.ts`
- `modules/gestor/parceiros/student-first-access.contract.test.mjs`
- `ai/operacao/registros/alteracoes/2026-10-11-recovery-link-identity.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-28-a-2026-09-30-versoes-4-8-128-a-4-8-137.md`

Total: 11 arquivos. Metadados desta frente serão compostos sobre main, sem incluir o produto de boletim preparado em paralelo. A entrada antiga do changelog permanece integral no arquivo de histórico indicado; fonte já aplicada é imutável.

## Validação e entrega

Validação local: 23 testes Deno do convite/recuperação, 11 cenários SQL reais de CAS/trigger e oito contratos do primeiro acesso passaram; lint focado limpo. A reprodução intercalada com SQL real confirma conflito sanitizado sem link/identidade estrangeira e sem escrita após a geração rejeitada. Revisão cruzada aprovada. O runner existente já executa os testes modificados. CI, Preview e aplicação da Edge serão registrados com seus estados reais na PR isolada.

Limites: smoke autenticado da tela publicada não comprova envio de e-mail ou geração positiva de link real. Nenhuma senha, documento pessoal, token ou payload de produção integra este lote.
