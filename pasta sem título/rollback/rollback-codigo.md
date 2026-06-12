# Rollback de Código — Next.js / React / TypeScript / Vercel

---

## 🚨 REGRA ANTES DE CORRIGIR QUALQUER ARQUIVO

1. Leia o arquivo completo antes de editar — nunca corrija o que não viu
2. Use Modo Patch — altere apenas o bloco com erro
3. Verifique outros arquivos que importam o módulo afetado
4. Tenha o git ou o conteúdo original disponível para reverter se necessário

---

## REVERTER UM ARQUIVO PARA VERSÃO ANTERIOR

```bash
# Ver histórico do arquivo
git log --oneline -- caminho/do/arquivo.tsx

# Ver conteúdo de uma versão anterior
git show HASH:caminho/do/arquivo.tsx

# Reverter o arquivo para versão anterior
git checkout HASH -- caminho/do/arquivo.tsx

# Reverter o último commit (mantém alterações no working tree)
git revert HEAD
```

**SE não usa git:** Peça ao usuário o conteúdo original do arquivo antes de qualquer edição. Sempre.

---

## ERROS COMUNS E CORREÇÃO

### `Cannot read properties of undefined`
**Causa:** Dado não carregou ainda ou prop não foi passada.
```tsx
// ❌ Quebra se dados for undefined
dados.map(item => ...)

// ✅ Protegido
(dados ?? []).map(item => ...)
dados?.map(item => ...)
```

### Build falhando na Vercel
**Checklist:**
```
[ ] O erro reproduz localmente? (npm run build)
[ ] Falta variável de ambiente no painel da Vercel?
[ ] Há import de módulo que não existe?
[ ] TypeScript strict pegando algo novo?
```
Sempre reproduza o erro localmente antes de tentar corrigir direto na Vercel.

### useEffect em loop infinito
**Causa:** Objeto/array como dependência (recriado a cada render).
```tsx
// ❌ Loop — objeto é novo a cada render
useEffect(() => { buscar(filtro) }, [filtro])

// ✅ Correto — usa o valor primitivo
useEffect(() => { buscar(filtro) }, [filtro.id])
```

### API route retornando 500
```
[ ] Ver logs reais no terminal ou Vercel (o erro está lá, não na mensagem do cliente)
[ ] Variável de ambiente definida no servidor?
[ ] Conexão com Supabase funcionando?
[ ] Tem try/catch em volta do código assíncrono?
```

---

## DEPLOY QUEBRADO EM PRODUÇÃO — ROLLBACK IMEDIATO

**SE o deploy foi para produção e quebrou o app:**

1. Acesse o painel da Vercel
2. Vá em Deployments
3. Encontre o último deploy que estava funcionando
4. Clique em "..." → "Promote to Production"

Isso reverte a produção para o deploy anterior em menos de 1 minuto, sem precisar de código.

---

## CHECKLIST ANTES DE ALTERAR ARQUIVO DE CÓDIGO

```
[ ] Li o arquivo completo?
[ ] Identifiquei apenas o bloco com erro (Modo Patch)?
[ ] Sei quais outros arquivos importam este?
[ ] Tenho como reverter (git ou conteúdo original)?
[ ] Vou testar localmente antes de fazer deploy?
```
