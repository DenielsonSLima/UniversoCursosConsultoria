# Capítulo 15 — Checklist Final do Desenvolvedor Sênior

**Use antes de todo PR. Sem exceção.**

> Se um item for "não" ou "não sei": PARE e corrija antes de prosseguir.
> Este checklist existe para que você durma tranquilo após cada deploy.

---

## ✅ BLOCO 1 — Estrutura e Organização

```
[ ] O código está na pasta correta para sua responsabilidade?
    Página em *.page.tsx | Componente em /components | UI em /lib/ui/

[ ] Existe .service.ts, .hooks.ts e .types.ts separados para o módulo?

[ ] Nenhum arquivo tem mais de 300 linhas?
    Se tiver: divida em arquivos menores com responsabilidades únicas.

[ ] Imports usam path alias @/ em vez de ../../..?

[ ] Sem código morto (funções, variáveis não usadas)?
    tsc --noEmit deve passar com zero warnings.
```

---

## ✅ BLOCO 2 — Segurança  ← Regras #2, #6

```
[ ] service_role key está AUSENTE do frontend?
    grep -r "SERVICE_ROLE" src/ → deve dar 0 resultados
    grep -r "VITE_.*SERVICE" src/ → deve dar 0 resultados

[ ] Toda Edge Function verifica JWT antes de qualquer operação?

[ ] Toda Edge Function verifica AUTORIZAÇÃO (não só autenticação)?
    Usuário autenticado ≠ usuário com permissão para ESTE recurso.

[ ] Dados de entrada validados com Zod em toda Edge Function?

[ ] Edge Functions nunca expõem stack traces ou mensagens internas?

[ ] Logs contêm contexto sem dados sensíveis (sem senha, sem token)?
```

---

## ✅ BLOCO 3 — Banco de Dados  ← Regras #3, #4, #5

```
[ ] RLS habilitado em TODAS as tabelas de dados de cliente?
    SQL: SELECT tablename FROM pg_tables
         WHERE schemaname = 'public' AND rowsecurity = false;
    → Deve retornar APENAS tabelas intencionalmente sem RLS.

[ ] Toda tabela de dados de cliente tem organization_id?

[ ] Políticas RLS cobrem SELECT, INSERT, UPDATE e DELETE?

[ ] Operações em múltiplas tabelas usam RPCs (não múltiplos updates separados)?

[ ] Funções SECURITY DEFINER têm SET search_path = public, pg_temp?

[ ] Toda mudança de schema está em arquivo de migração versionado?

[ ] Índices criados para as colunas mais usadas em WHERE e JOIN?
    EXPLAIN ANALYZE nas queries principais → sem Seq Scan em tabelas grandes.

[ ] Transações financeiras são imutáveis? (sem DELETE ou UPDATE direto)

[ ] Mecanismo de estorno implementado para corrigir lançamentos?
```

---

## ✅ BLOCO 4 — Frontend  ← Regras #1, #8

```
[ ] Nenhum componente faz chamadas diretas ao Supabase ou fetch()?
    grep -r "supabase\." src/**/*.tsx → apenas em *.service.ts e *.hooks.ts

[ ] Páginas são "finas" (≤ 100 linhas, apenas orquestração)?

[ ] Componentes de UI (/lib/ui/) sem imports de stores ou services?

[ ] Todos os campos de input têm fundo claro (#fff) e texto escuro (#111)?

[ ] Página exibe Spinner durante loading?

[ ] Página exibe mensagem amigável em caso de erro?

[ ] Página exibe estado vazio quando lista não tem dados?

[ ] Formulários têm validação no cliente E no servidor?

[ ] TanStack Query com staleTime adequado para o tipo de dado?
```

---

## ✅ BLOCO 5 — Multitenancy  ← Regras #3, #4, #9

```
[ ] Todo INSERT inclui organization_id correto (do servidor, não do input)?

[ ] Toda subscription Realtime tem filter: organization_id=eq.{id}?

[ ] Testado manualmente: empresa A não vê dados de empresa B?

[ ] Roles (admin/membro/visualizador) verificados além de membership?

[ ] Novos membros só entram via convite autenticado?
```

---

## ✅ BLOCO 6 — Performance  ← Regra #7

