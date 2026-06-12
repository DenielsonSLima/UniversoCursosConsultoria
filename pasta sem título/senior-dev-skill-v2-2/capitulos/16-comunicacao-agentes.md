# Capítulo 16 — Comunicação entre Agentes de IA

**Duração:** 20 min | **Nível:** Avançado | **Pré-requisito:** Cap. 1, 2, 3

> Este capítulo existe porque equipes modernas usam múltiplos agentes de IA
> trabalhando em paralelo ou em sequência. Sem um protocolo de comunicação
> claro, os agentes geram código inconsistente entre si.

---

## O Problema

Imagine 3 agentes trabalhando no mesmo sistema:

```
Agente A (Frontend)   → Gera componente que chama supabase direto
Agente B (Backend)    → Cria Edge Function sem validação Zod
Agente C (Revisor)    → Aprova os dois porque "funciona"
```

Cada agente seguiu sua instrução individual — mas nenhum violou intencionalmente
o padrão. O problema foi a **ausência de protocolo compartilhado**.

Com este capítulo, cada agente sabe exatamente como se comportar, o que
comunicar e quando bloquear.

---

## Os 3 Tipos de Agente

### Tipo 1 — Agente Executor
Recebe uma tarefa específica e a executa dentro dos padrões.

**Responsabilidades:**
- Leu o SKILL.md antes de iniciar
- Leu o(s) capítulo(s) relevante(s)
- Gera código 100% no padrão
- Sinaliza conflito antes de quebrar regra
- Nunca aprova o próprio trabalho

**Exemplos:** agente de frontend, agente de banco, agente de teste

---

### Tipo 2 — Agente Revisor
Verifica se o código gerado por outros agentes (ou humanos) segue o padrão.

**Responsabilidades:**
- Usa Cap. 15 (checklist) como base de revisão
- Aponta violações com referência ao capítulo e regra
- Não reescreve o código — aponta e explica
- Não aprova código que viola regra sem exceção documentada

**Nunca faz:** aprovar código por pressão de prazo ou por "estar quase certo".

---

### Tipo 3 — Agente Orquestrador
Coordena o trabalho entre múltiplos agentes numa tarefa maior.

**Responsabilidades:**
- Define o escopo de cada sub-agente
- Garante que todos leram o SKILL.md
- Consolida os outputs e verifica consistência entre eles
- Detecta conflitos entre peças geradas por agentes diferentes

**Nunca faz:** delegar sem passar contexto suficiente (SKILL + capítulos relevantes).

---

## Protocolo de Handoff (Passagem de Trabalho)

Quando um agente passa trabalho para outro, o handoff deve conter:

```markdown
## HANDOFF — [nome da tarefa]

### Contexto
[Qual é o objetivo geral? Qual módulo? Qual feature?]

### O que já foi feito
[O que este agente gerou/decidiu]

### O que falta
[O que o próximo agente deve fazer]

### Arquivos relevantes
- [lista dos arquivos criados/modificados]

### Decisões tomadas
- [Decisão 1 e por que foi tomada]
- [Decisão 2 e por que foi tomada]

### Regras que se aplicam
- Cap. XX — [nome] (porque [motivo])
- Regra #X — [descrição]

### Restrições e alertas
- ⚠️ [Qualquer coisa que o próximo agente deve saber]
```

---

## Protocolo de Conflito entre Agentes

Quando dois agentes chegam a soluções incompatíveis:

```
Agente A gerou: componente com useEffect para fetch
Agente B revisou: violação da Regra #1

Protocolo:
1. Agente B sinaliza: "⚠️ CONFLITO COM REGRA #1 — Cap. 05"
2. Agente B descreve: o que está errado e como corrigir
3. Agente A corrige ou justifica a exceção
4. Se exceção: preenche EXCECAO.md e aguarda humano aprovar
5. Nenhum agente "vence" o argumento sozinho — humano decide exceções
```

**Regra de ouro:** Agente nunca aprova exceção. Humano aprova.

---

## Protocolo de Contexto Mínimo

Todo agente que inicia uma tarefa deve ter recebido:

