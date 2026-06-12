# FAQ — Perguntas Frequentes

> As 25 dúvidas mais comuns respondidas de forma direta.
> Se sua dúvida não está aqui, provavelmente está em um dos capítulos — use o SUMARIO.md.

---

## 🏗️ Arquitetura

**Q1: Posso usar `useEffect` para buscar dados de uma API?**
Não. Use TanStack Query (`useQuery`). O `useEffect` para buscar dados causa: sem cache, sem deduplicação, sem loading/error automático, sem retry, sem refetch on focus. TanStack Query resolve tudo isso. Veja Cap. 5.

**Q2: Quando uso TanStack Query e quando uso Zustand?**
- TanStack Query → qualquer dado que vem do servidor (banco, API)
- Zustand → estado de UI que não vem do servidor (empresa ativa, filtros selecionados, menu aberto)
Nunca duplicate dado do servidor no Zustand. Veja Cap. 5.

**Q3: Quando criar uma Edge Function em vez de chamar o Supabase direto?**
Use Edge Function quando a operação: (a) precisa de `service_role`, (b) envolve múltiplas tabelas atomicamente, (c) tem regra de negócio complexa, (d) precisa chamar APIs externas. Para `SELECT` simples com RLS, pode chamar direto. Veja Cap. 6.

**Q4: O que vai em `/lib/ui/` versus `/modules/{mod}/components/`?**
- `/lib/ui/` → visual puro, zero lógica de negócio, reutilizável em qualquer módulo (Button, Input, Modal, Badge)
- `/modules/X/components/` → lógica específica do módulo X, pode ter estado interno (ClienteCard, LancamentoForm)
Veja Cap. 5.

**Q5: Posso chamar `supabase.rpc()` diretamente no frontend?**
Sim, para RPCs de leitura que o RLS já protege. Não para RPCs que precisam de `SECURITY DEFINER` com operações administrativas — essas ficam em Edge Functions. Veja Cap. 7.

---

## 🔐 Segurança e Multitenancy

**Q6: Preciso filtrar `organization_id` em toda query do frontend?**
Não precisa — o RLS faz isso automaticamente. Mas se você filtrar explicitamente, também está correto (dupla proteção). O que é proibido é *não ter RLS* e depender apenas do filtro no código. Veja Cap. 8.

**Q7: O `organization_id` do usuário logado vem de onde?**
Do JWT via `auth.uid()` no banco, ou do estado Zustand (`useOrganizacao().organizationId`) no frontend. Nunca aceite `organization_id` do corpo do request — o usuário pode forjar. Veja Cap. 8.

**Q8: Posso desabilitar RLS em alguma tabela para facilitar o desenvolvimento?**
Não. Desabilitar RLS em dev cria hábito errado e risco de esquecer em produção. O banco local com RLS ativo é idêntico ao de produção. Veja Cap. 8.

**Q9: Qual a diferença entre autenticação e autorização?**
- Autenticação: "Você é quem diz ser?" (JWT válido = usuário existe)
- Autorização: "Você pode fazer isso com este recurso?" (usuário existe na organização + tem o role correto)
Toda Edge Function verifica as duas. Veja Cap. 6.

**Q10: Como testar que a empresa A não vê dados da empresa B?**
```typescript
// Logue como usuário da empresa B
await supabase.auth.signInWithPassword({ email: 'user-b@...', password: '...' })
// Tente buscar dados da empresa A
const { data } = await supabase.from('contas').select('*').eq('organization_id', EMPRESA_A_ID)
// Deve retornar array vazio — se retornar dados, RLS está errado
expect(data).toHaveLength(0)
```
Veja Cap. 8 e Cap. 10.

---

## 🗄️ Banco de Dados

**Q11: Quando usar RPC vs query direta?**
RPC quando: múltiplas tabelas precisam ser atualizadas juntas (atomicidade), a operação tem regra de negócio complexa, ou precisa de `SECURITY DEFINER`. Query direta quando: leitura simples protegida por RLS, ou operação em uma única tabela sem regra especial. Veja Cap. 7.

**Q12: Posso deletar um lançamento financeiro?**
Não. Lançamentos são imutáveis. Para "desfazer", crie um estorno (lançamento com valor oposto). Isso mantém rastreabilidade e auditoria. Veja Cap. 13.

