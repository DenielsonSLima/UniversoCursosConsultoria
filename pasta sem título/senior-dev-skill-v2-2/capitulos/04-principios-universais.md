# Capítulo 4 — Princípios Universais de Qualidade

**Duração:** 30 min | **Nível:** Fundamental | **Pré-requisito:** Cap. 1-3

> Estes princípios valem para React, Python, Java, SQL, bash — qualquer código.
> Eles não envelhecem porque não são sobre tecnologia, são sobre raciocínio.

---

## Os 10 Princípios

---

### 1️⃣ SRP — Uma Responsabilidade por Unidade

> Cada função, componente, service ou módulo tem **uma razão para existir**.
> Se tem mais de uma, divida.

```typescript
// ❌ 3 responsabilidades em 1 função
async function criarUsuario(dados: any) {
  if (!dados.email.includes('@')) throw new Error('Email inválido');
  await db.insert('usuarios', dados);
  await emailService.send(dados.email, 'Bem-vindo!');
}

// ✅ Cada função faz uma coisa
function validarEmail(email: string): void {
  if (!email.includes('@')) throw new Error('Email inválido');
}

async function salvarUsuario(dados: UsuarioInput): Promise<Usuario> {
  return await db.insert('usuarios', dados);
}

async function enviarBoasVindas(email: string): Promise<void> {
  await emailService.send(email, 'Bem-vindo!');
}

// Orquestração: chama as três na ordem certa
async function criarUsuario(dados: UsuarioInput): Promise<Usuario> {
  validarEmail(dados.email);
  const usuario = await salvarUsuario(dados);
  await enviarBoasVindas(dados.email);
  return usuario;
}
```

**Pergunta de revisão:** Se precisar mudar a validação de email, quantos arquivos você mexe? Deve ser 1.

---

### 2️⃣ DRY — Não Repita Código

> Lógica duplicada = dois lugares para atualizar = dois lugares para ter bugs.

```typescript
// ❌ Validação de email em 3 services
class ClienteService {
  criar(d: any) { if (!d.email.includes('@')) throw... }
}
class FornecedorService {
  criar(d: any) { if (!d.email.includes('@')) throw... }
}

// ✅ Uma vez, compartilhado
// src/lib/utils/validators.ts
export const validarEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Usado em qualquer service
import { validarEmail } from '@/lib/utils/validators';
```

**Regra prática:** Se colou o mesmo bloco pela 2ª vez, extraia para função.

---

### 3️⃣ Cache com Intenção — Stale Time por Tipo de Dado

> Não trate todos os dados como igualmente voláteis.
> Dados que mudam frequentemente precisam de cache curto. Dados estáticos, cache longo.

```typescript
// Classifique seus dados por volatilidade:

// 🔴 Alta volatilidade — cache curto
useQuery({ staleTime: 30_000 })      // Lançamentos, saldo: 30s

// 🟡 Média volatilidade — cache moderado
useQuery({ staleTime: 5 * 60_000 }) // Clientes, produtos: 5min

// 🟢 Baixa volatilidade — cache longo
useQuery({ staleTime: 30 * 60_000 }) // Categorias, tipos: 30min

// ⚪ Imutável — cache infinito
useQuery({ staleTime: Infinity })    // Configurações do plano: manual
```

---

### 4️⃣ Recursos com Ciclo de Vida — Sempre Limpe

> Qualquer recurso que você abre, você fecha. Subscriptions, timers, listeners, conexões.

```typescript
// ❌ Subscription sem limpeza = memory leak
useEffect(() => {
  const channel = supabase.channel('lancamentos').subscribe();
  // Sem return → canal nunca é fechado
}, []);

// ✅ Sempre com limpeza
useEffect(() => {
  const channel = supabase.channel('lancamentos').subscribe();
  return () => supabase.removeChannel(channel); // ← cleanup obrigatório
}, []);
```

---

### 5️⃣ Debounce e Throttle — Respeite os Recursos

> Não dispare a mesma operação 50x porque o usuário digitou 50 letras.

```typescript
// ❌ Busca a cada tecla digitada
<input onChange={(e) => buscarClientes(e.target.value)} />

// ✅ Aguarda parar de digitar
const buscaDebounced = useMemo(
  () => debounce((termo: string) => buscarClientes(termo), 400),
  []
);
<input onChange={(e) => buscaDebounced(e.target.value)} />
```

