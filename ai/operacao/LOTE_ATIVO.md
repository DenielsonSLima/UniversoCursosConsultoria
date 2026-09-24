# Lote ativo

Estado: EM IMPLEMENTAÇÃO

## Lote: 2026-09-24-matricula-local-sem-boleto

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-24-matricula-local-sem-boleto.md`.

- Mostrar datas canônicas já na primeira etapa do modal.
- Permitir matrícula como recebível local sem boleto, com baixa manual pelo fluxo auditável existente.
- Distinguir itens bancários e locais na prévia, geração, retomada, progresso e conclusão.
- Preservar os modos anteriores (boleto/omissão), histórico importado e bloqueios de duplicação.
- Matrícula local nunca recebe POST bancário; baixa exige confirmação dos dados do recebimento pelo usuário.
- Publicação pela autorização vigente após contrato real, smoke e revisão independente.
- Alterações paralelas do Caixa preservadas e excluídas.
