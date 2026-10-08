# Aviso do segundo ciclo antes do assistente

## Objetivo e comportamento

Candidata 4.8.182 sobre main 4.8.181. O clique em **Gerar e emitir 2º ciclo**
apresenta primeiro a confirmação com parcelas abertas. **Continuar** apenas abre
a tela existente de datas, composição e revisão. **Cancelar** fecha a ação.
A emissão permanece na confirmação final padrão.

A versão anterior já possuía o aviso, mas só o mostrava ao clicar na última
etapa. O teste de interação reproduziu esse problema antes do patch.

## Implementação e escopo

- Aceite da entrada associado à turma, matrícula e ciclo solicitado. Novo aluno
  ou nova abertura exige confirmação própria; resposta antiga é descartada.
- A consulta de prévia permanece desabilitada enquanto o aviso está aberto.
  Não depende de data preenchida, prévia calculada ou revisão de valores.
- Consulta e releitura de parcelas, parser estrito, tratamento de erro,
  Cancelar/Escape, foco e proteção contra clique duplo são reutilizados.
- Datas e valores continuam editáveis pelo assistente padrão. Alterar a prévia
  não reapresenta o aviso inicial. Validação e emissão usam o handler existente.
- C1 segue direto para seu assistente. Sem alterações em regras financeiras,
  autorização, RPC, banco, filas, baixa, cancelamento ou emissão real.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-07-aviso-c2-antes-do-assistente.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroSecondCycleWarning.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/second-cycle-warning.interaction.test.mjs`

Total: 9 arquivos.

## Validação e entrega

- Dez cenários React DOM com componentes reais e rede simulada: aviso antes do
  assistente, parcelas abertas, continuação sem emissão, Cancelar/Escape,
  ausência de data/prévia, recálculo, erro/retry, troca de matrícula, releitura
  alterada, reabertura e regressão do primeiro ciclo.
- 28 testes focados de parser/controlador, confirmação canônica, progresso e
  contrato visual aprovados. Lint dos quatro arquivos de código/teste aprovado.
- Revisão independente e checklist React sem achados bloqueantes.
- Dados exclusivamente sintéticos. Nenhuma chamada bancária ou emissão real.
- Validação visual em navegador não executada por proibição expressa do usuário.
- Produção depende de autorização explícita conforme AGENTS.md. Este registro
  descreve a candidata e não declara sua publicação no site.
- Alterações paralelas do registro local de manifestos são preservadas e ficam
  fora do payload remoto: ele inclui somente a entrada deste lote sobre main.
