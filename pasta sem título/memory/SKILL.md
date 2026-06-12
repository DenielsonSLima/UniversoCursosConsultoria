---
name: claude-code-pro
description: >
  SKILL DE MEMÓRIA PERSISTENTE — SEMPRE ATIVA EM TODO PROJETO.
  Esta skill deve ser ativada automaticamente em TODA conversa, sem exceção.
  Ela gerencia dois arquivos de memória do projeto: PROJETO_CONTEXTO.md (como o projeto funciona)
  e PROJETO_ALTERACOES.md (histórico de mudanças). No início de cada sessão, leia esses arquivos
  para recuperar o contexto. Ao final de cada alteração relevante, atualize os arquivos.
  Use esta skill quando: o usuário fizer qualquer pergunta sobre o projeto, pedir para criar ou
  editar código, corrigir bugs, adicionar features, refatorar, ou simplesmente conversar sobre
  o sistema. Esta skill é a espinha dorsal de memória do projeto — ela NUNCA deve ser ignorada.
---

# Claude Code Pro — Sistema de Memória Persistente do Projeto

> Esta skill transforma o Claude em um assistente com memória real entre sessões.
> Dois arquivos são mantidos automaticamente no projeto. O Claude os lê ao iniciar
> e os atualiza ao encerrar cada tarefa relevante.

---

## PROTOCOLO DE INICIALIZAÇÃO (executar no início de TODA sessão)

Ao começar qualquer conversa sobre o projeto, execute esta sequência:

```
1. Verifique se PROJETO_CONTEXTO.md existe na raiz do projeto
2. Verifique se PROJETO_ALTERACOES.md existe na raiz do projeto
3. Se existirem → leia ambos e absorva o contexto antes de responder
4. Se não existirem → crie os dois arquivos com a estrutura base (ver abaixo)
5. Confirme internamente: "Memória do projeto carregada."
```

**Nunca responda sem antes verificar esses arquivos.**

---

## ARQUIVO 1: PROJETO_CONTEXTO.md

**Propósito:** Explicar como o projeto funciona — visão geral, arquitetura, decisões técnicas, padrões adotados.

### Estrutura base (criar se não existir):

```markdown
# [Nome do Projeto] — Contexto do Sistema

## O que é este projeto
[Descrição do que o sistema faz em 2-3 frases]

## Stack tecnológica
- Frontend: ...
- Backend: ...
- Banco de dados: ...
- Outras ferramentas: ...

## Arquitetura e estrutura de pastas
[Explicação de como o código está organizado]

## Padrões e convenções adotadas
- Nomenclatura: ...
- Estrutura de componentes: ...
- Estilo de código: ...

## Decisões técnicas importantes
[Por que escolhemos X em vez de Y, problemas conhecidos e suas soluções]

## Contexto de negócio
[Quem usa, qual o propósito, quem são os stakeholders]

## Erros comuns — não repita
[Lista de armadilhas já encontradas e como evitá-las]
```

### Quando atualizar PROJETO_CONTEXTO.md:
- Quando uma nova feature muda a arquitetura
- Quando um padrão novo é adotado
- Quando um erro recorrente é identificado e resolvido
- Quando uma decisão técnica importante é tomada

---

## ARQUIVO 2: PROJETO_ALTERACOES.md

**Propósito:** Registrar o histórico de mudanças — o que foi feito, quando, por quê e como.

### Estrutura base (criar se não existir):

```markdown
# Histórico de Alterações do Projeto

> Arquivo mantido automaticamente pelo Claude.
> Cada entrada registra o que foi feito, o contexto e o impacto.

---

## [DATA] — [Título breve da alteração]

**O que foi feito:**
[Descrição objetiva da mudança]

**Por quê:**
[Motivo ou problema que gerou a alteração]

**Arquivos afetados:**
- `caminho/para/arquivo.ts`

**Observações:**
[Comportamentos inesperados, soluções alternativas descartadas, avisos]

---
```

### Quando atualizar PROJETO_ALTERACOES.md:
- Após cada correção de bug
- Após criar ou modificar um componente importante
- Após resolver um problema difícil
- Após qualquer refatoração
- Ao final de cada sessão de trabalho relevante

---

## PROTOCOLO DE ENCERRAMENTO (executar ao fim de cada tarefa)

Após concluir qualquer alteração relevante no projeto:

```
1. Atualize PROJETO_ALTERACOES.md com o que foi feito
2. Se a mudança afetou arquitetura ou padrões → atualize PROJETO_CONTEXTO.md
3. Se um erro foi resolvido → registre em "Erros comuns" no PROJETO_CONTEXTO.md
4. Nunca encerre uma tarefa sem atualizar a memória
```

---

## REGRAS DE COMPORTAMENTO

| Situação | Ação obrigatória |
|---|---|
| Início de sessão | Ler os dois arquivos de memória |
| Arquivos não existem | Criar com estrutura base |
| Bug corrigido | Registrar em ALTERACOES + "Erros comuns" no CONTEXTO |
| Nova feature criada | Registrar em ALTERACOES |
| Padrão novo adotado | Atualizar CONTEXTO |
| Refatoração feita | Registrar impacto em ALTERACOES |
| Decisão técnica tomada | Documentar em CONTEXTO |

---

## BOAS PRÁTICAS ADICIONAIS (do time Anthropic)

### Nunca microgerencie — dê o problema completo:
- "Corrija os testes de CI com falha" → não explique como
- "Corrija este bug" + link do Slack → zero contexto extra necessário

### Descarte soluções medíocres:
> _"Sabendo tudo que você sabe agora, descarte e implemente a solução elegante."_

### Faça o Claude ser seu revisor:
> _"Questione-me sobre estas alterações antes de prosseguir."_

### Especificação antes do código:
- Escreva o que precisa acontecer antes de pedir o código
- Quanto mais específico, melhor o resultado

### Subagentes para tarefas complexas:
- Adicione _"use subagentes"_ em qualquer pedido que precise de mais poder computacional
- Isso mantém o contexto principal limpo e focado

---

## EXEMPLO DE USO REAL

**Sessão começa:**
```
Claude lê PROJETO_CONTEXTO.md → entende que é um sistema React/TypeScript
para gestão de veículos, com parceiros Yuri, Klecio e Newton.
Claude lê PROJETO_ALTERACOES.md → vê que ontem foi corrigido um bug de
page-break no PDF de estoque usando paginação manual com paginarVeiculos().
Claude já sabe tudo isso sem que o usuário precise repetir.
```

**Sessão encerra:**
```
Claude atualiza PROJETO_ALTERACOES.md com o que foi feito hoje.
Se um padrão novo foi adotado, atualiza PROJETO_CONTEXTO.md.
Na próxima sessão, o contexto estará completo.
```

---

## IMPORTANTE

> Esta skill é a espinha dorsal do projeto. Ela elimina o problema de
> "o Claude não lembra o que foi feito antes". Com ela ativa, cada sessão
> começa exatamente de onde a última parou.
