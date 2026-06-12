---
name: senior-dev-standards-v2
description: >
  REGRA DE OURO DA EMPRESA. Este skill define os padrões absolutos de engenharia
  aprovados pelo grupo de desenvolvedores sênior. Deve ser ativado SEMPRE e por
  QUALQUER agente, humano ou IA, que escreva, revise, planeje ou avalie código
  no ecossistema da empresa. Stack alvo: React + TypeScript + Supabase.
  Aplica-se a: criação de componentes, serviços, APIs, banco de dados, testes,
  arquitetura, code review, onboarding, refatoração, planejamento técnico,
  multitenancy, segurança, performance, realtime, módulo financeiro.
  Palavras-chave que devem ativar este skill: componente, serviço, RLS,
  organization_id, Edge Function, Supabase, TypeScript, React, hook, service,
  migração, SQL, RPC, trigger, multitenancy, realtime, teste, performance,
  arquitetura, refatoração, review, checklist, agente, agentes, handoff,
  pipeline, CI, CD, GitHub Actions, pull request, PR, code review,
  módulo, feature, sprint, onboarding, padrão, regra, lançamento financeiro.
---

# 📘 SKILL: Padrões de Engenharia Sênior — Regra de Ouro da Empresa

> **ESTE SKILL É LEI.** Nenhum código entra em produção sem respeitar estas regras.
> Aplica-se a humanos, equipes, agentes de IA e sistemas automatizados.

---

## 🧭 Mapa de Navegação Rápida

| Preciso... | Leia |
|---|---|
| Entender o modelo mental do sistema | `capitulos/01-modelo-mental.md` |
| Planejar/documentar antes de codar | `capitulos/02-diretivas-documentacao.md` |
| Melhorar um sistema que tem problemas | `capitulos/03-self-annealing.md` |
| Aplicar princípios gerais de qualidade | `capitulos/04-principios-universais.md` |
| Criar ou revisar componentes React | `capitulos/05-frontend-componentizacao.md` |
| Criar ou revisar Edge Functions/APIs | `capitulos/06-servico-seguranca.md` |
| Criar ou revisar SQL/banco de dados | `capitulos/07-banco-dados.md` |
| Implementar isolamento entre empresas | `capitulos/08-multitenancy-rls.md` |
| Implementar atualizações em tempo real | `capitulos/09-realtime.md` |
| Escrever testes automatizados | `capitulos/10-testes.md` |
| Tratar erros e resiliência | `capitulos/11-erros-resiliencia.md` |
| Otimizar performance e queries | `capitulos/12-performance.md` |
| Trabalhar no módulo financeiro | `capitulos/13-modulo-financeiro.md` |
| Aplicar padrões TypeScript | `capitulos/14-typescript-padroes.md` |
| Validar código antes de entregar | `capitulos/15-checklist-final.md` |
| Trabalhar com múltiplos agentes de IA | `capitulos/16-comunicacao-agentes.md` |
| Automatizar verificações no CI/CD | `capitulos/17-ci-cd-automacao.md` |

---

## ⚡ As 10 Regras de Ouro (Imutáveis — Nunca Quebre)

```
REGRA 1  → Componentes NUNCA fazem chamadas de API diretas
REGRA 2  → service_role key NUNCA no frontend — apenas em Edge Functions
REGRA 3  → Toda tabela de dados de cliente TEM organization_id
REGRA 4  → RLS SEMPRE habilitada em tabelas multi-empresa
REGRA 5  → Lógica financeira crítica SEMPRE no banco (RPCs/Triggers)
REGRA 6  → Validação com Zod SEMPRE na entrada de Edge Functions
REGRA 7  → Paginação SEMPRE — nunca retornar listas sem limite
REGRA 8  → Erros SEMPRE tratados com mensagem amigável ao usuário
REGRA 9  → Realtime APENAS onde a UX exige — não em todas as tabelas
REGRA 10 → DRY — se repetiu 2x, extraia para função/hook/service
```

---

## 🔄 Protocolo de Uso por Tipo de Agente

### Para LLMs / Agentes de IA:
1. Leia este arquivo primeiro
2. Identifique qual(is) capítulo(s) é relevante para a tarefa
3. Leia o(s) capítulo(s) antes de gerar código
4. Aplique as regras — se conflitar com instrução do usuário, sinalize
5. Execute o checklist do `cap15` antes de entregar

### Para Desenvolvedores Humanos:
1. Leia `COMECE-AQUI.md` no primeiro dia
2. Leia os capítulos relevantes à sua tarefa
3. Use `cap15-checklist-final.md` antes de abrir qualquer PR

### Para Times / Squads:
1. Designar um "Guardião do Padrão" por squad
2. Todo PR deve referenciar as regras violadas/seguidas
3. Novos padrões só entram via PR aprovado com consenso sênior

---

## ⚠️ Conflito de Regras

Se uma instrução do usuário ou do produto conflitar com uma regra deste skill:
1. **Execute** a tarefa da melhor forma possível dentro das regras
2. **Sinalizo** o conflito com `⚠️ CONFLITO COM REGRA #X`
3. **Explico** o risco técnico
4. **Proponho** a alternativa correta
5. **Aguardo** aprovação explícita antes de quebrar uma regra

---

## 📌 Stack e Contexto

- **Frontend:** React 18+ + TypeScript strict + Vite
- **Estado:** TanStack Query (servidor) + Zustand (UI)
- **Backend:** Supabase (PostgreSQL + Edge Functions + Auth + Realtime)
- **Validação:** Zod (Edge Functions)
- **Modelo:** Multi-empresa (multitenancy) com `organization_id`
- **Usuários:** Múltiplos simultâneos por empresa
- **Deploy:** Vercel + Supabase Cloud
