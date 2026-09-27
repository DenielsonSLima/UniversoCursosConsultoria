# Matrícula técnica ativa e cadastro mínimo

Estado: VALIDADO — PUBLICAÇÃO EM PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Ao adicionar um aluno regular a uma turma técnica já iniciada, a matrícula precisa retornar `ATIVO` na própria transação. A geração de boletos, o financeiro, anexos e o checklist documental pertencem a fluxos posteriores e não podem impedir ficha de matrícula, carteirinha ou demais operações acadêmicas liberadas pelo vínculo ativo.

O ingresso continua bloqueado quando o cadastro não contém nome, CPF válido, filiação materna e paterna e endereço mínimo aceito pelo BolePix Banese. Número e complemento são opcionais porque o contrato bancário aceita o logradouro sem esses campos. Os dados do Ensino Médio são informativos, não bloqueiam a matrícula e aceitam a opção `EJA`.

## Implementação

- A RPC de pré-vínculo calcula o status exclusivamente pela fase da turma: `EM_ANDAMENTO` produz `ATIVO`; fases anteriores produzem `PENDENTE`.
- A ativação acontece na mesma transação e uma pós-condição aborta o ingresso se o status persistido divergir.
- A configuração financeira permanece `PENDENTE`, sem título ou cobrança automática.
- A guarda de cadastro foi replicada no frontend e no banco para impedir desvio pela chamada direta da RPC.
- Ensino Médio foi retirado da guarda de admissão e `EJA` foi adicionado ao cadastro, à edição, ao perfil do aluno e à restrição do banco.
- A busca de candidatos retorna o cadastro mínimo em uma única RPC, preservando `SECURITY INVOKER`, autorização por módulo/polo e grants restritos.
- Cards deixam de tratar toda matrícula não ativa como “Inativo”: exibem Ativos, Pendentes e Saídas.
- Secretaria passa a mostrar separadamente o status da matrícula e o status cadastral.
- Após o pré-vínculo, os caches da turma, resumos e lista de alunos são invalidados de forma direcionada.

## Manifesto explícito

- `modules/gestor/gestao/components/TurmaCard.tsx`
- `modules/gestor/gestao/gestao-create-turma.service.ts`
- `modules/gestor/gestao/gestao.mappers.ts`
- `modules/gestor/gestao/gestao.service.ts`
- `modules/gestor/gestao/gestao.types.ts`
- `modules/gestor/gestao/technical-card-progress.contract.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/turma-alunos.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/useTechnicalEnrollmentConfirmation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/technical-enrollment-ui-cache.contract.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/manual-technical-enrollment.contract.test.mjs`
- `modules/gestor/secretaria/alunos/SecretariaAlunosPage.tsx`
- `modules/gestor/secretaria/alunos/secretaria-alunos-status.contract.test.mjs`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepEducation.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetailsSections.tsx`
- `modules/aluno/perfil/PerfilTechnicalSection.tsx`
- `modules/aluno/perfil/perfil.types.ts`
- `modules/aluno/perfil/perfil-update.service.ts`
- `modules/shared/utils/technicalEnrollmentRequirements.ts`
- `modules/shared/utils/technicalEnrollmentRequirements.test.ts`
- `modules/shared/utils/technicalHighSchoolEja.contract.test.mjs`
- `supabase/migrations/20260927130000_harden_technical_admission_profile_and_status.sql`
- `supabase/tests/technical_admission_profile_status.contract.test.ts`
- `supabase/tests/imported_technical_class_history.rollback.sql`
- `supabase/tests/external_transfer_entry.rollback.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-27-matricula-tecnica-ativa-cadastro-minimo.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 30 arquivos.

## Validação local e remota

- 21/21 testes de frontend e contrato aprovados para cadastro mínimo sem Ensino Médio obrigatório, opção `EJA`, classificação dos cards, status na Secretaria, invalidação de cache e matrícula manual sem cobrança.
- 5/5 testes contratuais Deno aprovados para status por fase, pós-condição, cadastro mínimo, autorização, idempotência e busca de candidatos.
- ESLint focado aprovado nos arquivos TypeScript/TSX alterados.
- TypeScript global (`tsc --noEmit`) aprovado.
- Todos os arquivos manuais do manifesto permanecem abaixo de 500 linhas.
- Build completo de produção aprovado; após avanço paralelo da `main`, o lote foi promovido para a versão `4.8.114` preservando integralmente a `4.8.113` financeira.
- Migration aplicada em produção via MCP Supabase sob o ledger `20260927125343_harden_technical_admission_profile_and_status`.
- Estrutura remota conferida: função com grants apenas para `authenticated` e `service_role`, ativação na mesma transação, guarda sem campos do Ensino Médio e constraint aceitando `CURSANDO`, `CONCLUIDO` e `EJA`.
- Smoke remoto transacional com rollback aprovado para dois alunos sintéticos, um sem Ensino Médio e outro com `EJA`: ambos ficaram `ATIVO` na turma iniciada, o financeiro permaneceu `PENDENTE` e nenhuma cobrança foi criada.
- A população elegível pela nova guarda é de 406 entre 449 cadastros ativos; a consulta foi agregada e não expôs dados pessoais.
- Advisors não apontaram ocorrência de performance ligada ao lote. O aviso de segurança da função `SECURITY DEFINER` é esperado e mitigado pela autorização interna por turma/módulo e pelos grants restritos já validados.

## Pendências para publicação

- Publicar somente o manifesto explícito no GitHub e aguardar a implantação da versão `4.8.114`.
- Executar smoke autenticado da interface em produção sem criar ou alterar cadastro real.

Produção autorizada explicitamente pelo usuário em 27/09/2026. O resultado remoto, os identificadores de publicação e os smokes serão registrados após a execução.
