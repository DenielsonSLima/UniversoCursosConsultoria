# Capítulo 09 — Testes Automatizados e Qualidade de Código

> *"Testes não são sobre provar que o código funciona hoje. São sobre garantir que ele continue funcionando amanhã, quando alguém mudar algo."*

---

## Por Que Testar?

Em um sistema ERP multi-empresa com dados financeiros:

- Um bug no cálculo de saldo pode custar dinheiro real para clientes reais
- Uma brecha de segurança pode expor dados de uma empresa para outra
- Uma refatoração "simples" pode quebrar um fluxo crítico
- Sem testes, ninguém tem coragem de refatorar código ruim → débito técnico cresce

**Testes são a rede de segurança que permite evoluir o sistema com confiança.**

---

## A Pirâmide de Testes

```
        /\
       /E2E\          ← Poucos, lentos, caros
      /------\         Validam o fluxo do usuário
     /Integração\     ← Médios, moderados
    /------------\     Validam a comunicação entre partes
   / Unitários    \   ← Muitos, rápidos, baratos
  /----------------\   Validam lógica isolada
```

### Distribuição Recomendada

| Tipo | Quantidade | Velocidade | Custo | Quando usar |
|---|---|---|---|---|
| **Unitários** | 70% | Milissegundos | Baixo | Toda lógica pura |
| **Integração** | 20% | Segundos | Médio | Módulos + banco + API |
| **E2E** | 10% | Minutos | Alto | Fluxos críticos do usuário |

---

## Testes Unitários

### O Que Testar

- Funções puras (formatação, validação, cálculo)
- Lógica de hooks customizados
- Transformação de dados nos services

### Exemplo: Testando Validações

```typescript
// File: src/lib/utils/validators.test.ts

import { describe, it, expect } from 'vitest'
import { validarCPF, validarCNPJ, validarEmail } from './validators'

describe('validarCPF', () => {
  it('deve aceitar CPF válido formatado', () => {
    expect(validarCPF('123.456.789-09')).toBe(true)
  })
  
  it('deve aceitar CPF válido sem formatação', () => {
    expect(validarCPF('12345678909')).toBe(true)
  })
  
  it('deve rejeitar CPF com todos os dígitos iguais', () => {
    expect(validarCPF('111.111.111-11')).toBe(false)
    expect(validarCPF('000.000.000-00')).toBe(false)
  })
  
  it('deve rejeitar CPF com comprimento incorreto', () => {
    expect(validarCPF('123456')).toBe(false)
    expect(validarCPF('')).toBe(false)
  })
  
  it('deve rejeitar CPF com dígito verificador inválido', () => {
    expect(validarCPF('123.456.789-00')).toBe(false)
  })
})

describe('validarEmail', () => {
  it('deve aceitar emails válidos', () => {
    expect(validarEmail('user@empresa.com')).toBe(true)
    expect(validarEmail('nome.sobrenome@dominio.com.br')).toBe(true)
  })
  
  it('deve rejeitar emails inválidos', () => {
    expect(validarEmail('nao-e-email')).toBe(false)
    expect(validarEmail('@semdominio.com')).toBe(false)
    expect(validarEmail('semdominio@')).toBe(false)
  })
})
```

### Exemplo: Testando Formatadores

```typescript
// File: src/lib/utils/formatters.test.ts

import { formatCurrency, formatDate, formatCPF } from './formatters'

describe('formatCurrency', () => {
  it('deve formatar valores positivos em BRL', () => {
    expect(formatCurrency(1234.56)).toBe('R$ 1.234,56')
    expect(formatCurrency(0)).toBe('R$ 0,00')
  })
  
  it('deve formatar valores negativos com sinal', () => {
    expect(formatCurrency(-500)).toBe('-R$ 500,00')
  })
  
  it('deve arredondar corretamente', () => {
    expect(formatCurrency(1.005)).toBe('R$ 1,01')
  })
})

describe('formatDate', () => {
  it('deve formatar data no padrão brasileiro', () => {
    expect(formatDate('2024-03-15')).toBe('15/03/2024')
  })
  
  it('deve retornar traço para datas inválidas', () => {
    expect(formatDate('')).toBe('—')
    expect(formatDate(null)).toBe('—')
  })
})
```

---

## Testes de Integração

### Testando Edge Functions

