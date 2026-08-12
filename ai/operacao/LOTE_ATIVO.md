# Lote ativo

Estado: `PUBLICACAO_EM_ANDAMENTO`

## Lote: 2026-08-11-financeiro-operacional-4-2-0-beta-2

- Estado: PUBLICACAO_EM_ANDAMENTO.
- Objetivo: publicar a versão `4.2.0-beta.2` com plano financeiro único não técnico, operações financeiras auditáveis, posições do Caixa, ciclo de empréstimos e relatórios financeiros separados.
- Escopo incluído: plano único para cursos livres/especializações; Contas a Pagar, recibo vetorial, edição/cancelamento/estorno; Caixa, patrimônio e empréstimos; relatório financeiro; Termos Banese/EAD; compositores e contratos afetados; migrations, versionamento, testes e registro operacional.
- Fora de escopo: reprecificação ou alteração de títulos/documentos históricos; emissão de cobrança real; caches e artefatos de build.
- Regras/RPC/segurança aplicáveis: GitHub e Supabase exclusivamente por MCP; cálculos financeiros no backend; RLS/RPC com menor privilégio e `search_path` vazio; PDF continua vetorial e canônico.
- Critérios de aceite: versão/changelog consistentes; histórico de migrations reconciliado sem reaplicação; contratos de Caixa, financeiro, documentos e Edge Functions aprovados; TypeScript e build aprovados; manifesto explícito; CI/Preview do último commit da PR e promoção para `main` confirmados.
- Validação já concluída: `test:caixa-report` 42/42; contratos financeiros/patrimônio/relatórios/Gestão 25/25; Contrato do Aluno 50/50; Contas a Pagar 4/4; migrations/contratos Supabase focados 44/44; Edge Functions Banese/EAD 32/32; replay focal de plano único/relatórios/hardening 20/20; `npm run lint`, `tsc --noEmit`, `npm run build` e `git diff --check` aprovados. A CI do ajuste corretivo segue neste fechamento.
- Banco: cinco fontes foram alinhadas aos IDs já aplicados no remoto; cinco já coincidiam com o histórico. As migrations novas foram aplicadas por MCP Supabase com os IDs remotos `20260812005933` (plano único), `20260812010242` (relatórios), `20260812010257` (endurecimento das RPCs legadas) e `20260812010814` (correção do alias de conta no relatório). As fontes locais usam esses IDs. A policy de Realtime preserva `outros-creditos`; as RPCs legadas ficam com `search_path` vazio e `EXECUTE` somente para `service_role`.
- Smoke remoto: a chamada `EXTRATO_CONTA` do relatório foi executada com `service_role` e rollback, retornando o payload canônico; não criou dados. A cobertura autenticada de criação do plano único permanece pendente para não fabricar turma, matrícula ou cobrança em Produção.
- Publicação em curso: PR [#66](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/66) no branch `release/4.2.0-beta.2-financeiro-operacional`; o commit corretivo de fonte, testes e rastreabilidade será incluído antes da CI/Preview final e do merge autorizado para `main`.
- Responsável pela consolidação: Codex, com revisão independente de validação, worktree e migrations.
- Pendências ou riscos: o primeiro corpo da RPC de relatórios tinha alias incorreto (`conta.ativa`) e recebeu a migration corretiva `20260812010814`, validada por smoke real; a CI/Preview do commit corretivo e a confirmação da implantação Vercel de Produção ainda estão pendentes. Node local `20.19.5` difere do `24.x` declarado pelo projeto.
