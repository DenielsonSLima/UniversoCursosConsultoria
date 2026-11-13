# EAD — confiança de 24 horas, permissões e certificado

## Pedido e critérios confirmados

O usuário pediu revisão da confiança de 24 horas no EAD e confirmou dois requisitos: todos os usuários internos com acesso à Gestão EAD, respeitando seus polos, podem liberar; durante esse período o aluno também pode fazer a prova final e emitir o certificado. Sem confirmação do pagamento no prazo, curso bloqueado e certificado da mesma matrícula revogado automaticamente.

A matrícula por quem não tem Financeiro mantém cobrança obrigatória. A confiança não representa recebimento nem dispensa a dívida. O comprovante é conferido pelo operador; não foi solicitado novo upload obrigatório no sistema.

## Diagnóstico publicado

- RPC concede a usuários com Gestão e turma/polo autorizados, apenas EAD e matrícula pendente; é uma concessão por matrícula, com 86.400 segundos e sem extensão por repetição.
- A interface escondia a ação dentro de uma seção condicionada ao acesso à aba Financeiro da turma e ainda exigia aba Alunos para agir.
- Acesso do aluno já era bloqueado por relógio e backend ao expirar; a indicação visual do gestor não possuía relógio próprio.
- Prova e certificado estavam bloqueados antes da confirmação do pagamento. O novo requisito explícito passa a permitir ambos durante a confiança, com validade temporal e revogação auditável.
- Consulta agregada publicada confirmou cinco concessões, todas EAD e com duração correta. Nenhum certificado finalizado estava vinculado a essas concessões no momento da revisão. Nenhum dado pessoal foi extraído para este registro.

## Implementação e validação

- Consulta dedicada retorna somente matrícula, nome, situação, prazo e liberação. Perfis sem Alunos/Financeiro não carregam a lista completa existente. A revisão automática rejeitou a primeira proposta de alterar a consulta completa; a alternativa mínima foi revisada e aplicada.
- Painel mínimo de confiança visível a quem acessa Gestão EAD, inclusive sem as abas Alunos e Financeiro. RPC mantém escopo de polo, EAD, matrícula pendente e prazo único de 86.400 segundos.
- Prova usa o cálculo e o cofre de respostas existentes. Conclusão por confiança preserva a matrícula pendente; não registra recebimento nem transforma o acesso em definitivo.
- Emissão temporária usa o emissor e os snapshots existentes. A verificação pública e a entrega recusam código expirado independentemente da execução do cron.
- Confirmação canônica lê a própria cobrança, inscrição, tentativa e prova bancária ou baixa auditada. O primeiro instante observado no servidor determina se a confirmação ocorreu dentro do prazo; data de pagamento retroativa não prolonga confiança.
- Confirmação antes do prazo mantém o código. Confirmação posterior emite um novo código e conserva o anterior revogado, sem reescrever identidade, grade, tabela ou modelo.
- Retorno financeiro aciona reconciliação na mesma transação; cron de minuto processa a revogação persistida. Cancelamento/expiração da tentativa corrente também encerra confiança. Tentativa antiga encerrada não invalida a nova compra nem renova as 24 horas.
- TanStack Query e Realtime refazem o escopo afetado. Relógio fecha acesso no prazo; negativa do servidor bloqueia conteúdo temporário em cache. Download e impressão conferem novamente o código e a validade e descartam o Blob ao expirar.
- Testes usam alunos e cobranças sintéticos. Nenhuma liberação, baixa, boleto, certificado ou revogação real é usada como teste.
- Consulta agregada remota: 14/14 certificados EAD definitivos continuam elegíveis pelas novas guardas; nenhum deles está associado a confiança. Não há backfill de certificados.
- Validação funcional/SQL/portal: 36 passaram; smoke DOM dos componentes reais: três passaram. Modelos configurados: três contratos passaram. PostgreSQL 17 com sessões independentes: três cenários de concorrência passaram no CI; PGlite não é apresentado como teste de concorrência.
- TypeScript e build completo com Node 24.22.1 passaram. O candidato remoto também possui verificação TypeScript sobre a árvore efetivamente publicada.
- Instalação e publicação ficam protegidas por gate inicialmente fechado. A ativação final exige funções, seis callbacks, verificação pública, guarda de entrega e cron, e ocorre após a nova interface estar disponível.

