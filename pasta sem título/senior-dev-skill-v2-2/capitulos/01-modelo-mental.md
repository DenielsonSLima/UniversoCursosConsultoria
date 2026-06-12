# Capítulo 1 — O Modelo Mental: Arquitetura de 3 Camadas

**Duração:** 20 min | **Nível:** Fundamental | **Pré-requisito:** Nenhum

> Este capítulo é o modelo central que fundamenta tudo. Leia antes de qualquer outro.

---

## Por que Precisamos de um Modelo Mental?

Quando 10 desenvolvedores (ou 10 agentes de IA) trabalham no mesmo sistema sem
um modelo compartilhado, cada um toma decisões diferentes. Resultado: o código vira
um quebra-cabeça onde ninguém sabe onde as peças se encaixam.

Um modelo mental resolve isso. É o mapa que todo mundo usa para tomar decisões
consistentes — humanos ou máquinas.

---

## A Analogia do Restaurante

```
CLIENTE (Usuário da aplicação)
"Quero registrar um pagamento de R$ 500 na conta Caixa"
        ↓
┌─────────────────────────────────────────────┐
│  GARÇOM (Orquestração)                      │
│  • Recebe o pedido                          │
│  • Verifica se o cliente pode fazer isso    │
│  • Traduz para a cozinha                    │
│  • Trata problemas ("saldo insuficiente")   │
│  • Retorna resultado ao cliente             │
└─────────────────────┬───────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│  COZINHA (Execução)                         │
│  • Faz exatamente o que foi pedido          │
│  • Registra o lançamento                    │
│  • Atualiza o saldo                         │
│  • Retorna o resultado                      │
└─────────────────────────────────────────────┘

Mas onde ficam as RECEITAS?

┌─────────────────────────────────────────────┐
│  LIVRO DE RECEITAS (Diretivas)              │
│  • "Como registrar um pagamento"            │
│  • Regras, validações, passos               │
│  • Consultado antes de executar             │
│  • Atualizado quando aprendemos algo novo   │
└─────────────────────────────────────────────┘
```

**O livro de receitas = este Skill.** É o que garante que qualquer cozinheiro
(dev, LLM, agente) prepare o mesmo prato da mesma forma.

---

## As 3 Camadas Técnicas

```
┌────────────────────────────────────────────────────────────┐
│  CAMADA 1 — DIRETIVA                                       │
│  "O que fazer e por que"                                   │
│  → Este Skill, HLD, BRD, documentação de produto          │
│  → Escrita em linguagem natural                            │
│  → Consultada antes de implementar qualquer coisa          │
└──────────────────────────────┬─────────────────────────────┘
                               │ Guia
┌──────────────────────────────▼─────────────────────────────┐
│  CAMADA 2 — ORQUESTRAÇÃO                                   │
│  "Como decidir e coordenar"                                │
│  → Páginas React, Edge Functions, Hooks                    │
│  → Lê diretivas → toma decisões → chama execução          │
│  → Trata erros, retorna resultados                         │
└──────────────────────────────┬─────────────────────────────┘
                               │ Delega
┌──────────────────────────────▼─────────────────────────────┐
│  CAMADA 3 — EXECUÇÃO                                       │
│  "Fazer o trabalho concreto"                               │
│  → Services, RPCs SQL, componentes de UI                   │
│  → Funções determinísticas e testáveis                     │
│  → Zero lógica de negócio — apenas executa                 │
└────────────────────────────────────────────────────────────┘
```

### A Regra de Dependência

```
Diretiva  →  Orquestração  →  Execução
   ↑               ↑               ↑
Nunca o       Nunca chama    Nunca chama
contrário      Diretiva       Orquestração
```

**Execução nunca sabe que Orquestração existe.**
**Orquestração nunca duplica lógica da Execução.**
**Diretiva nunca contém código — apenas regras.**

---

## Aplicação Prática no Projeto

| Conceito | Onde fica | Exemplos |
|---|---|---|
| **Diretiva** | Este Skill, BRD, HLD | Regras de negócio, este capítulo |
| **Orquestração** | Páginas, Edge Functions, Hooks | `ClientesPage`, `processar-pagamento` |
| **Execução** | Services, SQL RPCs, UI components | `clienteService.getAll()`, `inserir_lancamento()`, `<Button />` |

---

## Por que Isso Funciona para Multi-Empresa?

Em sistemas com múltiplos usuários simultâneos, cada camada tem um papel crítico:

**Diretiva** define que toda tabela precisa de `organization_id`.
**Orquestração** (Edge Function) verifica que o usuário pertence à organização antes de executar.
**Execução** (RLS no banco) garante que queries só retornam dados da organização correta.

Se uma camada falha, as outras compensam. É **defesa em profundidade**.

---

## Perguntas de Revisão

1. Se eu precisar mudar uma regra de negócio, em qual camada devo mexer?
   → Camada 1 (Diretiva) — documente primeiro, implemente depois.

2. Se precisar adicionar uma nova operação no banco, quem chama quem?
   → Orquestração chama Execução. Execução nunca se auto-invoca.

3. Qual camada garante que empresa A não veja dados de empresa B?
   → As três, em conjunto. RLS na execução, verificação na orquestração, documentado na diretiva.

4. Um novo agente de IA entra no projeto. O que ele deve ler primeiro?
   → Este capítulo e o SKILL.md — estabelecem o modelo mental compartilhado.