```typescript
// File: supabase/functions/criar-cliente/index.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('Edge Function: criar-cliente', () => {
  let authToken: string
  let organizationId: string
  
  beforeAll(async () => {
    // Setup: criar usuário de teste e obter token
    const { data } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'test-password'
    })
    authToken = data.session?.access_token ?? ''
    organizationId = 'test-org-id'
  })
  
  it('deve criar cliente com dados válidos', async () => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/criar-cliente`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nome: 'João da Silva',
        email: 'joao@empresa.com',
        organization_id: organizationId
      })
    })
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('id')
    expect(data.nome).toBe('João da Silva')
    expect(data.organization_id).toBe(organizationId)
  })
  
  it('deve retornar 400 para dados inválidos', async () => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/criar-cliente`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ nome: '' }) // Nome vazio = inválido
    })
    
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('VALIDATION_ERROR')
  })
  
  it('deve retornar 401 sem autenticação', async () => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/criar-cliente`, {
      method: 'POST',
      body: JSON.stringify({ nome: 'Teste' })
    })
    
    expect(response.status).toBe(401)
  })
})
```

---

## Testando Isolamento Multi-Tenant

```typescript
// File: src/__tests__/multitenancy.test.ts
// CRÍTICO: Este teste deve existir e passar em 100% dos casos

describe('Isolamento Multi-Tenant (CRÍTICO)', () => {
  let supabaseEmpresaA: SupabaseClient
  let supabaseEmpresaB: SupabaseClient
  let clienteIdEmpresaB: string
  
  beforeAll(async () => {
    supabaseEmpresaA = createClient(url, anon, { headers: { auth: tokenEmpresaA } })
    supabaseEmpresaB = createClient(url, anon, { headers: { auth: tokenEmpresaB } })
    
    // Criar cliente na Empresa B
    const { data } = await supabaseEmpresaB
      .from('clientes')
      .insert({ nome: 'Cliente Secreto B', organization_id: orgIdB })
      .select()
      .single()
    clienteIdEmpresaB = data!.id
  })
  
  it('Empresa A NÃO PODE ver clientes da Empresa B', async () => {
    const { data } = await supabaseEmpresaA
      .from('clientes')
      .select('*')
    
    const ids = data?.map(c => c.organization_id) ?? []
    ids.forEach(id => expect(id).toBe(orgIdA)) // Só vê da própria org
  })
  
  it('Empresa A NÃO PODE buscar ID específico da Empresa B', async () => {
    const { data } = await supabaseEmpresaA
      .from('clientes')
      .select('*')
      .eq('id', clienteIdEmpresaB)
    
    expect(data).toHaveLength(0) // RLS filtra automaticamente
  })
  
  it('Empresa A NÃO PODE atualizar cliente da Empresa B', async () => {
    const { error } = await supabaseEmpresaA
      .from('clientes')
      .update({ nome: 'Hackeado' })
      .eq('id', clienteIdEmpresaB)
    
    // Sem erro, mas sem efeito (RLS bloqueia silenciosamente)
    const { data } = await supabaseEmpresaB
      .from('clientes')
      .select('nome')
      .eq('id', clienteIdEmpresaB)
      .single()
    
    expect(data?.nome).toBe('Cliente Secreto B') // Intacto
  })
})
```

---

## Revisão de Código — O Que um Sênior Verifica

### Checklist de Code Review

**Segurança:**
- [ ] Existe alguma chave secreta hardcoded?
- [ ] Os dados de entrada são validados antes do uso?
- [ ] RLS está habilitado nas tabelas afetadas?
- [ ] Um usuário poderia acessar dados de outra empresa?

**Arquitetura:**
- [ ] O código está no lugar certo (camada correta)?
- [ ] Existe lógica de negócio no componente React?
- [ ] Existe chamada de API diretamente no componente?
- [ ] Existe um "God Service" crescendo?

**Qualidade:**
- [ ] Os nomes descrevem claramente a intenção?
- [ ] Existe duplicação de lógica que poderia ser extraída?
- [ ] O código é testável de forma isolada?
- [ ] Existe tratamento para todos os casos de erro?

**Performance:**
- [ ] As queries têm índices nas colunas de filtro?
- [ ] O cache está sendo invalidado corretamente?
- [ ] Existe alguma N+1 query?
- [ ] Os dados são paginados quando a lista pode ser grande?

---

## Perguntas de Revisão — Testes e Qualidade

- [ ] Toda função de validação tem testes unitários para casos válidos E inválidos?
- [ ] Existe teste de isolamento multi-tenant que verifica que RLS está funcionando?
- [ ] As Edge Functions têm testes de integração cobrindo 400, 401, 403 e 200?
- [ ] Os testes de mutação verificam o estado do banco APÓS a operação?
- [ ] Existe CI/CD que executa os testes antes de fazer deploy?
- [ ] Os testes são determinísticos (não dependem de ordem ou estado externo)?

---

*Próximo capítulo: [11-erros-resiliencia.md](./11-erros-resiliencia.md)*
