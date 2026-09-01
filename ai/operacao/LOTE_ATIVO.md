# Lote ativo

Estado: `PUBLICAÇÃO AUTORIZADA — AGUARDANDO PR/CI/PRODUÇÃO`

## Lote: 2026-09-01-hotfix-previa-ciclos-financeiros-manuais-tecnico

- Pedido: tornar a geração manual de ciclos técnicos um fluxo claro em três
  etapas, com composição financeira completa antes da confirmação final.
- Autorização: publicação no GitHub, `main` e produção autorizada
  explicitamente pelo usuário em 01/09/2026.
- Risco: crítico, por alterar a confirmação visual de criação de recebíveis.
- Registro:
  `ai/operacao/registros/alteracoes/2026-09-01-hotfix-previa-ciclos-financeiros-manuais-tecnico.md`.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-09-01-hotfix-previa-ciclos-financeiros-manuais-tecnico.md`.

### Contrato do lote

1. O modal ocupa a viewport real por portal, sem folga superior nem contenção
   pelo layout da página.
2. A geração possui três etapas: dados e vencimento, composição das cobranças
   e revisão com confirmação final.
3. Códigos internos de elegibilidade são apresentados em linguagem humana.
4. A composição exibe todos os itens canônicos, vencimentos, valores e a
   aplicação de desconto, multa e juros retornados pelo backend.
5. Nenhum valor ou cronograma é recalculado no frontend.
6. Nenhum recebível é criado antes da ação final `Gerar cobranças`.
7. O hotfix não emite boleto Banese, não cria webhook e não altera banco,
   Edge Function, Turma 42, Adenize ou recebíveis existentes.

### Aceite para encerramento

- Contratos do wizard, parser e prévia aprovados.
- TypeScript, ESLint focado, teto de 500 linhas e build aprovados.
- Manifesto comparado com a `main` remota e publicado atomicamente por MCP
  GitHub.
- Preview, workflows do PR e produção Vercel confirmados.
- Smoke visual autenticado registrado como pendente se o navegador continuar
  indisponível.
