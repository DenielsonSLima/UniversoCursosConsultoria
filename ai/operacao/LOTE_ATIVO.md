# Lote ativo

Estado: VALIDADO — PUBLICAÇÃO EM ANDAMENTO

## Lote: 2026-09-24-revisao-ciclos-tecnicos

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-24-revisao-ciclos-tecnicos.md`.

- Revisão integral do fluxo afetado: aluno novo, transferências, histórico importado, C1/C2, prévia e retomada.
- Corrigir somente achados reproduzidos: parcela paga após emissão, vencimento revisado e navegação/identidade do modal.
- Workspaces completos das 11 turmas e 454 matrículas passaram pelos parsers da interface.
- Preservar histórico, autorizações, idempotência e bloqueios contra emissão duplicada.
- Publicação pela autorização vigente, condicionada aos testes e revisão independente dos patches.
- Alterações paralelas do Caixa preservadas e excluídas.
- Sessão Safari voltou ao login; solicitada retomada ao usuário para smoke autenticado da prévia.
- Smoke interativo local com componente real e prévia canônica confirmou navegação, troca de ciclo, emissão pendente e matrícula opcional.
- Duas migrations aplicadas; quatro execuções rollback aprovadas (identidade, pago e geração 12/13 itens).
- Após as migrations, respostas completas das 454 matrículas permaneceram idênticas às validadas.
- Edge de emissão v5 ativa, JWT habilitado; 70 fontes conferidas. Build e 81 testes finais aprovados.
