# Acesso por matrícula e identificação visual

Estado: VALIDADO PARA PUBLICAÇÃO — PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Permitir o cadastro e o primeiro acesso de alunos que não possuem e-mail, usando a matrícula como identificador sem exigir confirmação de uma caixa postal inexistente. Manter a confirmação obrigatória para endereços reais, exibir a foto disponível na busca global e compactar as tipografias solicitadas na busca e no card do aluno.

## Manifesto explícito

- `modules/gestor/global-search/GestorGlobalSearch.tsx`
- `modules/gestor/global-search/gestor-global-search.service.ts`
- `modules/gestor/global-search/gestor-global-search.types.ts`
- `modules/gestor/global-search/gestor-global-search.contract.test.ts`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/aluno-card-typography.contract.test.ts`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepContact.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/ParceiroAcesso.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/StudentEmailAccessStatus.tsx`
- `modules/gestor/parceiros/student-first-access.contract.test.mjs`
- `modules/gestor/parceiros/utils/parceiro-validators.ts`
- `modules/gestor/parceiros/utils/parceiro-validators.test.ts`
- `supabase/migrations/20260930015130_add_photo_to_gestor_global_search.sql`
- `supabase/tests/gestor_global_search.contract.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-acesso-matricula-busca-foto.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 20 arquivos.

## Causa e correção

- A identidade técnica e o login por matrícula já existiam no backend, mas o formulário ainda exigia e-mail e a aba Acesso consultava e apresentava validação de caixa postal também para aluno sem e-mail.
- O e-mail passa a ser opcional no cadastro; quando informado, continua normalizado e rejeitado se o formato for inválido.
- Sem e-mail, a aba Acesso não consulta o status de confirmação, explica que a confirmação não se aplica e orienta o gestor a gerar o link seguro para entrega por canal confirmado.
- A identidade sintética continua sendo criada pelo backend com `email_confirm: true`; a matrícula é resolvida somente no `portal-auth`. Nenhuma confirmação foi dispensada para e-mails reais.
- A busca global já tinha a foto no cadastro, mas a RPC segura não retornava `foto_url`. A nova versão inclui o campo sem alterar guardas de módulo, polo ou turma.
- O nome da busca foi reduzido de 14 px para 12 px e os metadados de 11 px para 10 px; o nome no card do aluno foi reduzido de 13 px para 11 px.
- `ParceiroAcesso.tsx` foi dividido por responsabilidade e ficou abaixo do teto de 500 linhas.

## Validação

- Dados agregados confirmaram três alunos sem e-mail, todos ainda em `sem_acesso` e sem identidade Auth; nenhum link ou credencial real foi criado durante o teste.
- Vinte e um contratos Node da interface e RPC, quinze testes Deno do convite/validador e oitenta e um testes do portal de autenticação foram aprovados.
- TypeScript sem emissão e ESLint focado foram aprovados.
- Migration aplicada via Supabase MCP como `20260930050403_add_photo_to_gestor_global_search`.
- RPC validada com três resultados para o termo de smoke, um deles com foto, e grants mínimos confirmados: `anon` sem execução; `authenticated` e `service_role` com execução.
- Advisor Supabase sem erros associados ao lote; o aviso de `SECURITY DEFINER` é intencional e mitigado pelas guardas internas e grants mínimos.
- Build, publicação GitHub/Vercel e smoke autenticado no Safari serão concluídos no fechamento.
