# 🚀 COMECE AQUI

> Seja você humano, agente de IA ou sistema automatizado:
> **leia este arquivo primeiro.** Leva 5 minutos e orienta tudo que vem depois.

---

## O que é este Skill?

Este é o **Livro de Regras de Ouro da empresa** — padrões definidos pelo grupo de
desenvolvedores sênior que **toda equipe deve seguir rigorosamente**: times humanos,
agentes de IA individuais, múltiplos agentes em paralelo, sistemas de CI/CD.

Não é tutorial. Não é sugestão. É a **constituição técnica do projeto**.

---

## Por onde começar — por perfil

### 👤 Dev humano — primeiro dia no projeto
```
1. AMBIENTE.md          → Configure o projeto localmente
2. GLOSSARIO.md         → Aprenda o vocabulário da empresa
3. Cap 1 (modelo mental)→ Entenda a arquitetura em 20 min
4. Cap 2 (diretivas)    → Aprenda a documentar antes de codar
5. modulo-exemplo/      → Veja o padrão aplicado em código real
```

### 🔍 Dev humano — fazendo code review
```
Cap 15 (checklist) → revise item por item
+ capítulo do tema revisado (ex: Cap 8 se envolve multitenancy)
```

### 🤖 Agente de IA — iniciando qualquer tarefa
```
1. SKILL.md             → Regras de Ouro + protocolo de conflito
2. Cap do tema da tarefa → Leia o capítulo relevante antes de gerar código
3. modulo-exemplo/      → Referência de padrão aplicado
4. Cap 15 (checklist)   → Execute mentalmente antes de entregar
5. Cap 16 (agentes)     → Protocolo de handoff e formato de resposta
```

### 🤖🤖 Múltiplos agentes de IA — trabalhando em paralelo
```
1. SKILL.md + Cap 16    → Protocolo de comunicação entre agentes
2. Cap do tema de cada agente
3. Cap 15               → Agente Revisor usa como base de verificação
```

### 🏗️ Tech lead — planejando nova feature
```
1. Cap 2 (HLD, BRD, CRD, IDL) → Documente antes de começar o sprint
2. docs/adr/                   → Consulte decisões arquiteturais já tomadas
3. Cap 8 se envolver dados de empresa
4. Cap 13 se envolver financeiro
```

### 🚀 DevOps / CI — configurando pipeline
```
Cap 17 (CI/CD) → Pipeline completo pronto para copiar
```

### 🔧 Dev — corrigindo bug em produção
```
Cap 3 (self-annealing) → Protocolo de diagnóstico e aprendizado
+ capítulo do componente com problema
```

---

## As 10 Regras de Ouro — Memorize

```
#1  Componentes NUNCA fazem chamadas de API diretas
#2  service_role key NUNCA no frontend
#3  Toda tabela de dados de cliente TEM organization_id
#4  RLS SEMPRE habilitada em tabelas multi-empresa
#5  Lógica financeira crítica SEMPRE no banco (RPCs/Triggers)
#6  Validação com Zod SEMPRE na entrada de Edge Functions
#7  Paginação SEMPRE — nunca retornar listas sem limite
#8  Erros SEMPRE tratados com mensagem amigável ao usuário
#9  Realtime APENAS onde a UX exige
#10 DRY — se repetiu 2x, extraia para função/hook/service
```

---

## Mapa Completo dos Arquivos

```
senior-dev-skill-v2/
│
├── SKILL.md               ← Ponto de entrada para LLMs (leia primeiro)
├── COMECE-AQUI.md         ← Este arquivo
├── SUMARIO.md             ← Índice navegável completo
├── 00-RESUMO.md           ← Visão executiva rápida
├── GLOSSARIO.md           ← Vocabulário unificado
├── FAQ.md                 ← 25 dúvidas mais comuns
├── AMBIENTE.md            ← Como rodar o projeto
├── EXCECAO.md             ← Registro de exceções às regras
├── CHANGELOG.md           ← Histórico de mudanças
│
├── capitulos/
│   ├── 01-modelo-mental.md              (Fundamento — leia primeiro)
│   ├── 02-diretivas-documentacao.md     (Documentar antes de codar)
│   ├── 03-self-annealing.md             (Sistema que aprende com falhas)
│   ├── 04-principios-universais.md      (SRP, DRY, Cache — tech-agnostic)
│   ├── 05-frontend-componentizacao.md   (React: Pages, Components, UI)
│   ├── 06-servico-seguranca.md          (Edge Functions + Zod + JWT)
│   ├── 07-banco-dados.md                (RPCs, migrations, triggers)
│   ├── 08-multitenancy-rls.md           (Isolamento por empresa)
│   ├── 09-realtime.md                   (WebSocket quando necessário)
│   ├── 10-testes.md                     (Unitários, integração, SQL)
│   ├── 11-erros-resiliencia.md          (Falhar graciosamente)
│   ├── 12-performance.md               (Índices, cache, paginação)
│   ├── 13-modulo-financeiro.md          (Ledger imutável, estorno)
│   ├── 14-typescript-padroes.md         (Strict, sem any, convenções)
│   ├── 15-checklist-final.md            ← USE ANTES DE TODO PR
│   ├── 16-comunicacao-agentes.md        (Protocolo multi-agente) ⭐
│   └── 17-ci-cd-automacao.md            (Pipeline automatizado) ⭐
│
├── modulo-exemplo/                 ← Copie para criar módulos novos
│   ├── README.md
│   ├── clientes.types.ts
│   ├── clientes.service.ts
│   ├── clientes.hooks.ts
│   ├── clientes.page.tsx
│   └── components/
│       ├── ClienteCard.tsx
│       ├── ClienteList.tsx
│       └── ClienteFormAdd.tsx
│
└── docs/
    └── adr/                        ← Por que as decisões foram tomadas
        ├── README.md
        ├── adr-001-supabase-vs-firebase.md
        ├── adr-002-tanstack-query-zustand.md
        └── adr-003-multitenancy-row-level.md
```

---

## Definição de "Pronto"

Uma feature está **pronta** quando todos estes itens são verdade:

- [ ] Passa em todos os 10 blocos do Cap. 15
- [ ] As 5 perguntas finais do Cap. 15 têm resposta satisfatória
- [ ] Revisada por pelo menos 1 dev sênior ou Agente Revisor
- [ ] CI passou (Cap. 17)
- [ ] RLS verificada se envolve dados de empresa (Cap. 8)
- [ ] Nenhum `any` no TypeScript (Cap. 14)
- [ ] Nenhuma query sem paginação (Cap. 12)

---

## Governança do Padrão

| Situação | O que fazer |
|---|---|
| Dúvida sobre uma regra | Consulte o FAQ.md primeiro |
| Precisa de exceção | Preencha EXCECAO.md → aguarde aprovação sênior |
| Regra parece errada | Abra issue com evidência + proposta de correção |
| Descobriu padrão novo | Self-Annealing (Cap. 3) → PR com update no capítulo |
| Conflito agente vs regra | Cap. 16 → sinalizar, não decidir sozinho |
| Mudança de arquitetura | docs/adr/ → registre a decisão antes de implementar |

> Agentes de IA nunca aprovam exceções. Humanos decidem, agentes executam.
