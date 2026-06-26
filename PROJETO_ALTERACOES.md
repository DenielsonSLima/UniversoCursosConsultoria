# Histórico de Alterações do Projeto

> Arquivo mantido automaticamente pelo Claude/Antigravity.
> Cada entrada registra o que foi feito, o contexto e o impacto.

---

## 2026-06-20 — Migração de Templates e Configurações para o Supabase

**O que foi feito:**
- Migração total de persistência de `localStorage` para a tabela online `documentos_templates` no Supabase.
- Atualização do `carteirinha.service.ts`, `declaracao.service.ts`, `irpf.service.ts`, `estagio.service.ts`, `cracha.service.ts` e `diploma.service.ts` para ler e salvar direto no Supabase.
- Criação do `academicos.service.ts` para gerenciar parâmetros globais de matrícula e templates de texto de certificados.
- Sincronização dos parâmetros em `useEffect` nas páginas `AcademicosConfig.tsx` e `SecretariaCarteirinhasPage.tsx`.
- Remoção de alertas nativos do navegador (`alert()`) no painel de configurações acadêmicas, substituídos pelo hook e componente `ToastNotification`.
- Inclusão da regra de ouro de não usar `localStorage` para dados estruturais nos arquivos de Skill (`senior-dev-skill-v2-2/SKILL.md` e `memory/SKILL.md`).

**Por quê:**
- Garantir que diferentes usuários e navegadores em uma plataforma escolar online acessem exatamente as mesmas configurações e layouts sincronizados em tempo real, sem perdas locais de dados.

**Arquivos afetados:**
- `modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha.service.ts`
- `modules/gestor/cadastros/modelos-documentos/declaracao/declaracao.service.ts`
- `modules/gestor/cadastros/modelos-documentos/irpf/irpf.service.ts`
- `modules/gestor/cadastros/modelos-documentos/estagio/estagio.service.ts`
- `modules/gestor/cadastros/modelos-documentos/cracha/cracha.service.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/diploma.service.ts`
- `modules/gestor/configuracoes/assinaturas/assinaturas.service.ts`
- `modules/gestor/configuracoes/academicos/academicos.service.ts`
- `modules/gestor/configuracoes/academicos/AcademicosConfig.tsx`
- `modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx`
- `pasta sem título/senior-dev-skill-v2-2/SKILL.md`
- `pasta sem título/memory/SKILL.md`

---

## 2026-06-20 — Atualização de Padrões de RAG, Skills de Engenharia Sênior e Contexto

**O que foi feito:**
- Atualização do Guia de Engenharia Sênior (`senior-dev-skill-v2-2/SKILL.md`) elevando as Regras de Ouro de 16 para 18 regras:
  - **REGRA 12:** Proibição explícita de cálculos de negócio/financeiros no cliente, exigindo delegação via Supabase RPC.
  - **REGRA 16:** Expansão da proibição de `localStorage` para qualquer dado de negócio ou persistência estrutural.
  - **REGRA 17:** Proibição absoluta de mensagens nativas no navegador (`alert`, `confirm`, `prompt`), padronizando o uso das notificações toast da UI.
  - **REGRA 18:** Normas para atuação cooperativa com subagentes e atualização constante do RAG.
- Atualização da Skill de Memória do Agente (`memory/SKILL.md`) adicionando as mesmas obrigações de comportamento na tabela de protocolos.
- Atualização do arquivo de contexto (`PROJETO_CONTEXTO.md`) para registrar formalmente a arquitetura com Supabase RPC, Realtime, TanStack Query e as proibições correspondentes.

**Por quê:**
- Garantir que qualquer agente autônomo subsequente ou desenvolvedor humano siga o mesmo modelo rigoroso de segurança, UX de notificação, realtime e integridade multitenant do banco de dados sem persistência no navegador.

**Arquivos afetados:**
- `pasta sem título/senior-dev-skill-v2-2/SKILL.md`
- `pasta sem título/memory/SKILL.md`
- `PROJETO_CONTEXTO.md`

---

## 2026-06-20 — Correção do Modo de Mesclagem da Assinatura no Preview

**O que foi feito:**
- Correção da aplicação do modo de mesclagem (`mix-blend-mode: multiply`) no componente `CarteirinhaPreview.tsx`.
- Adicionado o estilo `mixBlendMode` ao `div` container pai absoluto da assinatura do diretor, além de mantê-lo na imagem (`img`).

**Por quê:**
- O `div` container absoluto cria um novo contexto de empilhamento (stacking context). Se o `mix-blend-mode` for aplicado apenas à imagem filha, ele mesclará com a cor transparente do `div` pai absoluto em vez da imagem de fundo do cartão. Aplicando no container absoluto, a mesclagem ocorre corretamente com o fundo da carteirinha.

**Arquivos afetados:**
- `modules/gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview.tsx`

---

## 2026-06-20 — Correção do Carregamento de Assinatura Centralizada nos Editores

