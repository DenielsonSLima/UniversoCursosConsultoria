# Lote ativo

Estado: `PUBLICADO_PRODUCAO_4_8_5`

## Lote: 2026-08-25-realtime-aluno-financeiro-canonico-4-8-4

- Pedido: revisar novamente Auth/RBAC, Financeiro, PDFs, TanStack Query e Realtime com três agentes, corrigir os findings, testar e publicar no GitHub e em Produção.
- Registro: `ai/operacao/registros/alteracoes/2026-08-25-realtime-aluno-financeiro-canonico-4-8-4.md`.
- Versão funcional publicada: `4.8.4`; fechamento operacional: `4.8.5`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-25-realtime-aluno-financeiro-canonico-4-8-4.md`; 18 arquivos.

### Contratos do lote

1. Uma identidade pode manter os quatro perfis, mas o login público oferece somente Aluno/Responsável e o institucional somente Gestor/Professor; a escolha aparece apenas quando a audiência possui mais de um acesso.
2. O Financeiro do Aluno apresenta `statusCode`, `receiptEligible` e `financialSummary` autoritativos, sem inferir atraso, pagamento, juros, multa ou elegibilidade pelo estado legado.
3. O hook global do Aluno é a única assinatura de `finance_realtime_events`; a página financeira preserva apenas a invalidação explícita após mutações confirmadas.
4. Matrícula e liberação acadêmica usam a outbox `portal_realtime_signals`, inclusive em DELETE, com audiência `ALUNO`, tópico exato, RLS pela identidade canônica e refetch TanStack com debounce, reconexão e cleanup.
5. A migration é incremental, mantém a assinatura/OID do autorizador e a policy dependente, não recria políticas e preserva grants mínimos.

### Critérios de aceite

1. Revisão cruzada dos três agentes termina sem finding P1/P2/P3 aberto.
2. Auth 48/48, Financeiro/Realtime 62/62 Node e TanStack 2/2 Deno permanecem verdes após os patches.
3. TypeScript, ESLint, teto de 500 linhas, controle de versão, contrato operacional e build de Produção são aprovados.
4. Supabase confirma ledger, constraints, OID/policy, triggers, RLS, publication, ACL, advisors e logs após a migration.
5. GitHub CI e Vercel Preview passam antes do merge; Produção responde nas três rotas públicas e expõe a versão 4.8.4.
6. Nenhum usuário, matrícula, título, pagamento ou mensagem artificial é criado para fabricar smoke positivo.

### Ordem de execução e publicação

1. Reunião técnica e revisão independente de Auth/RBAC, Financeiro/PDF e Realtime/Produção. `CONCLUIDO_SEM_P1_P2_P3`.
2. Corrigir status legado do card, assinatura financeira duplicada e DELETE acadêmico filtrado. `CONCLUIDO_LOCAL`.
3. Executar testes focados e revisão cruzada final. `CONCLUIDO_LOCAL`.
4. Aplicar a migration via MCP Supabase e validar contratos remotos. `CONCLUIDO_1_DE_1`.
5. Executar gates finais, publicar branch/PR via MCP GitHub e aguardar Preview. `CONCLUIDO_PR_95`.
6. Mesclar, validar Produção, fechar evidências e reindexar o RAG uma vez. `CONCLUIDO_PRODUCAO_4_8_4`.

### Evidências atuais

- Os três agentes encerraram a revisão cruzada sem finding P1, P2 ou P3 aberto; a assinatura duplicada encontrada durante a reunião foi removida antes do veredito final.
- Auth: `48/48`; Financeiro/Realtime: `62/62` Node; TanStack: `2/2` Deno; TypeScript e ESLint focado aprovados.
- Preflight remoto: ledger termina em `20260825043903 use_invoker_student_financial_receipt`; OID do autorizador `40832`, policy `40833`, RLS e publication preservados.
- Advisors antes da migration: segurança `470` (`49` INFO, `421` WARN); performance `237` (`217` INFO, `20` WARN), baseline preexistente.
- Migration aplicada sob o ledger `20260825204543 add_student_portal_realtime_audience`; OID `40832`, policy `40833`, triggers `40844`/`40845`, RLS, publication e ACL permaneceram íntegros.
- Advisors pós-DDL permaneceram exatamente no baseline; logs entre `20:40Z` e `20:48Z` tiveram zero `ERROR`, `FATAL` ou `PANIC` textual nas oito fontes retornadas.
- A outbox continuou vazia no pós-check, sem atividade acadêmica natural e sem fabricação de matrícula para produzir um sinal.

### Evidências de publicação

- A PR `#95` partiu da `main` `ce46436350c23dbc81ec4d474ae9469bf6803d56`; o head `dec565205f506cb2014aec64e452bbc523c198c5` alterou 17 dos 18 arquivos permitidos, pois `ALTERACOES.md` já era idêntico à base.
- Os workflows de PR `32898162163` e `32898162226`, o Vercel Preview `C3rvKrWkj95Tc58oN9nDCEdFg3sU` e todos os passos do gate obrigatório ficaram verdes.
- A PR foi mesclada por squash no commit `88b60e03390ea84daf7e814cec4393011b55510e`; a CI pós-merge `32898857333` e o Vercel Production `5waoYp9Z2nDaSUApSHGQc7frZAVp` concluíram com sucesso.
- `/`, `/login` e `/sistema/login` responderam `200`; `main-BkQp4ncF.js` confirmou `4.8.4`, e os chunks publicados confirmaram audiência Aluno, assinatura financeira única e seletor dos quatro perfis por audiência.
- Logs de `21:03Z` a `21:08Z` tiveram zero erro grave textual. A outbox permaneceu vazia por ausência de mutação acadêmica natural.
- O fechamento documental segue como patch estável `4.8.5`, sem alterar o contrato funcional da `4.8.4`.

### Limites

1. Somente os 18 arquivos do manifesto integram a publicação; alterações paralelas do workspace permanecem preservadas.
2. GitHub e Supabase remotos são operados exclusivamente pelos respectivos MCPs.
3. Smokes positivos dependentes de usuário multiperfil, matrícula removida ou título pago natural não serão fabricados em Produção.
4. A inspeção visual automatizada permanece condicionada à existência de navegador controlável e sessão real.
5. Configurações operacionais de WhatsApp não pertencem a este lote e não serão alteradas sem decisão de negócio explícita.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
