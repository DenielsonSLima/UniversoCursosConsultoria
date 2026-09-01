# Hotfix da prévia dos ciclos financeiros manuais técnicos

Data: 2026-09-01
Estado: publicação autorizada; aguardando PR, CI e produção

## Objetivo e contrato entregue

- O modal usa portal no `document.body` e ocupa `100dvh`, com cabeçalho e
  rodapé estáveis e conteúdo central rolável.
- O fluxo possui três etapas explícitas: dados e vencimento, composição das
  cobranças e revisão com confirmação final.
- A elegibilidade é exibida em linguagem humana, sem vazar o código interno
  `PENULTIMA_SEM_ATRASO` para o usuário.
- A composição lista todos os itens canônicos da prévia, inclusive rematrícula,
  parcelas, vencimentos, valores e aplicação de desconto, multa e juros.
- A última ação se chama `Gerar cobranças`; nenhuma mutação ocorre nas etapas
  anteriores.
- O frontend valida a estrutura da prévia, mas não recalcula valores,
  vencimentos ou condições financeiras definidos pelo backend.

## Limites e integridade

- Nenhum arquivo de banco, migration ou Edge Function integra este hotfix.
- Nenhuma emissão Banese, webhook ou automação bancária foi adicionada.
- Nenhuma geração foi executada para a Turma 42, Adenize ou outro aluno.
- Recebíveis e títulos existentes permanecem intactos.
- O smoke visual autenticado ficou pendente porque o navegador integrado não
  estava disponível; essa limitação não foi mascarada por testes não
  relacionados.

## Validação local

- 34 de 34 testes Deno focados aprovados.
- TypeScript (`tsc --noEmit`) aprovado.
- ESLint focado nos arquivos do hotfix aprovado.
- Gate de 500 linhas aprovado; todos os arquivos manuais do manifesto estão
  dentro do teto.
- Build de produção da versão 4.8.23 aprovado, mantendo apenas avisos de chunks
  já existentes.
- Três revisões independentes não encontraram bloqueadores.

## Manifesto explícito

Total: 15 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-01-hotfix-previa-ciclos-financeiros-manuais-tecnico.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-21-a-2026-08-22-parte-2.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-modal-ux.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`

## Evidência de publicação

- Pendente de preenchimento após PR, workflows, Preview e produção.
