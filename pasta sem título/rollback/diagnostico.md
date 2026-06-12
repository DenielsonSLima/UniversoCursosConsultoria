# Diagnóstico — Por onde começar quando algo quebrou

Carregue este arquivo quando não souber o que causou o erro.
Ele vai te apontar para o arquivo certo.

---

## PASSO 1 — LEIA O ERRO COMPLETO

Nunca corrija pelo título do erro. Leia a mensagem completa e a stack trace.

```
❌ Errado: "deu erro no banco" → vai corrigir no lugar errado
✅ Certo: ler a mensagem exata + linha + arquivo envolvido
```

---

## PASSO 2 — CLASSIFIQUE O ERRO

**Responda estas perguntas:**

**P1: O erro envolve valor financeiro, saldo, comissão ou dado de sócio?**
- SIM → 🔴 CRÍTICO. Pare tudo. Carregue `rollback-financeiro.md`

**P2: O erro está no banco de dados? (migration, RLS, trigger, query)**
- SIM → 🟠 ALTO. Não faça mais queries. Carregue `rollback-banco.md`

**P3: O erro está no código? (build, deploy, componente, API route)**
- SIM → 🟡 MÉDIO. Carregue `rollback-codigo.md`

**P4: Não sei onde está o erro?**
- Continue no PASSO 3 abaixo.

---

## PASSO 3 — LOCALIZAR O ERRO POR SINTOMA

| Sintoma | Provável causa | Arquivo |
|---------|---------------|---------|
| App inacessível em produção | Deploy com erro | `rollback-codigo.md` |
| Usuário não consegue logar ou acessar dados | RLS bloqueando | `rollback-banco.md` |
| Número/valor aparecendo errado na tela | Cálculo ou dado financeiro | `rollback-financeiro.md` |
| Tela branca / crash no browser | Erro de runtime no React | `rollback-codigo.md` |
| Erro 500 em API | Erro no servidor ou banco | `rollback-banco.md` ou `rollback-codigo.md` |
| Dado sumiu da tabela | Migration destrutiva ou RLS | `rollback-banco.md` |
| Build falhou na Vercel | TypeScript ou import quebrado | `rollback-codigo.md` |
| Trigger disparando errado | Lógica de banco | `rollback-banco.md` |

---

## PASSO 4 — ANTES DE QUALQUER CORREÇÃO, DOCUMENTE O ESTADO ATUAL

**Escreva isso antes de agir:**

```
🔍 ESTADO ATUAL DO ERRO:
- O que está errado: [descreva]
- Onde está: [arquivo / tabela / linha]
- Valor/comportamento atual (errado): [descreva]
- Valor/comportamento esperado (certo): [descreva]
- Última alteração feita antes do erro aparecer: [descreva]
```

Isso serve para: (1) comunicar o problema ao usuário com clareza, (2) ter referência se precisar de rollback completo.

---

## PASSO 5 — VERIFICAR SE É NECESSÁRIO AVISAR O USUÁRIO ANTES DE AGIR

**SE qualquer resposta for SIM → avise o usuário antes de executar a correção:**

```
[ ] O erro está em produção (usuários reais afetados)?
[ ] O erro envolve dado financeiro?
[ ] A correção requer apagar ou sobrescrever dados?
[ ] Não tenho certeza do valor correto?
```

**Template de aviso ao usuário:**
```
⚠️ Identifiquei um erro em [local].

Estado atual: [o que está errado]
O que preciso fazer para corrigir: [ação]
Impacto: [o que será afetado]

Confirma que posso prosseguir?
```
