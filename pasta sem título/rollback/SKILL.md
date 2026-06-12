# Tratamento de Erros e Rollback — Índice Mestre

Leia APENAS este arquivo primeiro. Só carregue o arquivo específico quando a situação exigir.
Isso evita consumo desnecessário de tokens lendo documentação que não se aplica ao momento.

---

## 🔑 PALAVRAS-CHAVE — ATIVAÇÃO OBRIGATÓRIA

**SE o usuário usar qualquer palavra ou frase abaixo, você DEVE verificar este arquivo e carregar o arquivo correspondente antes de agir.**

### 🔴 Ativam `rollback-financeiro.md`:
`valor errado` · `preço errado` · `saldo errado` · `cálculo errado` · `lucro errado`
`comissão errada` · `sócio` · `participação` · `conta a pagar` · `conta a receber`
`título financeiro` · `pedido de compra` · `financeiro` · `dinheiro` · `valor incorreto`
`tá cobrando errado` · `número errado` · `duplicado` · `lançamento duplicado`

### 🟠 Ativam `rollback-banco.md`:
`migration` · `erro no banco` · `supabase` · `tabela` · `coluna` · `RLS`
`trigger` · `policy` · `acesso negado` · `violates row-level` · `does not exist`
`constraint` · `query` · `não encontra` · `dado sumiu` · `não está salvando`
`erro de banco` · `não aparece no banco` · `permission denied`

### 🟡 Ativam `rollback-codigo.md`:
`build falhou` · `erro na vercel` · `deploy quebrou` · `tela branca` · `tela de erro`
`undefined` · `cannot read` · `TypeError` · `componente quebrando` · `loop`
`useEffect` · `500` · `erro 500` · `api retornando erro` · `não renderiza`
`quebrou o front` · `tá dando erro no console` · `erro de typescript`

### ⚪ Ativam `diagnostico.md` (quando não sabe o que é):
`deu erro` · `quebrou` · `parou de funcionar` · `tá com bug` · `algo deu errado`
`não está funcionando` · `tá estranho` · `comportamento estranho` · `não sei o que é`
`me ajuda a descobrir` · `o que pode ser` · `por que tá assim`

---

## 🚨 REGRA GERAL — VALE PARA QUALQUER ERRO

**Antes de corrigir qualquer coisa:**
1. PARE — não faça mais alterações enquanto não entender o que quebrou
2. ISOLE — identifique o registro, arquivo ou query exata com problema
3. DOCUMENTE — anote o estado atual (errado) antes de mudar qualquer coisa
4. CONFIRME — se envolve dado financeiro ou produção, avise o usuário antes de agir
5. CORRIJA — só então aplique a correção, usando Modo Patch

**SE você não sabe o que causou o erro → não mexa. Carregue `diagnóstico.md` primeiro.**

---

## ⚡ CLASSIFICAÇÃO DE SEVERIDADE

```
🔴 CRÍTICO   = dado financeiro errado, produção inacessível, dado de sócio
               → Para tudo. Documenta. Avisa o usuário. Só age após confirmação.

🟠 ALTO      = migration quebrada, RLS bloqueando usuários, build falhando
               → Não faz mais alterações. Diagnostica antes de qualquer coisa.

🟡 MÉDIO     = componente com erro em runtime, query lenta, erro em desenvolvimento
               → Diagnostica e corrige com Modo Patch.

🟢 BAIXO     = warning de TypeScript, console.log esquecido, ajuste visual
               → Corrige direto com Modo Patch.
```

---

## 📁 ARQUIVOS — CARREGUE APENAS O QUE PRECISAR

| Arquivo | Carregue quando... |
|---------|-------------------|
| `diagnostico.md` | Não sabe o que causou o erro / erro genérico / ponto de partida |
| `rollback-banco.md` | Migration errada, dado corrompido no Supabase, trigger com bug |
| `rollback-codigo.md` | Arquivo de código quebrado, build falhando, deploy com erro |
| `rollback-financeiro.md` | Qualquer erro que envolva valor, saldo, comissão ou dado de sócio |

---

## 🔗 COMBINAÇÕES COMUNS

| Situação | Arquivos |
|----------|----------|
| Migration aplicada errada em produção | `diagnostico.md` → `rollback-banco.md` |
| Valor financeiro calculado errado | `diagnostico.md` → `rollback-financeiro.md` |
| Deploy na Vercel quebrou o app | `diagnostico.md` → `rollback-codigo.md` |
| Não sei o que quebrou | `diagnostico.md` — ele vai indicar o próximo |
| RLS bloqueando usuário em produção | `rollback-banco.md` |
| Componente React quebrando em runtime | `rollback-codigo.md` |
