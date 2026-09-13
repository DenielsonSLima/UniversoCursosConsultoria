# Lote ativo

Estado: DIÁRIOS T41/T42 — TRANSCRIÇÃO NO DIÁRIO OPERACIONAL EM EXECUÇÃO

## Lote: 2026-09-13-diarios-operacionais

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-13-diarios-operacionais.md`.

- Corrigir a entrega histórica da 4.8.54: os 14 documentos devem preencher aulas, frequência, notas e conteúdo no diário normal e na grade.
- Abrangência: 12 diários T41 e Anatomia/Ética T42. Manter datas, notas, símbolos e resultados escritos; ajustar somente horas para a carga oficial de aulas (teoria + prática), preservando estágio separado.
- Originais e ledger histórico imutáveis. Conversão interna, sem Word. Sem novos vínculos presumidos, matrícula, promoção, fechamento ou movimentação financeira.
- Quatro frentes: coordenação/projeção, aulas/CH, notas/frequência e interface/PDF de prévia.
- Aceite: 122 encontros operacionais, horas exatas por disciplina, registros vinculados íntegros, replay sem duplicação e validação real T41/T42 no diário normal.
- Quatro identidades sem vínculo conclusivo permanecem separadas; não bloqueiam as demais transcrições.
- Três testes SQL com rollback aprovados para as 14 fontes, incluindo transcrição completa, replay e autorização. Onze migrations aplicadas e versionadas. Dados operacionais aguardam a interface compatível em produção; publicação e smoke final em execução.

## Entrega anterior

- 4.8.54, PR148, main `7bef66d058308344cd3fefc95cfcf4209c7ae6f1`: histórico privado importado, docentes/grade cadastrados. Smoke autenticado confirmou que o diário normal permaneceu vazio; este lote corrige essa lacuna.
- Regras financeiras e workers publicados anteriormente ficam fora deste lote.
