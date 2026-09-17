# Lote ativo

Estado: BANCO CORRIGIDO — EM PUBLICAÇÃO — COMPOSIÇÃO PROESC NA CONCILIAÇÃO (4.8.67)

## Lote: 2026-09-16-conciliacao-composicao-proesc

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-16-conciliacao-composicao-proesc.md`.

- Corrigir a composição ausente na conciliação quando o Caixa já possui detalhamento canônico Proesc.
- Usuário solicitou análise e correção, mantendo validação interna sem navegador.
- Preservar os resultados do resolver compartilhado: composição conferida, parcial, calculada ou mista mantém sua proveniência.
- Valores desconhecidos não viram zero; diferenças permanecem em conferência. Não inferir horário, forma ou conta ausentes.
- Hidratação permanece após a paginação; nenhuma alteração em valores financeiros, filtros, autorização ou no PDF do Caixa.
- Dois arquivos de interface, dois SQL e seis de operação/CI compõem o manifesto de dez arquivos.
- Dezesseis testes de mapper/renderização e lint focado aprovados; revisão independente da interface sem achados.
- Onze cenários SQL, dezesseis testes de interface, TypeScript, lint, build e teto do manifesto aprovados.
- Migration aplicada; RPC autenticada confirma composição igual ao Caixa. Resolver, relatório, listagem e ACLs preservados.
- Versão 4.8.67 / revisão 76 em publicação; CI/Preview/deploy e fechamento serão registrados no PR.
- Entrega anterior fechada: 4.8.66 / PR158. Registro anterior e memória preservados.