---

### 6️⃣ Invalidação Inteligente — Não Refetch Tudo

> Após uma mutação, invalide apenas as queries que foram afetadas.

```typescript
// ❌ Invalida TUDO após criar um lançamento
onSuccess: () => queryClient.invalidateQueries()

// ✅ Invalida apenas o que mudou
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['lancamentos', orgId] });
  queryClient.invalidateQueries({ queryKey: ['saldo', contaId] });
  // Relatórios, cadastros, configurações → não tocados
}
```

---

### 7️⃣ Observabilidade — Se Não É Visível, Não Existe

> Erros silenciosos são piores que crashes. Você não sabe o que não sabe.

```typescript
// Mínimo necessário em toda Edge Function
try {
  // lógica
} catch (error) {
  // Log estruturado com contexto
  console.error(JSON.stringify({
    function: 'processar-lancamento',
    error: error instanceof Error ? error.message : 'unknown',
    input: { conta_id, valor }, // sem dados sensíveis
    timestamp: new Date().toISOString(),
  }));
  return errorResponse('INTERNAL_ERROR', 500);
}
```

---

### 8️⃣ Testabilidade por Design — Código Testável É Código Simples

> Se é difícil de testar, é difícil de entender. Refatore até ficar simples.

```typescript
// ❌ Impossível de testar isoladamente
const ClienteCard = ({ clienteId }: Props) => {
  const [cliente, setCliente] = useState(null);
  useEffect(() => { supabase.from('clientes').select()... }, [clienteId]);
  // Como testar sem conectar ao Supabase?
}

// ✅ Testável com apenas props
const ClienteCard = ({ cliente }: { cliente: Cliente }) => {
  return <div>{cliente.nome}</div>
  // Teste: render(<ClienteCard cliente={mockCliente} />)
}
```

---

### 9️⃣ Padronização e Consistência — Previsibilidade é Produtividade

> Código previsível é código que qualquer dev (ou LLM) lê e entende sem surpresas.

```
✅ Toda query de lista tem paginação
✅ Todo service retorna PaginatedResponse<T>
✅ Todo erro de API tem formato { error: string, message: string }
✅ Todo arquivo de módulo tem .page, .service, .hooks, .types
✅ Todo campo de input tem fundo branco e texto escuro

Se um padrão existe, ele se aplica SEM EXCEÇÃO até ser formalmente alterado.
```

---

### 🔟 Documentação como Código — PR de Conhecimento

> Mudança que não tem documentação não existiu para o próximo dev ou agente.

```markdown
# Template de commit de documentação
docs(cap-X): adicionar regra sobre [tema]

Contexto: [o que aconteceu que gerou essa regra]
Regra: [a regra em si]
Impacto: [o que muda no desenvolvimento]
```

---

## Matriz de Aplicação

| Princípio | Onde se aplica mais |
|---|---|
| SRP | Componentes, Services, Edge Functions |
| DRY | Utils, hooks, schemas Zod |
| Cache | TanStack Query staleTime |
| Recursos | useEffect cleanups, subscriptions |
| Debounce | Inputs de busca, auto-save |
| Invalidação | onSuccess de useMutation |
| Observabilidade | Edge Functions, erros críticos |
| Testabilidade | Componentes, funções puras |
| Consistência | Nomes, estrutura, respostas de API |
| Documentação | Qualquer mudança de comportamento |

---

## Perguntas de Revisão

1. Você encontrou a mesma lógica em 3 services diferentes. Qual princípio está sendo violado e como corrige?
   → DRY. Extraia para um util ou helper compartilhado.

2. Uma Edge Function retorna erro 500 mas o usuário não consegue saber o que aconteceu.
   Qual princípio está faltando?
   → Observabilidade. Adicione logs estruturados e mensagem amigável.

3. Um componente tem 400 linhas e faz 5 coisas diferentes.
   → SRP. Divida em componentes menores com responsabilidades únicas.

4. Um `useEffect` abre uma subscription do Supabase mas o componente desmonta e recria o canal várias vezes.
   → Ciclo de vida. Adicione `return () => supabase.removeChannel(channel)`.