```
[ ] Toda query de lista tem paginação (.range())?

[ ] SELECT especifica apenas colunas necessárias (não SELECT *) em listas?

[ ] EXPLAIN ANALYZE rodado nas 3 queries mais frequentes desta feature?
    → Resultado deve ser Index Scan, não Seq Scan.

[ ] staleTime do TanStack Query configurado por tipo de dado?

[ ] Lazy loading aplicado em módulos pesados?
```

---

## ✅ BLOCO 7 — Testes e Qualidade

```
[ ] Funções utilitárias críticas têm testes unitários?

[ ] Fluxos principais do usuário têm testes de integração?

[ ] Edge Functions têm testes cobrindo caminho feliz E erros?

[ ] Existe teste verificando isolamento entre organizações?

[ ] CI/CD configurado para rodar testes no PR?

[ ] Cobertura de testes para lógica financeira > 80%?
```

---

## ✅ BLOCO 8 — Erros  ← Regra #8 e Resiliência

```
[ ] Error Boundary no nível raiz da aplicação?

[ ] Erros inesperados logados em serviço de monitoramento?

[ ] Mensagens de erro em linguagem humana (sem jargão técnico)?

[ ] Retry inteligente: não faz retry em erros 4xx?

[ ] Botão "Tentar novamente" em todas as telas de erro?

[ ] Reconexão do Realtime invalida cache para resync de dados?
```

---

## ✅ BLOCO 9 — TypeScript  ← Regra #10 (DRY)

```
[ ] Zero uso de `any` no código novo?
    tsc --noEmit --strict → zero erros.

[ ] Tipos de input e output definidos para todos os services?

[ ] Query keys do TanStack Query são constantes tipadas (não strings soltas)?

[ ] Sem cast forçado (as Type) sem verificação?
```

---

## ✅ BLOCO 10 — Self-Annealing

```
[ ] Se este PR corrige um bug: o bug foi documentado no capítulo relevante?

[ ] Se este PR introduz um padrão novo: ele foi adicionado ao skill?

[ ] Se uma regra foi quebrada por necessidade: justificativa documentada no PR?

[ ] O time foi notificado de qualquer mudança de padrão?
```

---

## 🎯 As 5 Perguntas Finais Antes do Deploy

```
1. "Se eu for um usuário mal-intencionado da empresa B,
    consigo ver dados da empresa A?"
    → Se sim: RLS ou organization_id faltando.

2. "Se o servidor cair no meio da operação mais crítica desta feature,
    o sistema fica inconsistente?"
    → Se sim: use RPC atômica no banco.

3. "Se dois usuários fizerem a mesma operação ao mesmo tempo,
    os dados ficam corretos?"
    → Se não: concorrência não tratada. SELECT FOR UPDATE.

4. "Se eu precisar depurar um erro em produção às 2h da manhã,
    tenho logs suficientes para entender o que aconteceu?"
    → Se não: adicione logging estruturado.

5. "Se um novo dev ou agente de IA pegar esta feature amanhã,
    ele entende o código sem precisar me perguntar nada?"
    → Se não: o código precisa de mais clareza ou documentação.
```

---

## 📋 Template de PR Description

```markdown
## O que esta PR faz
[Descrição clara da mudança]

## Tipo de mudança
- [ ] Nova feature
- [ ] Bugfix
- [ ] Refatoração
- [ ] Mudança de schema (migração incluída: SIM/NÃO)
- [ ] Atualização de padrão/documentação

## Referência às regras
- Regras seguidas: [ex: Regra #3 — organization_id adicionado]
- Regras com exceção aprovada: [nenhuma / descreva]

## Self-Annealing
- [ ] Bug corrigido documentado no capítulo relevante
- [ ] Novo padrão adicionado ao SKILL

## Checklist executado
- [ ] Bloco 1 (Estrutura) ✅
- [ ] Bloco 2 (Segurança) ✅
- [ ] Bloco 3 (Banco) ✅
- [ ] Bloco 4 (Frontend) ✅
- [ ] Bloco 5 (Multitenancy) ✅

## Como testar
1. [Passo 1]
2. [Passo 2]
3. [Resultado esperado]
```