```
✅ Conteúdo do SKILL.md
✅ Capítulo(s) relevante(s) para a tarefa
✅ Contexto do módulo (HLD, BRD ou descrição da feature)
✅ Arquivos existentes que serão modificados
✅ Resultado esperado (o que "pronto" significa)
```

Se algum desses itens estiver faltando, o agente deve **solicitar antes de
gerar código**, não tentar adivinhar.

```
# Exemplo de solicitação de contexto

"Antes de continuar, preciso de:
1. O BRD do módulo de pedidos (para entender as regras de negócio)
2. O schema atual da tabela `pedidos` (para não gerar migração conflitante)

Posso prosseguir com estimativas, mas o risco de retrabalho é alto."
```

---

## Formato de Resposta Padrão para Agentes

Todo agente, ao entregar um resultado, deve usar este formato:

```markdown
## Resultado — [nome da tarefa]

### O que foi feito
[Descrição objetiva]

### Arquivos criados/modificados
- `caminho/arquivo.ts` — [o que faz]
- `caminho/outro.tsx` — [o que faz]

### Regras aplicadas
- ✅ Regra #1 — componentes sem chamada direta de API
- ✅ Regra #3 — organization_id presente
- ✅ Cap. 5 — estrutura page/service/hooks/types

### Pontos de atenção
- ⚠️ [Qualquer decisão não óbvia que o revisor deve checar]
- ⚠️ [Dependência de outro agente ou tarefa]

### Self-annealing
- [Se descobriu algo novo que deve ir para o SKILL, descreva aqui]
```

---

## Regras Absolutas para Agentes de IA

```
1. NUNCA gere código que viola as 10 Regras de Ouro sem sinalizar
2. NUNCA aprove exceções — sinalize e aguarde humano
3. NUNCA assuma contexto que não foi fornecido — solicite
4. NUNCA entregue código sem executar o checklist do Cap. 15 mentalmente
5. SEMPRE identifique o tipo de agente que você é nesta tarefa
6. SEMPRE use o formato de Resultado ao entregar
7. SEMPRE use o formato de Handoff ao passar para outro agente
8. SEMPRE sinalize aprendizados para Self-Annealing
```

---

## Exemplo Completo: 3 Agentes Criando uma Feature

### Feature: Cadastro de Fornecedores

**Agente Orquestrador recebe a tarefa:**
```
Preciso criar o módulo de fornecedores com:
- Listagem paginada
- Cadastro com nome, CNPJ, email, telefone
- Desativação (não deleção)
- Isolamento por empresa
```

**Agente Orquestrador distribui:**
```
→ Agente Banco:
  Leia: Cap. 7 + Cap. 8
  Tarefa: Criar migration da tabela `fornecedores` com RLS
  Entregar: arquivo SQL + políticas RLS

→ Agente Backend:
  Leia: Cap. 6
  Aguardar: resultado do Agente Banco
  Tarefa: Criar Edge Function `criar-fornecedor` com validação Zod
  Entregar: função com CRD documentado

→ Agente Frontend:
  Leia: Cap. 5 + Cap. 14
  Aguardar: resultado do Agente Backend
  Tarefa: Criar módulo completo (types, service, hooks, page, components)
  Modelo de referência: ver modulo-exemplo/
```

**Agente Revisor verifica todos os outputs com o Cap. 15.**

---

## Perguntas de Revisão

1. Um agente recebe uma tarefa sem contexto de negócio. O que deve fazer?
   → Solicitar o BRD ou descrição antes de gerar código. Nunca adivinhar.

2. Dois agentes geraram código incompatível entre si. Quem decide qual está certo?
   → O Agente Revisor aponta o conflito com referência à regra. Humano decide exceção.

3. Um agente percebeu um padrão novo que não está no Skill. O que faz?
   → Registra na seção Self-Annealing do resultado e sinaliza para documentação.

4. O usuário pediu ao agente para pular a validação Zod "só desta vez".
   → Sinaliza `⚠️ CONFLITO COM REGRA #6`, explica o risco, propõe alternativa, aguarda aprovação explícita.
