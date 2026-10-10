# Extrato financeiro da turma com vínculo bancário canônico

Versão: 4.8.196. Base: 3886e6b0e12e45001f5a7bf2858965b4d8d4307d.
Escopo autorizado: corrigir divergência entre Gestão > Turma > Financeiro >
aluno e Contas a Receber, publicada na série de correções solicitada.

## Diagnóstico e decisão

O extrato projetava apenas campos Asaas e ignorava gateway Banese. A consulta
agregada da turma relatada confirmou 216 boletos emitidos e ainda pendentes,
mais três títulos cancelados, distribuídos por 18 matrículas. Não havia
pagamentos registrados nesse conjunto. A ausência de vínculo na interface
era falsa; emissão não transforma a parcela em paga.

A RPC existente recebe os campos bancários e a apresentação canônica dos
ciclos. Descontos repetem os guardas da consulta vigente de Contas a Receber.
O frontend reutiliza os apresentadores e abre o boleto existente pela rota
privada autenticada. Não há nova emissão, baixa, estorno, cálculo no cliente,
renumeração ou alteração de valores e permissões. Diagnósticos privados do
banco não são expostos; a quarentena usa apenas um marcador de estado.

O extrato acompanha contas_receber pela matrícula e invalida somente a sua
consulta após atualização e reconexão. A publicação Realtime da tabela já
está ativa. Revisões divididas entre projeção SQL, interface e validação
independente de comportamento e segurança.

## Validação e entrega

- Projeção SQL isolada: 3 cenários passaram, incluindo reprodução anterior,
  preservação dos campos/totais, imutabilidade da tabela e controle de acesso.
- Migration aplicada via MCP: `20261009200452_turma_student_statement_gateway_projection.sql`.
- RPC real conferida em 18 matrículas: 219 títulos, zero divergências de campos,
  emissão e totais; 216 descontos confirmados e documentos existentes disponíveis.
- Durante o trabalho uma baixa manual registrada às 19:53 mudou um título para
  pago, antes da migration das 20:04. A RPC refletiu corretamente R$ 260 recebidos;
  215 títulos pendentes e três cancelados. Nenhuma operação de baixa foi executada
  por esta correção. Não se afirma igualdade de hash de uma base em uso.
- Advisors: nenhum novo achado de segurança. As permissões existentes permanecem.
- Manifesto local: 19 arquivos, máximo 497 linhas. Check global local limitado pelo
  checkout seletivo; a conferência completa é exigida no CI do repositório.
- Testes de apresentação e navegador integram o workflow específico. Chromium local
  bloqueado pelo sandbox; execução do browser exigida no CI antes do merge.
- CI, Preview e publicação pendentes no registro; resultado final registrado na PR.
- Safari autenticado indisponível; navegador isolado usa dados sintéticos.
  Esse teste não equivale a navegar na sessão real de um gestor.
- Entrada 4.8.113 do changelog preservada integralmente no arquivo histórico.

## Manifesto explícito

Total: 19 arquivos.

- `.github/workflows/class-financial-statement.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-turma-financeiro-banese.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-27-versao-4-8-113.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/AlunoFinanceiroExtrato.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.mapper.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/useAlunoExtratoRealtime.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.presentation.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.browser.fixture.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.browser.test.mjs`
- `supabase/migrations/20261009200452_turma_student_statement_gateway_projection.sql`
- `supabase/tests/turma_student_statement.isolated.test.mjs`
- `supabase/tests/fixtures/turma-student-statement-original.sql`
- `supabase/tests/fixtures/turma-student-statement-schema.sql`
