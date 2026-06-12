# 📋 SUMÁRIO — Padrões de Engenharia Sênior v2.0

> Índice navegável completo. Use Ctrl+F para buscar o que precisa.

---

## 🗂️ Arquivos Raiz

| Arquivo | Para quê | Tempo |
|---|---|---|
| **SKILL.md** | Ponto de entrada para LLMs — 10 Regras de Ouro + protocolo por agente | 3 min |
| **COMECE-AQUI.md** | Onboarding: trilhas por perfil e objetivo | 5 min |
| **00-RESUMO.md** | 4 pilares, fluxo de dados, anti-padrões, estrutura de pastas | 10 min |
| **GLOSSARIO.md** | Vocabulário unificado — todo termo tem uma definição | 5 min |
| **FAQ.md** | 25 perguntas mais frequentes com resposta direta | 10 min |
| **AMBIENTE.md** | Como configurar e rodar o projeto do zero | 10 min |
| **EXCECAO.md** | Template e registro de exceções aprovadas às regras | 3 min |
| **CHANGELOG.md** | Histórico de versões — o que mudou e quando | 3 min |

---

## 📚 Capítulos — Bloco 1: Modelo Mental e Fundamentos

### Cap 1 — O Modelo Mental: Arquitetura de 3 Camadas
O mapa que todo agente, humano ou IA, lê primeiro.
- Analogia do restaurante (Diretiva / Orquestração / Execução)
- A regra de dependência entre camadas
- Diagrama de fluxo completo
- Por que funciona para multi-empresa

### Cap 2 — Diretivas e Documentação: HLD, BRD, CRD, IDL
Documentar antes de programar.
- HLD: mapa do sistema
- BRD: regras de negócio testáveis
- CRD: contratos de API (input/output/erros)
- IDL: convenções de código

### Cap 3 — Self-Annealing: O Sistema que Aprende
Todo bug fortalece o sistema se tratado corretamente.
- Ciclo: diagnóstico → correção → documentação
- Protocolo específico para agentes de IA
- Como criar e validar novas regras

### Cap 4 — Princípios Universais de Qualidade
Valem para React, SQL, Python — qualquer código.
- SRP, DRY, Cache com intenção, Ciclo de vida de recursos
- Debounce, Invalidação cirúrgica, Observabilidade
- Testabilidade por design, Consistência, Documentação como código

---

## 📚 Capítulos — Bloco 2: Frontend

### Cap 5 — Frontend e Componentização
Como organizar React de forma que seja difícil violar o padrão por acidente.
- 3 camadas do frontend: Página / Componente / UI
- Regra #1: componentes nunca fazem chamadas de API
- Hooks como bridge entre UI e dados
- TanStack Query + Zustand — quando usar cada um

---

## 📚 Capítulos — Bloco 3: Backend e Segurança

### Cap 6 — Camada de Serviço e Segurança
Edge Functions como única camada com acesso administrativo.
- Regra #2: service_role nunca no frontend
- Validação obrigatória com Zod
- Autenticação vs Autorização
- Códigos HTTP corretos e estrutura de resposta de erro

### Cap 7 — Banco de Dados: A Fonte da Verdade
PostgreSQL como fonte da verdade e motor de lógica crítica.
- RPCs atômicas — quando e como usar
- SECURITY DEFINER — uso seguro
- Views para leitura otimizada
- Migrações versionadas — nunca SQL manual em produção

### Cap 8 — Multitenancy e Row Level Security
Como uma empresa nunca vê dados de outra.
- Regra #3: organization_id em toda tabela
- Regra #4: RLS sempre habilitada
- Função auxiliar `is_member_of()`
- Teste de isolamento — execute antes de todo PR

---

## 📚 Capítulos — Bloco 4: Operação em Tempo Real

### Cap 9 — Realtime e WebSocket
Quando usar (e principalmente quando NÃO usar) Realtime.
- Critério de decisão: quando a UX exige?
- Subscription com cleanup obrigatório
- Integração com TanStack Query
- Resiliência e reconexão automática

---

## 📚 Capítulos — Bloco 5: Qualidade e Produção

