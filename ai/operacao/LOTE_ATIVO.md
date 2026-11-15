# Lote ativo

## Lote: 2026-11-15-banese-pagamentos-revisados
Objetivo: conciliar três pagamentos confirmados pelo Banese pelos totais/datas oficiais, sem inferir a composição dos encargos.
Status: migration aplicada, worker106 ativo e três pagamentos conciliados; versão 4.8.345 em publicação.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-15-banese-pagamentos-revisados.md`.
Aceite confirmado pelo usuário: conciliar pelos valores e datas oficiais do banco, registrando a diferença sem inventar a composição dos encargos.
Validação: 34 testes Deno, SQL PGlite, tipagem/lint, build e teto de linhas aprovados. Baixa real e saída do Caixa conferidas; três agentes independentes. Fluxo automático permanece estrito.
Predecessor: histórico Banese publicado em produção na 4.8.344 pela PR #434, worker105 e dois títulos legados conciliados.
Lote local anterior: `ai/operacao/registros/alteracoes/2026-11-15-parceiro-pf-layout-polos.md` (não publicado, preservado).
Publicação paralela preservada: versão 4.8.343 do fluxo de turma/Pix do professor, commit 8f459a687944457a1d5d16273fdcf28abe95b8d6.
