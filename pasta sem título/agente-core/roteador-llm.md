# Roteador LLM — Qual modelo usar em cada tarefa

Estas regras se aplicam SEMPRE ao iniciar uma tarefa nova ou mudar de tipo de trabalho.
A cada novo bloco de trabalho, declare o modelo escolhido antes de executar.

---

## ⚠️ REGRA DE OURO

**Modelo barato usado errado custa mais do que modelo caro usado certo.**

Flash economiza tokens na geração. Mas quando ela quebra algo que estava certo, o tempo humano gasto consertando custa mais do que teria custado usar Haiku ou Sonnet desde o início.

---

## 📋 TABELA RÁPIDA — CONSULTE ANTES DE CADA TAREFA

| Modelo | Custo | Use quando... | NUNCA use quando... |
|--------|-------|---------------|----------------------|
| **Gemini Flash** | Muito baixo | Texto simples, resumo, brainstorm, tradução | Editar código existente, conjuntos com múltiplos itens, sessão longa |
| **Claude Haiku** | Baixo | Corrigir bug isolado, editar 1-2 campos, componente simples | Precisar entender o sistema inteiro, bug com causa desconhecida |
| **Gemini Pro** | Médio | Analisar documento longo, tarefa moderada sem dependências | Edição cirúrgica de código complexo, sessão muito longa |
| **Claude Sonnet** | Médio | Código complexo, multi-arquivo, bug difícil, decisão arquitetural | Tarefas simples que Flash ou Haiku resolvem |
| **Claude Opus** | Alto | Arquitetura de sistema inteiro, código crítico, quando Sonnet falhou | Qualquer coisa que Sonnet resolve |

---

## 🔀 DECISÃO RÁPIDA — SIGA ESTA ORDEM

**Pergunta 1: A tarefa envolve código ou estrutura que já existe?**
- NÃO → vai para Pergunta 2
- SIM → não use Flash. Vai para Pergunta 3.

**Pergunta 2: É texto, resumo, brainstorm, tradução ou geração simples?**
- SIM → **FLASH** ✅
- NÃO → vai para Pergunta 3

**Pergunta 3: O escopo é pequeno e bem definido? (1-2 arquivos, 1 função, 1-2 campos)**
- SIM → **HAIKU + Modo Patch** ✅
- NÃO → vai para Pergunta 4

**Pergunta 4: Tem múltiplos arquivos, causa desconhecida ou é decisão de arquitetura?**
- SIM → **SONNET** ✅
- NÃO → **GEMINI PRO** ✅

**Pergunta 5: Sonnet tentou e não resolveu, ou o código é crítico (pagamentos, permissões)?**
- SIM → **OPUS** ✅

---

## 🟢 GEMINI FLASH

**✅ Use para:**
- Escrever email, mensagem, texto simples
- Resumir documento curto
- Gerar ideias, brainstorm, lista de opções
- Traduzir textos
- Sugerir nomes de variáveis ou funções
- Primeiro rascunho de algo não crítico
- Formatar dados simples já estruturados

**❌ Nunca use para:**
- Editar código que já existe → vai quebrar o que estava certo
- Corrigir um item dentro de um conjunto com outros itens → vai mexer nos outros
- Tarefas onde A depende de B que depende de C
- Sessões longas → Flash perde o contexto e começa a inventar
- Código que vai ser integrado a um sistema existente

**⚠️ Sinal de que Flash foi usada errada:**
> "Ela corrigiu o item que eu pedi E ainda quebrou os outros 7 que estavam certos."
> Isso é Flash sendo usada onde deveria ser Haiku + Modo Patch.

---

## 🔵 CLAUDE HAIKU

**✅ Use para:**
- Corrigir um bug em uma função isolada
- Editar 1-2 campos em um objeto ou schema (ative Modo Patch junto)
- Criar componente React simples com spec clara
- Escrever query SQL com até 3 tabelas
- Responder pergunta técnica direta com código
- Refatorar bloco pequeno com regras claras

**❌ Não use para:**
- Entender e modificar o sistema inteiro
- Bug onde a causa não está clara
- Código que depende de muitos arquivos ao mesmo tempo
- Decisões de arquitetura

**Haiku vs Flash para código:**
Flash é mais barata. Mas Flash destrói contexto. Haiku respeita o que já existe.
No segundo erro da Flash, o custo do retrabalho já supera o custo do Haiku.

---

## 🟡 GEMINI PRO

**✅ Use para:**
- Analisar documento longo e extrair informações
- Sumarizar conteúdo grande e estruturar em tabelas
- Código de complexidade média sem muitas dependências externas
- Tarefas que envolvem Google Sheets, Docs ou Drive

**❌ Não use para:**
- Edição cirúrgica de código complexo com muitas dependências
- Sessão muito longa com muito contexto acumulado
- Quando "não reescrever" é crítico

---

## 🟠 CLAUDE SONNET

**✅ Use para:**
- Debugging onde a causa não está clara
- Refatorar módulo inteiro que afeta outros
- Feature nova que envolve múltiplos arquivos
- Decisões de arquitetura e design de sistema
- Código complexo: auth, pipelines, migrations em cadeia
- Sessão longa onde o contexto precisa ser mantido com precisão
- Quando Haiku tentou e falhou → escale para Sonnet

**Regra prática:**
Dúvida entre Haiku e Sonnet? Pergunte: "Se isso quebrar, quanto tempo vou gastar consertando?"
Mais de 15 minutos → use Sonnet.

---

## 🔴 CLAUDE OPUS

**✅ Use para:**
- Planejar arquitetura de sistema inteiro do zero
- Análise de segurança profunda
- Quando Sonnet tentou e não chegou à resposta
- Código crítico: sistema de pagamentos, lógica de permissões

**⚠️ Opus é caro. Use só quando realmente necessário.**

---

## 🔁 COMBINAÇÕES QUE FUNCIONAM

**Correção em código existente (mais comum):**
```
Flash detectou o erro → Haiku + Modo Patch aplica a correção cirúrgica
```

**Feature nova em sistema existente:**
```
Sonnet entende o contexto → Haiku + Modo Patch integra nos pontos de conexão
```

**Conteúdo em volume:**
```
Flash gera em massa → Haiku ou Sonnet revisa e ajusta
```

**Debug de bug difícil:**
```
Sonnet diagnostica a causa → Haiku + Modo Patch aplica o fix cirúrgico
```

---

## 📌 QUANDO REVERIFICAR O ROTEAMENTO

Verificar o modelo correto nos seguintes momentos:

1. Ao iniciar a sessão
2. Ao mudar de tipo de tarefa (ex: saiu de texto e entrou em código)
3. Quando o usuário reclamar que algo foi quebrado
4. Quando a sessão passar de 10 trocas de mensagem
5. Quando estiver usando Flash para edição de código

**A cada nova tarefa, declare em uma linha:**

```
🔀 Roteamento: [MODELO] — porque [razão]
```

Exemplos:
```
🔀 Roteamento: HAIKU + Modo Patch — correção cirúrgica em campo existente
🔀 Roteamento: FLASH — geração de texto sem dependências
🔀 Roteamento: SONNET — bug com causa desconhecida em múltiplos arquivos
```
