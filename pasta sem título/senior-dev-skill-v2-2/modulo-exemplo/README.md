# 📦 Módulo Exemplo: Clientes

> Este módulo é a **referência canônica** do padrão.
> Antes de criar qualquer módulo novo, leia e copie esta estrutura.
> Cada arquivo aqui está 100% no padrão definido neste Skill.

---

## Estrutura

```
modulo-exemplo/
├── README.md                    ← Este arquivo
├── clientes.page.tsx            ← Página (orquestra)
├── clientes.service.ts          ← Acesso a dados
├── clientes.hooks.ts            ← TanStack Query
├── clientes.types.ts            ← Tipos TypeScript
└── components/
    ├── ClienteList.tsx          ← Lista de clientes
    ├── ClienteCard.tsx          ← Card de um cliente
    └── ClienteFormAdd.tsx       ← Formulário de criação
```

---

## O que cada arquivo demonstra

| Arquivo | Regras demonstradas |
|---|---|
| `clientes.types.ts` | Tipos de domínio, sem `any`, Input/Output separados |
| `clientes.service.ts` | Service como objeto, paginação, tratamento de erro |
| `clientes.hooks.ts` | TanStack Query, query keys tipadas, invalidação correta |
| `clientes.page.tsx` | Página fina, estados loading/error/empty, dados via hooks |
| `ClienteCard.tsx` | Componente puro, dados via props, zero chamada de API |
| `ClienteList.tsx` | Componente que delega renderização |
| `ClienteFormAdd.tsx` | Formulário com validação, useMutation, feedback |

---

## Como usar este módulo como referência

1. **Criar módulo novo:** Copie esta pasta, renomeie de `clientes` para o nome do módulo
2. **Revisar um módulo existente:** Compare com esta estrutura item por item
3. **Onboarding de agente de IA:** Leia este módulo antes de gerar código de qualquer módulo
