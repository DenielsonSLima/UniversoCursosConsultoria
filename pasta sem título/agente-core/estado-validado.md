# Estado Validado — O que está aprovado e não pode ser tocado

Estas regras se aplicam SEMPRE que o usuário aprovar um item, e SEMPRE antes de qualquer edição.

---

## 🚨 REGRA PRINCIPAL

**Item marcado como VALIDADO = BLOQUEADO.**

Nenhuma edição pode ocorrer em um item VALIDADO sem o usuário pedir explicitamente.

Isso vale mesmo que:
- Você ache que pode melhorar
- O item pareça inconsistente com algo novo
- O modelo foi trocado e não sabe do histórico
- A sessão está longa e o contexto se perdeu

---

## O REGISTRO DE ESTADO VALIDADO

É uma tabela que fica ativa na sessão. Mantenha ela sempre atualizada.

```
## 🔒 ESTADO VALIDADO
Atualizado em: [turno ou horário]

| # | Item | Tipo | Status |
|---|------|------|--------|
| 1 | [nome] | [código / config / texto] | ✅ VALIDADO |
| 2 | [nome] | [tipo] | 🔄 EM PROGRESSO |
| 3 | [nome] | [tipo] | ⏳ PENDENTE |

✅ VALIDADO     = aprovado pelo usuário → BLOQUEADO, não editar
🔄 EM PROGRESSO = sendo trabalhado → pode editar
⏳ PENDENTE     = não iniciado → pode editar
```

---

## PASSO 1 — VERIFICAR ANTES DE QUALQUER EDIÇÃO

**SE existe uma tabela de Estado Validado na sessão:**
→ Leia a tabela
→ Identifique os itens VALIDADOS (bloqueados)
→ Declare: "Os itens X, Y, Z estão VALIDADOS e não serão tocados."

**SE não existe tabela de Estado Validado:**
→ Pergunte antes de começar:

```
📋 Antes de prosseguir: existe algum item neste conjunto que já está correto
e não deve ser alterado? Me diga quais para eu registrar como bloqueados.
```

Nunca assuma que tudo está em aberto.

---

## PASSO 2 — QUANDO VALIDAR UM ITEM

**SE o usuário disser:**
- "esse tá certo" / "aprovado" / "pode manter" / "esse funcionou"
- "não meche nisso" / "esse já tá bom" / "confirmado"
- "esse foi validado" / "tá funcionando" / "esse pode ficar assim"

**ENTÃO:**
1. Mova o item para ✅ VALIDADO na tabela
2. Confirme:

```
✅ Registrado — [nome do item] está VALIDADO e bloqueado.
```

---

## PASSO 3 — QUANDO EDITAR UM ITEM (inclusive VALIDADO)

O usuário não vai dizer "desbloqueia esse item". Ele vai falar naturalmente.

**Frases que indicam intenção de edição:**
- "corrige o [item]" / "corrige isso"
- "atualiza o [item]" / "atualiza isso"
- "esse está com erro" / "esse tá errado" / "tem erro aqui"
- "muda o [item]" / "troca o [item]"
- "esse precisa mudar" / "esse não tá certo"
- "refaz esse" / "reescreve esse" / "ajusta o [item]"

---

**SE o item está como ✅ VALIDADO:**
→ NÃO edite automaticamente
→ Avise e peça confirmação:

```
⚠️ [nome do item] está marcado como VALIDADO (bloqueado).
Você quer desbloquear e editar este item?

→ Confirme para eu prosseguir.
→ Se o erro é em outro item, me diga qual.
```

→ Após confirmação do usuário: mova para 🔄 EM PROGRESSO → aplique a edição com Modo Patch

---

**SE o item está como 🔄 EM PROGRESSO ou ⏳ PENDENTE:**
→ Edite direto com Modo Patch, sem pedir confirmação

---

**SE o item não está na tabela:**
→ Edite normalmente
→ Após concluir, pergunte:

```
✏️ Edição concluída em [item]. Quer registrá-lo no Estado Validado?
```

---

## PASSO 4 — DECLARAR ANTES DE EDITAR

Sempre declare antes de qualquer edição:

```
🔒 Estado validado verificado:
- Bloqueados (não serão tocados): [lista]
- Em progresso / pendentes (podem ser editados): [lista]
```

---

## PASSO 5 — CHECKPOINT A CADA 10 TURNOS

A cada 10 trocas de mensagem na sessão:
1. Mostre o estado atual da tabela
2. Pergunte se algo novo deve ser marcado como VALIDADO
3. Declare:

```
📋 Checkpoint — [N] itens VALIDADOS e bloqueados, [N] em progresso.
```

Por que isso é importante: em sessões longas o modelo começa a esquecer o que foi aprovado. O checkpoint força a releitura antes que isso aconteça.

---

## PASSO 6 — AO TROCAR DE MODELO

O novo modelo não sabe o que está bloqueado. Sempre passe o contexto:

```
Contexto da sessão:
[cole aqui a tabela de Estado Validado]

Tarefa agora: [descreva apenas o que precisa ser feito]
RESTRIÇÃO: não modifique nenhum item marcado como ✅ VALIDADO na tabela acima.
```

---

## EXEMPLOS

### ❌ SEM esta regra (o que acontece hoje):
```
Sessão longa, 15 turnos.
Turnos 1-8: KSIs 1, 2, 3 foram aprovados pelo usuário.
Turno 9: usuário pede "corrige o KSI-5".
Modelo esqueceu o histórico → regenera KSIs 1-8 do zero.
Resultado: todo o progresso destruído.
```

### ✅ COM esta regra:
```
Turnos 1-8: KSIs 1, 2, 3 aprovados → registrados como ✅ VALIDADOS.
Turno 9: usuário pede "corrige o KSI-5".
Agente: "KSIs 1, 2, 3 bloqueados. Vou editar apenas o KSI-5."
Resultado: apenas KSI-5 modificado. Resto intacto.
```

---

## INTEGRAÇÃO COM MODO PATCH

Estado Validado e Modo Patch funcionam juntos:

- **Estado Validado** → diz QUAIS itens estão bloqueados
- **Modo Patch** → diz COMO editar sem destruir os bloqueados

**Fluxo correto:**
```
1. Verificar Estado Validado → identificar o que está bloqueado
2. Ativar Modo Patch → executar a edição só no que foi permitido
3. Após aprovação → atualizar Estado Validado
```

---

## RESUMO RÁPIDO

| Situação | Ação |
|----------|------|
| Usuário aprova um item | Marcar como ✅ VALIDADO imediatamente |
| Usuário pede edição em item VALIDADO | Avisar, pedir confirmação, aí editar |
| Usuário pede edição em item EM PROGRESSO | Editar direto com Modo Patch |
| Sessão chegou em 10 turnos | Checkpoint — mostrar tabela |
| Trocar de modelo | Passar a tabela inteira para o novo modelo |
| Item não está na tabela | Editar e perguntar se quer registrar |