- Instalação remota preparatória: 11 migrations aplicadas, gate fechado; 18/18 corpos de funções conferem com as fontes revisadas. Seis callbacks diferidos ativos, cron de minuto ativo, tabelas privadas com RLS. Nenhum certificado/evento temporário criado; os 14 definitivos continuam disponíveis.

- CI identificou teste de identidade ainda chamando a antiga consulta por curso. O teste agora exige o ID exato e confere filtros de aluno, curso, modalidade e situação; chamada sem ID não consulta. As verificações CIN/RG e de snapshots foram preservadas. Seis casos focados passaram antes da nova rodada do candidato.

## Manifesto explícito

- `modules/gestor/gestao/ead/detalhes/TurmaEadDetalhes.tsx`
- `modules/gestor/gestao/ead/detalhes/components/EadTrustAccessAction.tsx`
- `modules/gestor/gestao/ead/detalhes/components/EadTrustAccessPanel.tsx`
- `modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadRealtime.ts`
- `modules/gestor/gestao/ead/detalhes/ead-turma.types.ts`
- `modules/gestor/gestao/ead/detalhes/ead-trust-access.interaction.test.mjs`
- `modules/aluno/cursos/ead-certificate-delivery.service.ts`
- `modules/aluno/cursos/hooks/useEadCertificateDelivery.ts`
- `modules/aluno/cursos/hooks/useAlunoEadCertificate.ts`
- `modules/aluno/cursos/ead-certificate.service.ts`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/aluno/cursos/CursosPage.tsx`
- `modules/aluno/cursos/eadCertificateDelivery.interaction.test.mjs`
- `modules/aluno/cursos/eadTrustLearning.interaction.test.mjs`
- `modules/gestor/gestao/ead/detalhes/ead-turma.keys.ts`
- `modules/gestor/gestao/ead/detalhes/ead-turma.service.ts`
- `modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadQueries.ts`
- `supabase/migrations/20261112225500_ead_trust_quiz_completion.sql`
- `supabase/migrations/20261112225600_ead_trust_quiz_guard.sql`
- `supabase/migrations/20261112225650_ead_trust_quiz_read.sql`
- `supabase/migrations/20261112225700_ead_trust_payment_eligibility.sql`
- `supabase/migrations/20261112225750_ead_trust_current_access_projection.sql`
- `supabase/tests/ead_trust_access.isolated.test.mjs`
- `supabase/tests/ead_trust_payment.fixture.mjs`
- `supabase/tests/ead_trust_payment.isolated.test.mjs`
- `supabase/tests/ead_trust_quiz_lifecycle.isolated.test.mjs`
- `modules/aluno/turmas/ead-trust-visibility.test.mjs`
- `supabase/migrations/20261112225800_ead_trust_certificate_ledger.sql`
- `supabase/migrations/20261112225810_ead_trust_certificate_issuance.sql`
- `supabase/migrations/20261112225820_ead_trust_certificate_public_delivery.sql`
- `supabase/migrations/20261112225850_ead_trust_certificate_reconciliation.sql`
- `supabase/migrations/20261112225900_ead_trust_certificate_callbacks.sql`
- `supabase/migrations/20261112225950_enable_ead_trust_certificate_lifecycle.sql`
- `supabase/tests/ead_trust_certificate.fixture.mjs`
- `supabase/tests/fixtures/ead-trust-certificate-financial-schema.sql`
- `supabase/tests/ead_trust_certificate.isolated.test.mjs`
- `supabase/tests/fixtures/ead-certificate-test-harness.mjs`
- `supabase/tests/ead_assessment_revision.harness.mjs`
- `supabase/migrations/20261112225450_ead_trust_full_course_rollout_gate.sql`
- `.github/workflows/ead-trust-access.yml`
- `supabase/tests/fixtures/ead-trust-postgres-adapter.mjs`
- `supabase/tests/ead_trust_certificate.concurrent.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-264.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-12-ead-confianca-lifecycle.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `modules/gestor/secretaria/certificados/ead-identity.integration.test.mjs`

Total: 50 arquivos.
