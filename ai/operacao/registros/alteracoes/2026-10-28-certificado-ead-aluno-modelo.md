# Certificado EAD no Portal do Aluno — 4.8.243

## Causa e escopo
A interface do aluno solicitava a linha administrativa `diplomas`, invisível pela RLS de identificação. O retorno vazio era tratado como erro, mas os botões chamavam qualquer estado sem PDF de “Gerando PDF”.

Correção autorizada: leitura de um único modelo EAD para certificado finalizado do próprio aluno ativo. Nenhuma escrita acadêmica, emissão, mudança de código, nota, data ou configuração de modelo integra esta entrega.

## Segurança e contrato
- RPC pública invoker chama função privada STABLE com search_path vazio.
- Identidade vem de auth.uid/current_aluno_id; titularidade, modalidade, finalização e código são verificados antes de ler o modelo.
- Execução concedida somente a authenticated, com negação de anônimo, outro aluno, perfil inativo e certificado inelegível.
- Retorno é apenas o objeto EAD selecionado; não retorna o registro completo, modelos de outras modalidades nem configuração extra de assinantes.
- RLS e permissões existentes de tabelas permanecem intactas. Gestor e compositor PDF não foram alterados.
- Consulta do aluno isolada por aluno/certificado, cancelável, sem retry automático; erro permite repetição explícita.

## Evidências
- Migration MCP aplicada: `20261028185541`, com leitura posterior de definições e grants.
- Hashes de certificado/documento/progresso/curso/template e políticas conferidos sem alteração na aplicação da migration.
- 7 testes SQL + 6 estado/query + 3 JSDOM passaram, inclusive em revisão independente. 3 testes existentes de modelo do gestor passaram.
- TypeScript, lint focado e build completo passaram. Manifesto atual tem todos os arquivos manuais abaixo de 500 linhas; checker agregado local foi executado e aponta apenas fontes históricas ausentes nesta materialização parcial, não alteradas pelo lote. CI do commit publicado valida novamente esses contratos e regressões EAD.
- Sem sessão Safari autenticada disponível: smoke real do aluno e inspeção visual de seu PDF não foram realizados. JSDOM não substitui essa verificação.

## Manifesto explícito

Total: 18 arquivos.
- `.github/workflows/ead-automatic-certificate.yml`
- `supabase/migrations/20261028185541_student_ead_certificate_model.sql`
- `supabase/tests/ead_certificate_student_model.isolated.test.mjs`
- `modules/aluno/cursos/CursosPage.tsx`
- `modules/aluno/cursos/eadCertificateModel.ts`
- `modules/aluno/cursos/eadCertificateModel.test.ts`
- `modules/aluno/cursos/eadCertificateModel.ui.test.mjs`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/aluno/cursos/hooks/useAlunoEadCertificateModel.ts`
- `modules/aluno/cursos/components/EadCourseRoom.tsx`
- `modules/aluno/cursos/components/EadLearningContent.tsx`
- `modules/aluno/cursos/components/AlunoCertificateModelStatus.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-28-certificado-ead-aluno-modelo.md`
- `ai/operacao/rag/index.json`
