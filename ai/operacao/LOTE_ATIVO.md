# Lote ativo

Estado: `PRONTO_PARA_PUBLICACAO`

## Lote: 2026-08-11-financeiro-operacional-4-2-0-beta-2

- Estado: PRONTO_PARA_PUBLICACAO.
- Objetivo: publicar a versão `4.2.0-beta.2` com plano financeiro único não técnico, operações financeiras auditáveis, posições do Caixa, ciclo de empréstimos e relatórios financeiros separados.
- Escopo incluído: plano único para cursos livres/especializações; Contas a Pagar, recibo vetorial, edição/cancelamento/estorno; Caixa, patrimônio e empréstimos; relatório financeiro; Termos Banese/EAD; compositores e contratos afetados; migrations, versionamento, testes e registro operacional.
- Fora de escopo: reprecificação ou alteração de títulos/documentos históricos; emissão de cobrança real; merge em `main`, Produção, caches e artefatos de build.
- Regras/RPC/segurança aplicáveis: GitHub e Supabase exclusivamente por MCP; cálculos financeiros no backend; RLS/RPC com menor privilégio e `search_path` vazio; PDF continua vetorial e canônico.
- Critérios de aceite: versão/changelog consistentes; histórico de migrations reconciliado sem reaplicação; contratos de Caixa, financeiro, documentos e Edge Functions aprovados; TypeScript e build aprovados; commit atômico por manifesto explícito e PR/Preview pendentes de confirmação.
- Validação final: `test:caixa-report` 42/42; contratos financeiros/patrimônio/relatórios/gestão 25/25; Contrato do Aluno 50/50; Contas a Pagar 4/4; migrations/contratos Supabase focados 44/44; Edge Functions Banese/EAD 32/32; `tsc --noEmit`, `npm run build` e `git diff --check` aprovados.
- Banco: cinco fontes foram alinhadas aos IDs já aplicados no remoto; cinco migrations já coincidiam com o histórico remoto; três novas fontes permanecem **versionadas e não aplicadas**: plano único, relatórios e endurecimento de duas RPCs legadas de empréstimo. A policy de Realtime dos relatórios preserva `outros-creditos`.
- Publicação prevista: branch e PR em rascunho pelo MCP GitHub; aplicar as três migrations e executar smoke autenticado somente após revisão da PR e autorização explícita de Produção.
- Responsável pela consolidação: Codex, com revisão independente de validação, worktree e migrations.
- Pendências ou riscos: a Preview da versão anterior falhou por limite de builds do Vercel; a nova Preview e o smoke autenticado ainda dependem do provedor/sessão. Node local `20.19.5` difere do `24.x` declarado pelo projeto.
