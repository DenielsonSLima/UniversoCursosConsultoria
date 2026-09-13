# Lote ativo

Estado: VALIDADO — CONFERÊNCIA AUTOMÁTICA DE CICLOS (4.8.64)

## Lote: 2026-09-13-proesc-ciclos-automaticos

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-13-proesc-ciclos-automaticos.md`.

- Consulta automática pelo worker existente e ao abrir o financeiro; botão de conferência removido.
- Rodada real concluída: 427 matrículas, 60 GETs, zero falhas; 122 elegíveis, 149 protegidas e 156 sem prova suficiente de elegibilidade.
- T42: 15 elegíveis e 7 ciclos protegidos; trancados/transferidos continuam bloqueados.
- Fonte incompleta não comprova ausência de segundo ciclo. Identidade e período são avaliados por matrícula.
- Consulta preservou matrículas, recebíveis, pagamentos e títulos bancários, com hashes idênticos.
- Plano individual de C2 Proesc identificado: 13 títulos existentes, sem alteração acadêmica. Registro SEGUNDO_CICLO somente após publicação do frontend compatível.
- Prévia e geração exigem prova recente automaticamente no servidor; a classificação exibida persiste enquanto o manifesto coincidir.
- Banco aplicado em cinco migrations; Edge Proesc v16 ativa e conferida. Frontend 4.8.64 validado para publicação autorizada via MCP GitHub, após CI/Preview.
- 62 testes Edge, 12 testes frontend, ensaios SQL reais com rollback, TypeScript, lint e build passaram.
- Três frentes independentes concluíram backend, contratos da interface e revisão financeira. Manifesto: 41 arquivos; alterações paralelas preservadas.

## Entrega anterior

- 4.8.61 / PR 154 corrigiu regras financeiras, resumo e composição nos módulos financeiros. Este lote conclui a conferência automática solicitada, sem modificar aqueles valores.
