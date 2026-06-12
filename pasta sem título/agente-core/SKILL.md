# SKILL — Índice de Instruções do Agente

Este arquivo é o sumário central. Ele descreve cada instrução disponível para o agente, quando usar e o que cada uma faz.

Os arquivos abaixo devem ser carregados como contexto no Antigravity junto com este índice.

---

## 📁 ARQUIVOS DISPONÍVEIS

---

### 1. `modo-patch.md` — Edição Cirúrgica

**Quando usar:**
Sempre que for corrigir, ajustar, editar ou atualizar qualquer coisa que já existe — código, configuração, lista, objeto, schema, JSON, função, componente ou qualquer estrutura com múltiplos itens.

**O que faz:**
Define como o agente deve se comportar ao editar: ele classifica cada item do conjunto como LOCK (não toca) ou EDIT (pode editar), escreve o escopo antes de agir, e retorna apenas o que foi alterado — nunca regenera o conjunto inteiro. Resolve o problema de corrigir um item e destruir os outros 7 que estavam certos.

**Palavras-chave que ativam:**
"corrige", "ajusta", "muda", "troca", "atualiza", "conserta", "tá errado", "só esse", "apenas esse"

---

### 2. `roteador-llm.md` — Qual Modelo Usar

**Quando usar:**
No início de cada sessão, ao mudar de tipo de tarefa, ou quando o modelo atual está quebrando coisas que não deveria.

**O que faz:**
Define qual LLM usar para cada tipo de tarefa com base em custo, confiabilidade e tipo de trabalho. Evita o erro mais comum: usar Flash (barato) para edição de código, o que gera retrabalho que custa mais do que teria custado usar Haiku ou Sonnet desde o início. A cada nova tarefa, o agente declara o modelo escolhido e o motivo em uma linha.

**Resumo da lógica:**
- Flash → texto simples, resumo, brainstorm, geração sem dependências
- Haiku + Modo Patch → correção cirúrgica em código existente de escopo pequeno
- Gemini Pro → análise de documento longo, tarefa moderada
- Sonnet → código complexo, multi-arquivo, bug com causa desconhecida
- Opus → arquitetura de sistema inteiro, código crítico, quando Sonnet falhou

---

### 3. `estado-validado.md` — Registrar o que Está Aprovado

**Quando usar:**
Sempre que o usuário aprovar um item ("esse tá certo", "pode manter", "aprovado"), e sempre antes de qualquer edição — para verificar o que está bloqueado.

**O que faz:**
Mantém uma tabela na sessão com o status de cada item: VALIDADO (bloqueado, não pode ser editado), EM PROGRESSO (pode ser editado) e PENDENTE (não iniciado). Quando o usuário pede uma correção em linguagem natural ("corrige isso", "esse tá errado"), o agente verifica se o item está bloqueado antes de agir. A cada 10 turnos, faz um checkpoint para não perder o estado em sessões longas. Resolve o problema de sessões longas destruírem progresso já aprovado.

**Palavras-chave que ativam validação:**
"esse tá certo", "aprovado", "pode manter", "esse funcionou", "não meche nisso", "confirmado"

**Palavras-chave que ativam edição (com verificação de bloqueio):**
"corrige", "atualiza", "esse tá errado", "muda", "refaz", "ajusta"

---

## 🔗 COMO OS TRÊS TRABALHAM JUNTOS

```
Estado Validado  →  diz QUAIS itens estão bloqueados
       +
  Modo Patch     →  diz COMO editar sem destruir os bloqueados
       +
Roteador LLM    →  diz QUAL modelo executar a tarefa
```

**Fluxo completo de uma edição segura:**
```
1. Roteador LLM   → define o modelo correto para a tarefa
2. Estado Validado → verifica o que está bloqueado antes de editar
3. Modo Patch      → executa a edição apenas no escopo permitido
4. Estado Validado → atualiza a tabela após aprovação do usuário
```
