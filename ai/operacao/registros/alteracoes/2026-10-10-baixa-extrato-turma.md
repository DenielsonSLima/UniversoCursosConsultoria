# Receber pelo extrato do aluno na turma

Versão: 4.8.197. Base: 971c09242774316a364b9b63ccdb543dd8d30910.
Pedido: permitir baixa tanto em Gestão > Turma > Financeiro > aluno quanto
em Financeiro > Contas a Receber, usando as mesmas regras e confirmação.

## Implementação

O extrato só abria o boleto existente. Agora recebe a permissão de baixa do
caller e oferece Receber para títulos pendentes/vencidos com capability
canSettle. Histórico Proesc, conflito, quarentena e cancelamento em andamento
continuam bloqueados; ausência de permissão/capability nunca concede baixa.

Reutiliza ManualSettlementModal e financeiroService.markReceivablePaid.
Não há novo cálculo ou endpoint. Contas ativas são filtradas por polo físico
ou global; erro de consulta bloqueia confirmar inclusive com cache antigo.
Clique duplicado usa trava síncrona. Erro preserva formulário e nonce para
nova tentativa; resposta sem success:true não confirma visualmente a baixa.

Sucesso e erro reconciliam o extrato, workspace da turma, Contas a Receber,
consulta do aluno, resumo e saldos. A decisão bancária permanece no servidor;
nenhuma baixa é antecipada na interface. Realtime mantém a leitura corrente
para bloquear envio de título que mudou de elegibilidade com a janela aberta.

Pago com boleto cancelado não sugere retomar emissão. Forma de baixa manual
usa o valor registrado, preservando o canal BolePix dos pagamentos bancários.

## Validação e limites

- Apresentação e guardas: 11 cenários passaram localmente.
- Revisão independente do endpoint, permissões, contas e invalidações concluída.
- Browser integra modal/formulário/hook reais; apenas fronteiras IO usam dados
  sintéticos. Cobre sucesso, atualização sem evento Realtime, repetição, erros,
  permissões, contas e recebíveis que mudam durante a confirmação.
- Browser exigido no CI antes do merge: Chromium local bloqueado pelo sandbox.
- Safari autenticado indisponível; não foi feita baixa real para testar.
- Sem migration, mudança de RBAC ou operação bancária real.
- Checkout local seletivo limita build e conferência global; CI e Preview
  validam repositório completo. Resultados finais e produção ficam na PR.
- Changelog 4.8.114 arquivado integralmente para respeitar teto de 500 linhas.

## Manifesto explícito

Total: 17 arquivos.

- `.github/workflows/class-financial-statement.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-10-baixa-extrato-turma.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-27-versao-4-8-114.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/AlunoFinanceiroExtrato.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/AlunoExtratoSettlementModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/useAlunoExtratoSettlement.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.settlement-policy.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.presentation.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.browser.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.settlement.browser.fixture.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.settlement.browser.test.mjs`