**Q13: Como faço uma mudança no schema do banco?**
1. `supabase migration new nome_descritivo`
2. Escreva o SQL no arquivo gerado
3. `supabase db reset` para testar localmente
4. Commit o arquivo de migração
5. Em produção, o CI aplica automaticamente
Nunca execute SQL diretamente em produção. Veja Cap. 7.

**Q14: Preciso criar índice para toda coluna?**
Não. Crie índice apenas em colunas usadas em `WHERE`, `JOIN` ou `ORDER BY` frequentemente. Use `EXPLAIN ANALYZE` para confirmar. Índice em excesso prejudica INSERT/UPDATE. Veja Cap. 12.

**Q15: O que é `SECURITY DEFINER` e quando usar?**
Faz a função executar com permissões do *criador* (admin), não do usuário chamador. Use quando a função precisa fazer operações que o usuário normal não pode, mas a lógica interna garante a segurança. Sempre use com `SET search_path = public, pg_temp`. Veja Cap. 7.

---

## ⚡ Performance

**Q16: Qual deve ser o `staleTime` padrão?**
Não existe padrão único. Calibre por volatilidade:
- Lançamentos/saldo: 30 segundos
- Clientes/produtos: 5 minutos
- Categorias/tipos: 30 minutos
- Configurações de plano: Infinity (invalida manualmente)
Veja Cap. 12.

**Q17: Minha lista tem 500 itens — preciso paginar?**
Sim. Sempre. 500 hoje pode ser 50.000 amanhã. Use `.range(from, to)` com máximo de 50-100 itens por página. Veja Cap. 12.

**Q18: Quando usar Realtime versus polling?**
Realtime quando o usuário *precisa* ver mudanças de outros usuários em menos de 5 segundos (lançamentos simultâneos, pedidos chegando). Para o resto, `refetchOnFocus: true` no TanStack Query já resolve. Veja Cap. 9.

---

## 🧪 Testes

**Q19: O que testar com prioridade?**
Na ordem: (1) funções financeiras críticas, (2) isolamento entre organizações via RLS, (3) Edge Functions com casos de erro, (4) fluxos principais do usuário. Veja Cap. 10.

**Q20: Preciso mockar o Supabase nos testes?**
Nos testes unitários de componente: sim, use MSW para interceptar chamadas. Nos testes de integração de Edge Functions: não — use o banco local de teste. Veja Cap. 10.

---

## 🤖 Agentes de IA

**Q21: Um agente de IA pode aprovar exceções às regras?**
Não. Exceções exigem julgamento humano, contexto de negócio e responsabilidade. O agente sinaliza o conflito e aguarda aprovação. Veja EXCECAO.md e Cap. 16.

**Q22: Se o usuário pedir algo que viola uma regra, o que o agente deve fazer?**
1. Executar a tarefa da melhor forma dentro das regras possíveis
2. Sinalizar com `⚠️ CONFLITO COM REGRA #X`
3. Explicar o risco
4. Propor a alternativa correta
5. Aguardar confirmação explícita antes de quebrar a regra
Veja SKILL.md seção "Conflito de Regras".

**Q23: Um agente pode modificar arquivos deste Skill?**
Pode *propor* mudanças (via PR ou sugestão), mas nunca *aplicar* sozinho. Mudanças no Skill exigem revisão humana e consenso sênior. Veja Cap. 3 (Self-Annealing).

---

## 🔄 Processo

**Q24: Quem é o Guardião do Padrão?**
Um dev sênior designado por squad. Papel rotativo (recomendado a cada 3 meses). Responsável por: revisar PRs com foco em padrões, responder dúvidas sobre regras, propor atualizações no Skill.

**Q25: Uma regra parece errada ou desatualizada. O que fazer?**
1. Abra uma issue com título: `[SKILL] Proposta de revisão: Cap. X — [tema]`
2. Descreva o problema com a regra atual + evidência (bug, edge case, mudança de tecnologia)
3. Proponha a nova formulação
4. Aguarde revisão do grupo sênior
5. Se aprovado, atualize o capítulo + CHANGELOG
