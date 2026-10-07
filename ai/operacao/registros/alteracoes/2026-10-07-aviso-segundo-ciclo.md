# Aviso antes da geração do segundo ciclo

## Objetivo e contrato

Versão candidata: 4.8.180, baseada em 4.8.179.
Antes da emissão C2, mostrar obrigações em aberto da matrícula e exigir confirmação explícita.
A elegibilidade canônica continua permitindo C2 com C1 pendente; o aviso não altera cálculo, autorização, idempotência, recuperação ou proveniência.
Não há migration, deploy de Edge Function, cancelamento, baixa ou emissão financeira neste lote.

## Implementação

- O botão final do C2 abre aviso separado; o C1 mantém seu caminho existente.
- Consulta de extrato por matrícula, com parser estrito. PENDENTE/VENCIDO/PARCIAL entram; PAGO/CANCELADO ficam fora.
- Valores são apresentados como nominais, com valor pago informado quando existente. Não há cálculo de saldo no frontend.
- Confirmar relê o extrato: mudança exige nova confirmação; erro ou resposta incompleta bloqueiam.
- Fechar, voltar, desmontar ou alterar matrícula/turma/prévia invalida o aceite e respostas tardias.
- A trava de clique é síncrona; a emissão usa o handler, os fingerprints e a chave idempotente existentes.
- O aviso substitui o diálogo original e suspende seu foco/Escape. Nenhuma dupla captura de teclado.
- A RPC existente é protegida por autorização financeira/polo; ausência de resultado falha fechada.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-07-aviso-segundo-ciclo.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroSecondCycleWarning.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/second-cycle-warning.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-dialog-presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/second-cycle-warning.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/second-cycle-warning.interaction.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-modal-ux.contract.test.ts`

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`

Total: 14 arquivos.

## Validação e limites

- 35 testes focados aprovados: confirmação canônica, UI/UX e novo parser/controlador.
- Sete cenários React DOM aprovados, com componentes reais e I/O simulado: listagem, confirmação explícita, Escape, cancelamento durante releitura/clique repetido, recálculo, permissão negada, fingerprint alterado, lista vazia e C1.
- Versão validada pelo script oficial; manifesto local conferido abaixo de 500 linhas por arquivo.
- Sem chamadas bancárias em testes; dados exclusivamente sintéticos.
- Checkout focado via MCP: build, lint, TypeScript, teto agregado e indexação operacional completos serão executados no CI do commit exato.
- Smoke visual autenticado continua pendente. Teste DOM não declara homologação visual em produção.
- O aviso é uma proteção da interação; as regras transacionais de duplicidade e autorização continuam no backend existente.
