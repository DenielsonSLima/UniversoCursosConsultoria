# Modo Patch — Regras de Edição Cirúrgica

Estas regras se aplicam SEMPRE que você for editar, corrigir, ajustar ou atualizar qualquer coisa que já existe.

---

## 🚨 REGRA NÚMERO 1

**NÃO MEXA NO QUE NÃO FOI PEDIDO.**

Se o usuário pediu para corrigir o item 3:
- ✅ Corrija o item 3
- ❌ NÃO toque nos itens 1, 2, 4, 5, 6, 7, 8
- ❌ NÃO melhore outros itens "já que está aqui"
- ❌ NÃO reformate o que não foi pedido
- ❌ NÃO reescreva o que já estava certo

**Esta regra não tem exceção.**

---

## PASSO 1 — ANTES DE EDITAR, ESCREVA ISSO NA RESPOSTA

Sempre que receber um pedido de edição, escreva isso **antes de qualquer código ou conteúdo**:

```
🔍 ESCOPO DA EDIÇÃO:
- O que vou alterar: [nome exato do item ou campo]
- O que NÃO vou tocar: [lista os outros itens]
- Há impacto colateral? [SIM ou NÃO — se SIM, explica]
```

Escrever (não só pensar) te obriga a verificar o escopo antes de agir.

---

## PASSO 2 — CLASSIFIQUE CADA ITEM E ESCREVA NA RESPOSTA

Antes de editar, classifique todos os itens do conjunto. Escreva a classificação:

```
🔒 LOCK    = NÃO foi pedido para mudar → NÃO TOQUE
✏️ EDIT    = usuário pediu para mudar → PODE EDITAR
⚠️ IMPACTO = precisa mudar POR CAUSA do EDIT → JUSTIFIQUE antes de tocar
```

**Exemplo — usuário tem 8 KSIs e pediu para corrigir o KSI-3:**

```
🔒 KSI-1 → LOCK
🔒 KSI-2 → LOCK
✏️ KSI-3 → EDIT — corrigir este
🔒 KSI-4 → LOCK
🔒 KSI-5 → LOCK
🔒 KSI-6 → LOCK
🔒 KSI-7 → LOCK
🔒 KSI-8 → LOCK
```

**SE você vai precisar tocar um item LOCK sem o usuário ter pedido → PARE. Pergunte primeiro.**

---

## PASSO 3 — FORMATO DA RESPOSTA

**SE** o conjunto tem 5+ itens e apenas 1-2 foram pedidos → **use FORMATO DIFF:**

```
🔧 PATCH APLICADO

✏️ [EDIT] [nome do item]:
ANTES: [conteúdo original]
DEPOIS: [conteúdo corrigido]

🔒 Todos os outros [N] itens permanecem exatamente iguais.
```

**SE** o conjunto tem menos de 4 itens ou o usuário pediu o conjunto completo → **use FORMATO COMPLETO:**

```
✏️ [ALTERADO] [item editado]:
[conteúdo corrigido]

🔒 [SEM ALTERAÇÃO] [item 1]:
[conteúdo original idêntico]

🔒 [SEM ALTERAÇÃO] [item 2]:
[conteúdo original idêntico]
```

**SE** não sabe qual formato usar → pergunte antes de gerar.

---

## PASSO 4 — AVISE ANTES DE EDITAR

**Sempre comece a resposta com:**

```
🔧 Modo Patch — vou corrigir apenas [nome do item]. Os outros [N] itens ficam intactos.
```

**SE o pedido for ambíguo:**
```
⚠️ Antes de prosseguir: você quer que eu modifique apenas [item X],
ou a correção também afeta [item Y]?
```

**SE a correção obrigatoriamente afeta outro item:**
```
⚠️ Para corrigir [item X], precisarei ajustar também [item Y] porque [motivo].
Confirma?
```

Nunca altere mais de um item sem avisar primeiro.

---

## PASSO 5 — CHECKLIST ANTES DE ENVIAR

```
[ ] Alterei APENAS o que foi pedido?
[ ] Os itens LOCK saíram idênticos ao que o usuário enviou?
[ ] Não "melhorei" nada fora do escopo?
[ ] Se houver impacto colateral, eu avisei?
```

Se qualquer resposta for NÃO → corrija antes de enviar.

---

## EXEMPLOS

### ❌ ERRADO:
> Usuário: "O campo `preco` do produto 3 está como string, deveria ser number."
> Modelo regenera todos os 8 produtos, reformata tudo, renomeia campos.

### ✅ CERTO:
```
🔧 Modo Patch — vou corrigir apenas o campo `preco` do produto 3.

✏️ [EDIT] Produto 3:
ANTES: { ..., preco: "199.90", ... }
DEPOIS: { ..., preco: 199.90, ... }

🔒 Produtos 1, 2, 4, 5, 6, 7, 8 → não foram tocados.
```

---

### ❌ ERRADO:
> Usuário: "A migration do step 5 tem o nome da coluna errado."
> Modelo reescreve todas as 12 migrations "para garantir consistência".

### ✅ CERTO:
> Retorna apenas a migration do step 5 corrigida.
> Confirma que os outros 11 steps não foram alterados.

---

## 🚨 REGRA NÚMERO 1 — REPETINDO PORQUE É A MAIS IMPORTANTE

**NÃO MEXA NO QUE NÃO FOI PEDIDO.**

Esta regra aparece duas vezes neste arquivo de propósito. Ela não tem exceção.
