# Máscara monetária por centavos na baixa manual

Estado: VALIDADO PARA PUBLICAÇÃO — PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Formatar juros, multa, desconto e outros acréscimos durante a digitação, tratando cada novo algarismo como centavos: `1` resulta em `R$ 0,01`, `19` em `R$ 0,19`, `190` em `R$ 1,90` e `1900` em `R$ 19,00`. Manter ponto de milhar, vírgula decimal, recálculo imediato do total e exclusão regressiva.

## Manifesto explícito

- `modules/gestor/financeiro/receber/components/manual-settlement/ManualSettlementModal.tsx`
- `modules/gestor/financeiro/receber/components/manual-settlement/manual-settlement-calculation.ts`
- `modules/gestor/financeiro/receber/components/manual-settlement/manual-settlement-calculation.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-hotfix-mascara-monetaria-baixa.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 8 arquivos.

## Contratos preservados

- A máscara é compartilhada pelos quatro campos de ajuste e atua somente na entrada visual.
- O parser canônico em centavos, a composição, o payload, a chave de idempotência e a validação do servidor permanecem inalterados.
- Valor vazio continua representando ajuste zero; composição inválida ou desconto integral continua bloqueando a confirmação.
- Backend, RPC, autorização, banco e integrações bancárias não foram alterados.

## Validação

- Reprodução confirmou que a versão anterior mantinha `19` como texto e somente ao sair do campo convertia para `19,00`.
- Treze testes focados aprovados, cobrindo digitação progressiva, colagem, exclusão, agrupamento brasileiro, limite monetário, composição e payload.
- TypeScript sem emissão, ESLint focado, controle de versão e build de produção aprovados; os oito arquivos do manifesto possuem no máximo 474 linhas.
- A auditoria global de linhas permanece com 12 referências históricas a arquivos removidos, fora do manifesto e sem relação com o hotfix; a pendência não foi misturada à correção financeira.
- Preview Vercel e smoke autenticado no Safari serão concluídos no fechamento.
- Publicação em produção autorizada pelo pedido explícito do usuário em 30/09/2026.
