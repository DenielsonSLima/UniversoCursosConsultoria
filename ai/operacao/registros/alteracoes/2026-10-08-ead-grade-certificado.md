# Grade curricular no certificado EAD

## Objetivo e causa

Entrega 4.8.186, autorizada pelo usuário em continuidade à correção EAD.
O verso do Auxiliar Administrativo mostrava a frase genérica de histórico,
embora o curso tenha seis módulos cadastrados. A emissão não congelava a
grade e o adapter da Secretaria não recebia o conteúdo programático.

Aceite: os seis módulos aparecem no verso do certificado, na ordem oficial,
com a mesma fonte canônica na Secretaria, no aluno e na reimpressão.
Somente EAD muda; modelo configurado e demais modalidades são preservados.

## Implementação

- Backend gera snapshot versionado a partir do cronograma, com fallback para
  conteúdos quando não há cronograma. Títulos, ordem, total oficial e páginas
  pertencem ao servidor; nenhuma carga por aula é calculada no navegador.
- Primeira emissão grava o mesmo snapshot no certificado e na validação.
  Documento reutilizado conserva seu conteúdo congelado, código e data.
- Interface consome o snapshot, escapa títulos e não usa o parser técnico
  de componente/carga/nota para a grade EAD.
- Ausência ou incompatibilidade do snapshot impede impressão silenciosamente
  incompleta e fornece erro explícito ao fluxo existente.
- Helper privado completa apenas conteúdo ausente, com curso inalterado desde
  a emissão e correspondência entre certificado e validação. Não reemite.

## Manifesto explícito

- `.github/workflows/ead-automatic-certificate.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-08-ead-grade-certificado.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/aluno/cursos/CursosPage.tsx`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/gestor/secretaria/certificados/certificados.service.ts`
- `modules/gestor/secretaria/certificados/certificados.types.ts`
- `modules/gestor/secretaria/certificados/components/CertificadoPreview.tsx`
- `modules/gestor/secretaria/certificados/components/certificado-preview.utils.ts`
- `modules/gestor/secretaria/certificados/components/ead-certificate-curriculum.test.mjs`
- `modules/gestor/secretaria/certificados/components/ead-certificate-curriculum.ts`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.fixture.mjs`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx`
- `supabase/migrations/20261008160000_build_ead_certificate_curriculum.sql`
- `supabase/migrations/20261008160010_snapshot_curriculum_on_ead_issue.sql`
- `supabase/migrations/20261008160020_complete_missing_ead_curriculum.sql`
- `supabase/tests/ead_automatic_certificate.isolated.test.mjs`
- `supabase/tests/ead_certificate_curriculum.isolated.test.mjs`
- `supabase/tests/fixtures/ead-auto-certificate-schema.sql`
- `supabase/tests/fixtures/ead-certificate-test-harness.mjs`

Total: 24 arquivos. Fixtures versionadas são sintéticas e não contêm
identificadores dos certificados reais ou imagens de produção.

## Validação e revisão

- Três agentes: backend, interface e revisão independente.
- 10 casos SQL de conteúdo: ordem, fallback, paginação, emissão via wrapper
  real de conclusão, rollback, snapshot reutilizado e complemento idempotente.
- 11 casos SQL anteriores executados com as novas migrations aplicadas,
  cobrindo autorização, elegibilidade, reprovação e outras modalidades.
- 5 contratos do adapter de conteúdo, com texto escapado e ausência de cálculos.
- Compositor React, sanitizer e QR reais renderizados em Chromium, com
  snapshot exportado dos testes SQL. PDF com texto selecionável e conferência
  das páginas, texto extraído, imagens isoladas e frente/verso renderizados.
- Modelo de produção inventariado para inspeção adicional, com dados pessoais
  sintéticos; seus assets e coordenadas são preservados. Não houve login em
  sessão real de aluno ou gestor.
- O bridge de download preexistente do aluno não é reescrito neste lote.
  A prova vetorial usa a impressão do compositor da Secretaria.
- Complemento ensaiado com dois registros sintéticos: rollback, replay sem
  escrita e rejeição de inventário divergente.
- CI, limite de linhas e Preview devem aprovar o commit exato antes da produção.

## Complemento controlado e publicação

Inventário revisado: dois certificados EAD finalizados sem conteúdo no snapshot.
Cada curso tem seis módulos e não foi alterado após a emissão. Identificadores
e hashes de conferência permanecem apenas no plano privado de execução.

1. Conferir CI/Preview e drift do emissor privado já publicado.
2. Aplicar as três migrations novas na ordem 160000, 160010 e 160020.
3. Executar transação do conjunto exato, comparando inventário e dados integrais.
4. Verificar seis módulos nos dois snapshots, com código, datas, nota, status,
   contador, matrícula, progresso e demais campos preservados.
5. Integrar a branch e conferir implantação e versão pública 4.8.186.

Backup da definição anterior fica fora do repositório. Reversão de software
restaura somente a função afetada por nova migration; não apaga, revoga ou
reemite certificados existentes. Resultado da implantação é confirmado na entrega.