**O que foi feito:**
- Correção no carregamento das assinaturas centralizadas nos editores de Declaração, IRPF e Estágio (`DeclaracaoEditor.tsx`, `IRPFEditor.tsx` e `EstagioEditor.tsx`).
- O método `assinaturasService.getSignatures()` foi modificado para ser chamado com `await` dentro de um `onClick` declarado como `async`.

**Por quê:**
- O método `getSignatures()` é uma função assíncrona que retorna um `Promise<AssinaturasData>`. No código anterior, a chamada estava síncrona, fazendo com que o objeto de assinaturas fosse tratado como um objeto `Promise` e a URL da assinatura correspondente (`sigs[role.id]`) retornasse `undefined`. Com isso, a aplicação sempre exibia a mensagem de erro afirmando que a assinatura correspondente não estava cadastrada.

**Arquivos afetados:**
- `modules/gestor/cadastros/modelos-documentos/declaracao/components/DeclaracaoEditor.tsx`
- `modules/gestor/cadastros/modelos-documentos/irpf/components/IRPFEditor.tsx`
- `modules/gestor/cadastros/modelos-documentos/estagio/components/EstagioEditor.tsx`

---

## 2026-06-20 — Correção do Filtro de Status de Parceiros (ATIVO em Caixa Alta)

**O que foi feito:**
- Correção das queries que filtravam registros na tabela `parceiros` com `status = 'ativo'` (em letras minúsculas). As consultas foram atualizadas para buscar `status = 'ATIVO'` (em caixa alta).
- Arquivos modificados:
  - `TurmaGrade.tsx` (na busca de professores para vincular à turma).
  - `CalendarioPage.tsx` (na busca de professores para filtros da agenda).
  - `ComunicacaoConfig.tsx` (na busca de alunos e professores para o simulador de chatbot).

**Por quê:**
- No banco de dados PostgreSQL do Supabase, o status dos registros na tabela `parceiros` é armazenado em caixa alta (`'ATIVO'` e `'INATIVO'`), diferentemente das tabelas `polos` e `cursos` que utilizam minúsculas. Como as consultas faziam correspondência exata com `.eq('status', 'ativo')`, as buscas retornavam vazias.

**Arquivos afetados:**
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaGrade.tsx`
- `modules/gestor/calendario/CalendarioPage.tsx`
- `modules/gestor/comunicacao/components/ComunicacaoConfig.tsx`

---

## 2026-06-21 — Implementação do Histórico de Emissões (Secretaria Digital)

**O que foi feito:**
- Criação do submódulo **Histórico de Emissões** na Secretaria, listando todas as emissões oficiais de documentos com códigos de validação.
- Organização em abas por tipo de documento (`carteirinha`, `cracha_estagio`, `declaracao_matricula`, `declaracao_frequencia`, `declaracao_irpf`, `boletim`, `historico_escolar`, `rematricula`, `termo_estagio`, `transferencia`) com suporte a paginação de 10 registros por página.
- Adicionados filtros de busca em tempo real por nome do aluno, CPF ou código validador (buscando nativamente no JSONB de `dados_emissao`), além de filtro por Turma.
- Mapeamento dinâmico do ID do operador (`emitido_por`) com a tabela `usuarios_sistema` para exibir o nome do usuário que emitiu o documento. Caso seja nulo (emissões pelo portal do estudante), exibe "Aluno (Auto-emissão)".
- Implementação de um visualizador modal para geração de **Segunda Via** dos documentos:
  - Reutiliza `CarteirinhaPreview` e `CrachaPreview` para carteirinhas e crachás.
  - Renderiza layouts A4 universais mesclando placeholders como `{{ALUNO_NOME}}`, `{{ALUNO_CPF}}`, `{{CURSO_NOME}}` e montando chaves QR Code e assinaturas com base nas coordenadas absolutas do template.
  - Ao imprimir ou baixar a segunda via, o contador de emissões no banco de dados é incrementado de forma transacional e a lista é atualizada.
- Substituição de popups nativos do navegador (`alert()`) por notificações `ToastNotification` seguindo a regra de ouro do RAG.
- Criação de migração SQL (`20260621180000_grant_select_documentos_validacao.sql`) para conceder permissões de SELECT para o role `anon` na tabela `documentos_validacao` e ajustar a política de RLS, visto que a sessão administrativa atua localmente sob o token público (`anon`) nos cadastros de demonstração.

**Por quê:**
- Permitir controle detalhado e auditoria de todos os documentos gerados pela instituição, além de fornecer um canal centralizado para que a secretaria emita segundas vias oficiais (preservando o código de validação original e apenas registrando a quantidade de reemissões).

**Arquivos afetados:**
- `modules/gestor/secretaria/secretaria.service.ts`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/components/SecretariaDashboard.tsx`
- `modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx`
- `supabase/migrations/20260621180000_grant_select_documentos_validacao.sql`
- `PROJETO_ALTERACOES.md`


---
