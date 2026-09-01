# Lote ativo

Estado: `PUBLICAÇÃO CONCLUÍDA — PR #110 MERGEADO`

## Lote: 2026-09-01-ciclos-financeiros-manuais-tecnico

- Pedido: substituir a geração automática do financeiro dos cursos técnicos por
  confirmação e geração manual de, no máximo, dois ciclos por aluno.
- Autorização: ajustes locais, aplicação das migrations do lote no Supabase e
  atualização do GitHub autorizadas explicitamente pelo usuário em 01/09/2026.
- Risco: crítico, por envolver criação de recebíveis, importação financeira,
  autorização, banco e publicação.
- Registro:
  `ai/operacao/registros/alteracoes/2026-09-01-ciclos-financeiros-manuais-tecnico.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-01-ciclos-financeiros-manuais-tecnico.md`

### Contrato do lote

1. O fluxo vale somente para cursos técnicos e possui no máximo dois ciclos.
2. Adicionar aluno confirma e salva a configuração, sem criar recebível e sem
   emitir boleto automaticamente.
3. Turma nova começa sem ciclo; importada pode começar com o primeiro ciclo no
   histórico ou com os dois ciclos concluídos.
4. Cada matrícula preserva seu próprio estágio, permitindo proteger um aluno
   já concluído dentro de turma importada ainda elegível ao segundo ciclo.
5. A aba Financeiro gera cada ciclo somente após prévia e confirmação humana.
6. O segundo ciclo exige a primeira data individual do aluno; os vencimentos
   posteriores derivam dessa data.
7. Valores, quantidade de parcelas, desconto, multa e juros vêm da configuração
   efetiva da turma e do aluno e são congelados no recebível.
8. A geração cria somente recebíveis locais. Emissão Banese permanece uma ação
   posterior, explícita e separada; este lote não cria webhook.
9. A Turma 42 inicia com o primeiro ciclo histórico e recebíveis de segundo
   ciclo já existentes ficam protegidos contra duplicação sem depender de PII.
10. Alterações paralelas e migrations fora do manifesto explícito permanecem
    fora da aplicação e da publicação.

### Aceite para encerramento

- Fluxos nova, importada com um ciclo e importada concluída cobertos por testes.
- Nenhum caminho automático cria recebíveis para turma técnica manual.
- Ciclo 2 rejeita data ausente e não oferece data herdada da turma.
- Prévia exibe composição, valores, vencimentos e termos financeiros completos.
- RBAC, idempotência, RLS, teto de 500 linhas, TypeScript, lint e build aprovados.
- Migrations aplicadas e validadas via MCP Supabase.
- Manifesto atômico publicado via MCP GitHub e verificado no PR.
- PR #110 integrado por squash no commit `48a5c0d`, com os dois workflows do
  PR e os deployments Preview/produção da Vercel aprovados.
