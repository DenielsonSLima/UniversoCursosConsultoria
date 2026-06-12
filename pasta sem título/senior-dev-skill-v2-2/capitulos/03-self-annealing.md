# Capítulo 3 — Self-Annealing: O Sistema que Aprende

**Duração:** 15 min | **Nível:** Fundamental | **Pré-requisito:** Cap. 1, 2

> Self-Annealing (têmpera) é o processo pelo qual o aço se torna mais forte
> através do calor e resfriamento controlado. Um time de engenharia funciona igual:
> cada falha, quando tratada corretamente, fortalece o sistema.

---

## O Problema que Self-Annealing Resolve

Sem um processo de aprendizado sistemático:
- O mesmo bug aparece em lugares diferentes do código
- Cada dev toma decisões diferentes para o mesmo problema
- O conhecimento fica na cabeça de pessoas, não no sistema
- Um LLM novo no projeto repete os mesmos erros do passado

Com Self-Annealing:
- Um bug vira uma regra que nunca permite aquele bug novamente
- O conhecimento fica nas diretivas, acessível a qualquer agente
- O sistema fica mais forte a cada iteração

---

## O Ciclo de Self-Annealing

```
┌─────────────────────────────────────┐
│    SISTEMA EM OPERAÇÃO              │
│    (funcionando conforme o padrão)  │
└──────────────────┬──────────────────┘
                   │
        Algo inesperado acontece
                   ↓
┌─────────────────────────────────────┐
│  1️⃣  DIAGNÓSTICO                   │
│  O que quebrou?                     │
│  Por que quebrou?                   │
│  Era previsível?                    │
│  Qual regra faltava?                │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│  2️⃣  CORREÇÃO                      │
│  Corrige o bug                      │
│  Adiciona teste para ele            │
│  Verifica se há outros iguais       │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│  3️⃣  DOCUMENTAÇÃO DA DIRETIVA      │
│  Atualiza o capítulo relevante      │
│  Adiciona ao checklist se crítico   │
│  Notifica o time / outros agentes   │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│    SISTEMA MAIS FORTE               │
│    Próxima vez: evitado por design  │
└─────────────────────────────────────┘
```

---

## Os 3 Princípios Operacionais

### Princípio 1: Verifique Antes de Criar

Antes de escrever qualquer função, componente ou endpoint:

```
Preciso de X
    ↓
X já existe em algum service/util/componente?
    ├── SIM → Reutilize ou adapte
    └── NÃO → Crie, documente, torne reutilizável
```

O código DRY começa aqui. Não na refatoração — na intenção.

### Princípio 2: Diagnostique Antes de Corrigir

Quando algo falha, a resposta certa NÃO é "vou jogar código até funcionar".

```markdown
# Template de Diagnóstico

## O que aconteceu
Saldo ficou negativo após dois usuários criarem lançamentos simultâneos.

## Por que aconteceu
A lógica de saldo estava no frontend: cada um leu o mesmo saldo,
calculou e sobrescreveu o valor do outro.

## Causa raiz
Violação da Regra #5: lógica financeira crítica deve estar no banco.

## Correção
Mover cálculo de saldo para RPC com UPDATE atômico no PostgreSQL.

## Diretiva atualizada
Cap. 13 (financeiro) — adicionada seção sobre concorrência financeira.

## Teste adicionado
test: dois usuários simultâneos não criam inconsistência de saldo
```

### Princípio 3: Atualize as Diretivas — Sempre

A diretiva é inútil se não reflete a realidade atual do sistema.

**Quando atualizar:**
- Bug em produção que revelou regra faltante
- Melhoria de padrão identificada em code review
- Nova tecnologia ou abordagem adotada pelo time
- Edge case descoberto em QA

**Como atualizar:**
1. Identifique o capítulo relevante
2. Adicione ou modifique a regra com justificativa
3. Adicione ao checklist do Cap. 15 se for crítico
4. Abra PR com a mudança — documentação tem revisão como código

---

## Protocolo para Agentes de IA

Quando um agente de IA gera código que falha em code review ou em testes,
o agente deve:

```markdown
## Self-Annealing Protocol (IA)

1. IDENTIFICAR a regra violada
   "Gerei um componente com useEffect fazendo fetch direto.
    Violação: Regra #1 — componentes não fazem chamadas de API."

2. CORRIGIR imediatamente sem re-explicação desnecessária
   [código corrigido]

3. CONFIRMAR a regra internalizada
   "Entendi. Para esta task e todas as futuras: componentes
    recebem dados via props ou hooks. Nunca fetch direto."

4. SE FOR UM PADRÃO NOVO — sinalizar para documentação
   "⚠️ Sugestão: este edge case não está documentado no Cap. X.
    Recomendo adicionar: [descrição da regra]"
```

---

## Como Criar uma Nova Regra

Não qualquer preferência pessoal vira regra. O processo é:

```
1. Identificar problema recorrente
   (apareceu 2+ vezes? candidate a regra)

2. Formular como regra testável
   "Toda tabela de dados de cliente deve ter organization_id"
   → Pode ser verificado com SQL: SELECT tablename FROM pg_tables ...

3. Documentar com justificativa
   → Por que essa regra existe?
   → Que problema ela previne?
   → Exemplo de código certo e errado

4. Revisar com pelo menos 1 dev sênior

5. Adicionar ao capítulo relevante + checklist se crítica

6. Comunicar ao time
```

---

## Perguntas de Revisão

1. Um bug aparece em produção pela 2ª vez. O que isso indica sobre o processo?
   → A primeira ocorrência não foi usada para atualizar a diretiva. Erro de Self-Annealing.

2. Você percebe que um agente de IA continua gerando código com o mesmo anti-padrão.
   O que fazer?
   → Atualizar o SKILL.md / capítulo relevante com a regra explícita + exemplo negativo.

3. Um dev propõe uma nova "regra" de preferência pessoal (ex: "sempre use arrow functions").
   Deve entrar no Skill?
   → Só se houver problema concreto que a regra resolve e consenso do time sênior.

4. Qual a diferença entre um bug e uma oportunidade de Self-Annealing?
   → Todo bug que atualiza a diretiva é Self-Annealing. Bug que não atualiza é desperdício.
