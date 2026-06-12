# GLOSSÁRIO — Vocabulário Compartilhado

> Todos os termos desta empresa têm definição única.
> Quando um dev ou agente usa um desses termos, todos entendem a mesma coisa.

---

## A

**ADR (Architecture Decision Record)**
Documento curto que registra *por que* uma decisão técnica foi tomada. Fica em `docs/adr/`. Não pode ser alterado retroativamente — decisão errada vira novo ADR.

**Agente de IA**
Sistema automatizado baseado em LLM que executa tarefas de desenvolvimento. Deve seguir este Skill exatamente como um desenvolvedor humano sênior.

**Atomicidade**
Propriedade de uma operação que acontece por completo ou não acontece. Em banco de dados, uma RPC atômica garante que múltiplas tabelas sejam atualizadas juntas ou nenhuma seja. Nunca parcialmente.

---

## C

**Camada de Execução**
A terceira camada da arquitetura. Executa trabalho concreto e determinístico: services, RPCs SQL, componentes de UI. Não contém decisões — apenas executa o que foi delegado pela Orquestração.

**Camada de Orquestração**
A segunda camada da arquitetura. Toma decisões, coordena o fluxo, trata erros, chama a Execução. Exemplos: páginas React, Edge Functions, hooks customizados.

**Checklist (Cap. 15)**
Lista de verificações obrigatórias antes de qualquer PR. Dividida em 10 blocos. Não é opcional — é parte do processo de entrega.

**CRD (Contract Requirements Document)**
Documento que define o contrato de uma API: campos de entrada, campos de saída, códigos de erro. É o "contrato" entre frontend e backend.

---

## D

**Diretiva**
A primeira camada da arquitetura. Define *o que fazer* e *por que*. Escrita em linguagem natural. É este Skill. Nunca contém código de produção — apenas regras e exemplos.

**DRY (Don't Repeat Yourself)**
Princípio que proíbe duplicação de lógica. Se o mesmo código aparece em 2 lugares, deve ser extraído para um utilitário compartilhado.

---

## E

**Edge Function**
Função serverless do Supabase executada no servidor. Única camada que pode ter acesso à `service_role` key. Responsável por validação, autorização e lógica de negócio segura.

**Estorno**
Operação financeira que cancela um lançamento anterior criando um novo lançamento com valor oposto. Lançamentos nunca são deletados ou editados — apenas estornados.

---

## G

**Guardião do Padrão**
Papel em cada squad responsável por garantir que o time segue o Skill. Revisa PRs com foco nos padrões, propõe atualizações, responde dúvidas sobre as regras.

---

## H

**HLD (High Level Design)**
Documento de visão geral do sistema: problema, tecnologias, módulos, fluxo de dados. É o "mapa" antes de qualquer código.

**Hook Customizado**
Função React prefixada com `use` que encapsula lógica de TanStack Query e chamadas de service. É a ponte entre componentes e a camada de dados.

---

## I

**IDL (Implementation Definition)**
Documento que define o padrão de código: convenção de nomes, estrutura de pastas, exemplos de service/hook/componente.

---

## M

**Migração (Migration)**
Arquivo SQL versionado em `supabase/migrations/` que registra mudanças de schema do banco. Toda mudança de banco é uma migração — nunca SQL manual em produção.

**Multitenancy**
Modelo onde um único sistema atende múltiplas empresas com isolamento total de dados. Implementado via `organization_id` em todas as tabelas + RLS.

---

## O

**organization_id**
UUID presente em toda tabela de dados de cliente. Identifica a qual empresa aquele registro pertence. Filtrado automaticamente pelo RLS — consultas nunca retornam dados de outras organizações.

---

## P

**Paginação**
Técnica obrigatória de limitar resultados de queries. Implementada com `.range(from, to)` no Supabase. Nunca retornar listas sem limite — independente do volume atual de dados.

---

## R

**RLS (Row Level Security)**
Mecanismo do PostgreSQL que aplica filtros de segurança a nível de banco de dados. Com RLS ativo, consultas retornam automaticamente apenas dados autorizados para o usuário autenticado. É a última e mais confiável linha de defesa.

**RPC (Remote Procedure Call)**
Função SQL no PostgreSQL chamada via `supabase.rpc()`. Usada para operações que envolvem múltiplas tabelas ou lógica crítica que exige atomicidade.

---

## S

**Self-Annealing**
Processo pelo qual o sistema aprende com falhas: bug é diagnosticado → corrigido → documentado como regra → padrão atualizado. Cada falha torna o sistema mais forte.

**service_role**
Chave de administrador do Supabase que ignora RLS. NUNCA deve estar no frontend. Existe apenas em Edge Functions em variáveis de ambiente do servidor.

**SRP (Single Responsibility Principle)**
Princípio que define que cada unidade de código tem uma única razão para mudar. Componente faz uma coisa. Service faz uma coisa. Edge Function resolve um caso de negócio.

**staleTime**
Configuração do TanStack Query que define por quanto tempo os dados em cache são considerados frescos antes de refetch. Deve ser configurado por tipo de dado, não usar o padrão de 0.

---

## T

**TanStack Query**
Biblioteca de gerenciamento de cache de servidor no React. Responsável por: buscar dados, cachear, invalidar após mutações, deduplicar requests, background refresh. Substitui useState + useEffect para dados de servidor.

---

## Z

**Zod**
Biblioteca TypeScript de validação de schema. Usada obrigatoriamente em toda Edge Function para validar dados de entrada antes de qualquer operação no banco.

**Zustand**
Biblioteca leve de estado global. Usada apenas para estado de UI (empresa ativa, filtros, datas selecionadas). Não substitui TanStack Query para dados do servidor.

---

## Convenção: Adicionando ao Glossário

Quando um novo termo específico da empresa emergir:
1. Adicione em ordem alfabética
2. Seja preciso: a definição deve ser diferenciadora (o que torna este termo específico *aqui*)
3. Não use jargão para definir jargão
4. Abra PR com a adição — glossário tem revisão como código