### Cap 10 — Testes Automatizados
A pirâmide de testes aplicada ao stack.
- Unitários, integração, SQL/pgTAP
- CI/CD com GitHub Actions

### Cap 11 — Tratamento de Erros e Resiliência
Sistemas que falham graciosamente são confiáveis.
- Error Boundary no React
- Erros estruturados nas Edge Functions
- Retry inteligente: nunca em 4xx

### Cap 12 — Performance e Otimização
Performance em sistemas com muitos usuários simultâneos.
- Regra #7: paginação sempre
- EXPLAIN ANALYZE para diagnóstico
- Cache inteligente por tipo de dado

---

## 📚 Capítulos — Bloco 6: Domínios Específicos

### Cap 13 — Módulo Financeiro
Cada centavo rastreável, atômico e imutável.
- Separação: comprometimentos / movimentos / posição
- RPC de pagamento atômica com `SELECT FOR UPDATE`
- Estorno — o único jeito correto de "desfazer"

### Cap 14 — TypeScript e Padrões de Código
Tipagem rigorosa elimina uma classe inteira de bugs.
- `strict: true` sem exceções
- Proibido: `any`, cast forçado, `@ts-ignore`
- Padrão de Service como objeto

---

## 📚 Capítulos — Bloco 7: Times e Agentes

### Cap 15 — Checklist Final
60+ itens verificáveis antes de qualquer PR.
- 10 blocos temáticos
- As 5 perguntas antes do deploy
- Template de PR description

### Cap 16 — Comunicação entre Agentes de IA  ⭐ NOVO
Como múltiplos agentes trabalham juntos sem inconsistências.
- 3 tipos de agente: Executor, Revisor, Orquestrador
- Protocolo de Handoff entre agentes
- Protocolo de conflito
- Formato padrão de entrega de resultado
- Regras absolutas para agentes de IA

### Cap 17 — CI/CD e Automação de Padrões  ⭐ NOVO
O checklist do Cap. 15 rodando automaticamente no pipeline.
- Pipeline GitHub Actions completo (5 jobs)
- Verificação automática: service_role, RLS, TypeScript, testes
- Regras de merge e proteção de branches
- CODEOWNERS por área crítica

---

## 🧩 Materiais de Referência

### modulo-exemplo/
Módulo de clientes 100% no padrão. Copie como ponto de partida para qualquer módulo novo.

| Arquivo | O que demonstra |
|---|---|
| `clientes.types.ts` | Tipos de domínio, input/output separados, sem `any` |
| `clientes.service.ts` | Service como objeto, paginação, escrita via Edge Function |
| `clientes.hooks.ts` | TanStack Query, query keys tipadas, invalidação cirúrgica |
| `clientes.page.tsx` | Página fina: loading / error / empty / data |
| `components/ClienteCard.tsx` | Componente puro — dados via props, zero chamada de API |
| `components/ClienteList.tsx` | Lista com paginação e callbacks |
| `components/ClienteFormAdd.tsx` | Formulário com validação local — sem chamar service diretamente |

### docs/adr/
Decisões arquiteturais documentadas com contexto, opções e consequências.

| ADR | Decisão |
|---|---|
| ADR-001 | Por que Supabase em vez de Firebase |
| ADR-002 | Por que TanStack Query + Zustand em vez de Redux |
| ADR-003 | Por que multitenancy via RLS em vez de banco por empresa |

---

## 📊 Estatísticas da v2.0

| Métrica | Valor |
|---|---|
| Capítulos técnicos | 17 |
| Arquivos raiz (navegação + meta) | 9 |
| Módulo de referência (arquivos) | 7 |
| ADRs documentados | 3 + README |
| Regras de Ouro | 10 |
| Itens no checklist final | 60+ |
| Perguntas de revisão (total) | 70+ |
| **Total de arquivos** | **37** |

---

*v2.0 — Fusão da v1 (cobertura técnica completa) + skill externo (self-annealing + modelo mental)
+ novos capítulos críticos (comunicação entre agentes + automação CI/CD).*
*Aprovado pelo grupo de desenvolvedores sênior.*
