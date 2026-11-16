# Publicação focada: Baixar em despesas

Objetivo: trocar Dar baixa por Baixar, sem mudança de comportamento.
Autorização: proprietário confirmou publicar após pergunta explícita em 16/11/2026.
Classificação: publicação; ajuste originalmente local reclassificado para atender CI de versão.
Manifesto: DespesaTable.tsx e DespesaCard.tsx em modules/gestor/financeiro/despesas/components; scripts/test-despesas-contas-pagar-contract.mjs; internal/versioning/system-version.json; internal/versioning/CHANGELOG.md; este registro.
Aceite: Baixar para pendentes/vencidas, Pagar saldo para parcial, mesmo callback e estados restritos preservados.
Validação local: 12 casos React/JSDOM aprovados nos componentes reais; diff restrito a rótulos. Contrato-fonte atualizado para a nova intenção. Arquivos do manifesto abaixo de 500 linhas.
Validação remota: CI e Preview devem passar no commit final antes do merge.
Limitação: smoke autenticado no Safari indisponível (computadores desconectados); teste local não substitui essa verificação visual.
Risco: baixo, sem mudança de banco, cálculos, permissões ou estilos. Correção do piscar pertence a outra frente e não integra este lote.
Lote ativo paralelo de cupons e todo seu histórico preservados. Reversão possível pelo commit desta PR.
