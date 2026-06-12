# Capítulo 03 — Frontend: Componentização e Separação de Responsabilidades

> *"Componentes que fazem tudo são como funcionários que fazem tudo — no começo parece eficiente. No fim, vira caos."*

---

## As 3 Camadas do Frontend

```
src/modules/{modulo}/
  {modulo}.page.tsx          ← CAMADA 1: Páginas (Orquestradoras)
  {modulo}.service.ts        ← Chamadas à API
  {modulo}.hooks.ts          ← Hooks customizados
  {modulo}.types.ts          ← Tipos TypeScript
  components/
    {Modulo}List.tsx         ← CAMADA 2: Componentes de Módulo
    {Modulo}Card.tsx
    {Modulo}FormAdd.tsx

src/lib/ui/
  Button.tsx                 ← CAMADA 3: Componentes de UI (Dumb)
  Input.tsx
  Modal.tsx
```

---

## Camada 1 — Páginas (Pages)

**Responsabilidade:** Orquestrar o fluxo da tela.

```tsx
// File: src/modules/clientes/clientes.page.tsx
// CORRETO: Page fina que só orquestra

export default function ClientesPage() {
  const { clientes, isLoading, error } = useClientes() // dados via hook
  const [modalAberto, setModalAberto] = useState(false)

  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage error={error} />

  return (
    <div>
      <PageHeader titulo="Clientes" onNovo={() => setModalAberto(true)} />
      <ClienteList clientes={clientes} />  {/* componente cuida da apresentação */}
      {modalAberto && <ClienteFormAdd onClose={() => setModalAberto(false)} />}
    </div>
  )
}

// ERRADO: Page com fetch direto e JSX complexo
export default function ClientesPageErrada() {
  useEffect(() => {
    fetch('/api/clientes').then(r => r.json()).then(setClientes) // ❌
  }, [])
  return <div>{clientes.map(c => <div key={c.id}><h2>{c.nome}</h2>...</div>)}</div> // ❌
}
```

---

## Camada 2 — Componentes de Módulo

**Responsabilidade:** Encapsular lógica e apresentação de uma funcionalidade.

```tsx
// File: src/modules/clientes/components/ClienteCard.tsx

interface ClienteCardProps {
  cliente: Cliente           // Recebe dados via props
  onEditar: (id: string) => void   // Emite eventos
  onExcluir: (id: string) => void
}

export function ClienteCard({ cliente, onEditar, onExcluir }: ClienteCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">{cliente.nome}</h3>
      <p className="text-sm text-gray-500">{cliente.email}</p>
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" onClick={() => onEditar(cliente.id)}>Editar</Button>
        <Button variant="danger" onClick={() => onExcluir(cliente.id)}>Excluir</Button>
      </div>
    </div>
  )
}
```

---

## Camada 3 — Componentes de UI (Dumb)

**Responsabilidade:** Blocos visuais reutilizáveis, SEM lógica de negócio.

```tsx
// File: src/lib/ui/Input.tsx
// REGRA: Inputs SEMPRE com fundo claro (#FFF) e texto escuro (#111827)

export function Input({ label, value, onChange, error, disabled }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ backgroundColor: '#FFFFFF', color: '#111827' }} // ← SEMPRE
        className={`rounded-md border px-3 py-2 text-sm ${error ? 'border-red-500' : 'border-gray-300'}`}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
```

---

## Hooks Customizados — A Cola Entre Camadas

```tsx
// File: src/modules/clientes/clientes.hooks.ts

export function useClientes() {
  const { organizationId } = useOrganization()
  return useQuery({
    queryKey: ['clientes', organizationId],
    queryFn: () => clienteService.getAll(organizationId),
    staleTime: 5 * 60 * 1000,
    enabled: !!organizationId,
  })
}

export function useCreateCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: clienteService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientes'] }),
  })
}
```

---

## Services — Interface com o Backend

```tsx
// File: src/modules/clientes/clientes.service.ts
// REGRA: Services chamam Edge Functions, nunca tabelas diretamente

export const clienteService = {
  async getAll(orgId: string): Promise<Cliente[]> {
    const { data, error } = await supabase.functions.invoke('listar-clientes', {
      body: { organization_id: orgId }
    })
    if (error) throw new Error(error.message)
    return data
  },
  
  async create(dto: CreateClienteDTO): Promise<Cliente> {
    const { data, error } = await supabase.functions.invoke('criar-cliente', { body: dto })
    if (error) throw new Error(error.message)
    return data
  },
}
```

---

## Checklist — Frontend

- [ ] Componentes não chamam API diretamente?
- [ ] Pages são delegadoras (não fazem trabalho pesado)?
- [ ] Componentes de UI em `/lib/ui` são reutilizáveis em qualquer módulo?
- [ ] Hooks abstraem a lógica de estado e dados?
- [ ] Services chamam Edge Functions (não tabelas diretamente)?
- [ ] Inputs têm fundo claro (#FFF) e texto escuro (#111827)?
- [ ] Tipos TypeScript estão em `{modulo}.types.ts`?

---

## Perguntas de Revisão

1. Um componente recebe `clienteId` como prop e dentro faz `supabase.from('clientes').select()`. O que está errado?
   → Viola a Regra #1. Componente não faz chamada de API. Deve receber `cliente` pronto via prop, ou usar um hook que faz a busca.

2. Qual a diferença entre colocar um componente em `/lib/ui/` vs `/modules/clientes/components/`?
   → `/lib/ui/` é visual puro, sem lógica de negócio, reutilizável em qualquer módulo. `/modules/*/components/` tem lógica específica do módulo.

3. Uma página tem 400 linhas e dentro dela há lógica de formatação, validação e chamadas de API. O que fazer?
   → Dividir: lógica de dados vai para hook/service, formatação vai para utils, UI complexa vai para componente. A página só orquestra.

4. Quando usar `useQuery` vs `useState` para armazenar dados que vieram do banco?
   → Sempre `useQuery`. `useState` é para estado local de UI (modal aberto, input temporário). Dado de servidor = TanStack Query.

5. Um agente de IA gerou um componente com `useEffect(() => { fetch('/api/clientes') }, [])`. Qual regra foi violada?
   → Regra #1. Além disso, `fetch` direto ignora o cache do TanStack Query, não tem tratamento de erro padronizado e não respeita o padrão de service.

*Próximo capítulo: [06-servico-seguranca.md](./06-servico-seguranca.md)*
