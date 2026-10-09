# Matrícula principal consistente no cadastro do aluno

Versão: 4.8.195. Base: 293e995dd156e8fa3e7803b8be13d1e6b1a5cdc5.
Escopo autorizado: corrigir divergência entre card, cadastro e área de acesso,
com revisão conjunta de três agentes solicitada pelo usuário.

## Diagnóstico e reunião

O card formatava o UUID de parceiros; o cabeçalho usava UUID de matriculas;
a área de acesso apresentava o alias permanente de autenticação. A consulta
remota do caso relatado confirmou apenas um vínculo ativo, afastando múltiplas
matrículas como causa da divergência. O login já aceita matrícula acadêmica
pela resolução autorizada introduzida na versão 4.8.190.

Três frentes revisaram card/dados, acesso/autenticação e identidade/testes.
Decisão conjunta: as três telas exibem a matrícula acadêmica principal, com
mesma configuração e seleção determinística. Prioridade ATIVO, data mais
recente, datas nulas por último e UUID como desempate. Polo deriva da turma.
A consulta em lote existente recebe os campos necessários; sem query por card.
A configuração é aguardada antes da formatação. O modo estrito opcional propaga
erros de consulta em vez de apresentar matrícula com configuração substituta;
a assinatura e o comportamento dos demais consumidores ficam preservados.

O alias antigo continua aceito no login por compatibilidade. A matrícula não
é gerada pelo UUID da pessoa. Ausência de vínculo não inventa número acadêmico.
Movimentações invalidam tanto lista quanto detalhe para atualizar as telas.
Sem renumeração, mutação Auth, troca de senha ou alteração de snapshots,
documentos assinados, elegibilidade e vínculos de outros cursos.

## Validação e entrega

- SQL remoto confirmou a origem dos códigos e a existência de um único vínculo.
- Esquema remoto conferido: polo pertence à turma, não à tabela matriculas.
- Seleção/configuração: 8/8; interface controlada: 7/7; ESLint dos oito arquivos
  de implementação aprovado. PNGs de card, cabeçalho e Acesso conferidos,
  incluindo viewport de 390px e configuração de polo diferente do cadastro.
- Resolvedor real confirmou matrícula principal e alias na mesma conta esperada.
  Testes anteriores do login: SQL 12/12 e endpoint 5/5 aprovados.
- Resolvedor alinhado ao polo da turma, mantendo formatos legados e rejeição
  de ambiguidades. SQL final: 15/15; revisão independente aprovada.
- Migration aplicada via MCP: `20261009193037_resolve_student_login_enrollment_polo.sql`.
  Consulta real após aplicação: principal e alias resolvem mesma conta;
  execução liberada somente ao backend. Advisors sem novos achados de segurança.
- Safari autenticado indisponível. Teste de navegador controlado usa somente
  dados sintéticos; não equivale a um login real na conta da aluna.
- CI, Preview e publicação pendentes; publicação autorizada pelo contexto.
- Arquivo do changelog 4.8.112 preservado integralmente no histórico arquivado.

## Manifesto explícito

Total: 20 arquivos.

- `.github/workflows/student-registration-login.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-matricula-principal-unificada.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-27-versao-4-8-112.md`
- `internal/versioning/system-version.json`
- `modules/gestor/parceiros/parceiros.service.ts`
- `modules/gestor/parceiros/utils/aluno-primary-enrollment.ts`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoMatriculas.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/ParceiroAcesso.tsx`
- `modules/gestor/parceiros/aluno-primary-enrollment.test.mjs`
- `modules/gestor/parceiros/aluno-registration.browser.fixture.mjs`
- `modules/gestor/parceiros/aluno-registration.browser.test.mjs`
- `modules/gestor/configuracoes/academicos/academicos.service.ts`
- `modules/gestor/parceiros/components/viewparceiros/shared/StudentRegistrationAccess.tsx`
- `supabase/migrations/20261009193037_resolve_student_login_enrollment_polo.sql`
- `supabase/tests/portal_academic_registration_login.isolated.test.mjs`
