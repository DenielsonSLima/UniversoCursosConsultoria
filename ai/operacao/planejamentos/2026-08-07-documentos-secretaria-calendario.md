# Planejamento revisado — documentos da Secretaria e calendário de aulas

**Lote:** `2026-08-07-documentos-secretaria-calendario`  
**Estado:** implementação e auditoria concluídas; publicação de produção autorizada pelo usuário após validações finais  
**Revisado em:** 07/08/2026

## 1. Escopo confirmado

1. Criar, em **Modelos de Documentos**, três modelos independentes:
   - Contrato do aluno;
   - Carteirinha de preceptor (somente professores);
   - Calendário de aulas.
2. Criar, em **Secretaria**, dois submódulos independentes:
   - Contratos de aluno: individual, lote e personalizado;
   - Carteirinhas de preceptor: individual, lote e personalizado.
3. Ajustar QR Code e validade para contrato e carteirinha de preceptor, com validação pública mínima e sem dados sensíveis no QR.
4. Acrescentar ao Calendário o filtro sequencial **tipo de curso → turma** e o botão **Exportar calendário de aulas**.
5. Usar os dados canônicos da grade da turma, marca-d’água e modelo editável. O frontend apenas seleciona, exibe e renderiza o retorno preparado pelo backend/RPC; não decide elegibilidade, valores, validade, ordenação acadêmica ou horários.

## 2. Fontes e fatos apurados antes de alterar

| Fonte | Achado que orienta a implementação |
| --- | --- |
| `Documentos/MINUTA - CONTRATOS ALUNOS 2.docx` | Fonte preservada, SHA-256 `b4df5b33631bd25411242f64f1dcaf3ea12bd03e4d8f5c3c21574fb2941a670e`. É uma minuta jurídica corrido, sem QR, marca-d’água ou campos de formulário; contém cláusulas específicas de curso técnico. Não será copiada para logs/RAG. |
| Foto de referência do calendário | Define um documento A4 retrato, cabeçalho institucional e tabela de componente curricular, data, horário e professor/observação. Não é o mesmo PDF anual já existente. |
| `public.cursos` | Modalidades reais: `TECNICO`, `LIVRE`, `EAD` e `SUPERIOR`. A opção apresentada como “Especialização” será mapeada explicitamente para `SUPERIOR`; não será criada uma string inexistente. |
| `public.aulas_turma` | Há data, sessão e carga horária, mas **não há hora inicial/final**. O exportador não pode deduzir horas a partir de carga, turno ou sessão. |
| EAD | Não há aulas datadas em `aulas_turma`; o filtro será apresentado, mas uma turma EAD sem grade publicada retornará estado informativo, sem calendário inventado. |
| QR/validação atual | `documentos_validacao` exige matrícula e aluno. Serve para contrato de aluno, mas não para preceptor; a credencial de preceptor precisará de ledger separado para preservar a integridade dos documentos estudantis. |

## 3. Limites de segurança e regra de negócio

- Não alterar a Carteirinha Estudantil existente nem o PDF anual do Calendário. Os novos fluxos ficam isolados.
- O QR contém somente URL/código opaco de validação. Consulta pública mostra, no máximo, instituição, tipo, nome minimizado, emissão, validade e status — nunca CPF, endereço, responsável, valores, foto ou conteúdo contratual.
- Contratos e credenciais emitidos não serão gravados no bucket público `documentos`. Se houver persistência de PDF, ela usará bucket privado, autorização por polo e URL assinada curta.
- A minuta recebida será a base fiel do modelo **Técnico**. As versões Livre e Especialização/Superior terão arquitetura própria e estado de revisão jurídica até existir texto aprovado; nenhuma cláusula técnica será adaptada automaticamente por inferência.
- “Preceptor” neste lote significa parceiro ativo do tipo `Professor`, autorizado no polo selecionado. Não se misturam aluno, matrícula ou carteirinha estudantil.
- O valor, parcelamento, vencimento, descontos, juros e demais condições do contrato serão consolidados por RPC a partir do cadastro/financeiro canônico. O browser não calculará nem aceitará esses valores como verdade.

## 4. Arquitetura modular prevista

```text
modules/gestor/cadastros/modelos-documentos/
  contrato-aluno/{components,hooks,services,types}
  carteirinha-preceptor/{components,hooks,services,types}
  calendario-aulas/{components,hooks,services,types}

modules/gestor/secretaria/
  contratos-aluno/{components,hooks,services,types}
  carteirinhas-preceptor/{components,hooks,services,types}

modules/gestor/calendario/
  exportacao-aulas/{components,hooks,services,types}
```

O catálogo `ModelosDocumentosPage`, o roteador `SecretariaPage`, o dashboard e o catálogo granular `secretaria-access.ts` recebem apenas as entradas/rotas necessárias. Cada domínio possui seus próprios tipos, services, query keys e hooks; componentes compartilhados só serão reutilizados quando não carregarem regra de aluno para um preceptor.

## 5. Ordem de execução

### Etapa 1 — Contrato de dados, autorização e auditoria

1. Inspecionar constraints e funções remotas existentes antes da migration.
2. Criar migração única e idempotente para:
   - versões/auditoria de modelos de documento;
   - emissão/snapshot imutável de contrato de aluno, integrado à validação estudantil existente;
   - ledger próprio de validação de carteirinha de preceptor, com código globalmente único, validade, revogação, idempotência e snapshot público mínimo;
   - horários oficiais opcionais da aula (`hora_inicio`/`hora_fim`) sem preencher historicamente dados inventados;
   - permissões/RLS/`EXECUTE` explícitos e eventos mínimos por polo, sem JSON com PII no Realtime.
3. Criar RPCs pequenas e autorizadas para ler/salvar modelos, listar workspaces, preparar emissões individual/lote/personalizada, preparar calendário e validar o código público.
4. Toda RPC fixa `search_path`, verifica módulo e polo no servidor, revoga `PUBLIC`, concede somente a `authenticated`/serviço necessário e compara payload no replay idempotente.

### Etapa 2 — Modelos de Documentos

1. Criar cards e páginas isoladas para Contrato do Aluno, Carteirinha de Preceptor e Calendário de Aulas.
2. Salvar/carregar pelo RPC versionado, não pelo `upsert` direto que existe em serviços legados.
3. Usar marca-d’água institucional do polo e variáveis tipadas. O conteúdo jurídico completo fica no modelo/snapshot protegido, não nos registros operacionais.
4. Adicionar os dois novos tipos às políticas de QR/validade e ao validador público discriminado, preservando o tipo atual de aluno.

### Etapa 3 — Secretaria: emissão e histórico

1. Adicionar as abas permissíveis `contrato-aluno` e `carteirinha-preceptor` em `secretaria-access.ts`, `SecretariaPage.tsx` e `SecretariaDashboard.tsx`.
2. Implementar workspace, busca paginada, seleção individual/lote/personalizada, prévia e reemissão com serviços/hook próprios.
3. Contrato: elegibilidade por matrícula e modalidade, resolução do modelo ativo, snapshot de aluno/responsável/curso/turma/financeiro canônico e QR/validade retornados pela RPC.
4. Preceptor: somente professor ativo do polo; sem consulta de matrículas. A emissão em lote é atômica e limitada no backend, sem `Promise.all` no navegador.
5. Histórico e reimpressão usam a versão do modelo e o snapshot originalmente emitidos, nunca o modelo vivo.

### Etapa 4 — Calendário de aulas

1. Criar query/RPC para turmas elegíveis por polo/modalidade e para payload do calendário, já ordenado/agrupado pelo servidor.
2. Criar filtro Modalidade → Turma e ação `Exportar calendário de aulas` no workspace de agenda, sem mudar as exportações CSV/ICS/PDF anuais existentes.
3. Criar renderizador A4 retrato isolado: cabeçalho institucional, marca-d’água, módulo/turma, tabela da referência e repetição de cabeçalho em novas páginas.
4. Quando não houver hora cadastrada, mostrar estado explícito “Horário não informado”; ao cadastrar horários na grade, o backend passa a devolver o horário oficial. Para EAD sem aulas datadas, mostrar orientação, não gerar grade fictícia.

### Etapa 5 — Cache, Realtime, testes e entrega do lote

1. Criar query-key factories hierárquicas por recurso, polo, modalidade, turma e revisão de modelo.
2. Invalidar somente modelo/emissão/grade afetados após mutation; assinar mudanças de grade apenas para a turma aberta e emitir evento mínimo por polo.
3. Testar autorização de polo, RLS, idempotência, validação QR/validade, snapshot/reimpressão, modalidade `SUPERIOR`, EAD sem grade, ausência de horário, lote e invalidações TanStack.
4. Executar build e testes focados uma vez ao final; revisar visualmente as páginas e os documentos gerados antes de qualquer commit/deploy.
5. Atualizar memória/RAG e os registros do lote apenas depois da verificação final, sem registrar conteúdo contratual ou PII.

## 6. Impacto mapeado

- **Modelos:** `ModelosDocumentosPage.tsx`, serviços compartilhados de variáveis/QR/validação e configuração de marca-d’água.
- **Secretaria:** `SecretariaPage.tsx`, `SecretariaDashboard.tsx`, `secretaria-access.ts`, histórico de emissões e os dois novos submódulos.
- **Calendário:** `AgendaWorkspace.tsx`, queries/tipos, `useTurmaGrade.ts` e novo domínio `exportacao-aulas`; o PDF anual permanece intacto.
- **Banco:** `documentos_templates`, `documentos_validacao`, políticas de validação, grade de turma e novo ledger de preceptor. Toda mudança passará por migration MCP, RLS e validação de segurança.
- **Performance:** sem varredura global de alunos/aulas; consultas iniciam em polo + modalidade + turma, páginas pesadas são lazy-loaded e lotes usam retorno único/canônico do backend.

## 7. Critérios de aceite

- Os três novos modelos aparecem em Modelos de Documentos e persistem versão com auditoria.
- Contrato técnico pode ser emitido individualmente, em lote ou personalizado, com QR e validade configuráveis; nenhuma condição financeira é calculada no frontend.
- Carteirinha de preceptor só lista professores autorizados do polo, tem QR/validade próprios e não altera registros de alunos.
- Os filtros do Calendário exibem Técnico, Livre, Especialização (`SUPERIOR`) e EAD; a exportação usa somente a grade real da turma, marca-d’água e layout tabular A4 retrato.
- Alterar grade, modelo ou emissão invalida apenas os dados pertinentes e a tela atualiza sem recarregar o projeto inteiro.
- Build, testes focados e validação de acesso/visual concluídos antes de publicação.

## 8. Garantia de PDF, evidência e fechamento

- A prévia, o download e a impressão de contratos, carteirinhas e calendário de aulas utilizam o mesmo Blob de PDF vetorial nativo. Não há pipeline de captura de DOM, canvas de página ou imagem A4 embutida.
- Texto, linhas, tabelas e marcações permanecem selecionáveis. Marca-d’água é fundo independente; QR Code e foto, quando presentes, são recursos isolados e não substituem a página.
- A inspeção do PDF de contrato confirmou A4 de uma página, texto extraível e somente o QR como imagem pontual. A inspeção do lote de carteirinhas confirmou A4 vetorial, texto extraível e QR Codes individuais, sem rasterização da página. O calendário confirmou A4 multipágina vetorial, texto extraível e zero imagem sem marca; quando há marca ou logotipo, eles entram como ativos isolados, nunca como página.
- O título do contrato recebeu posicionamento dinâmico antes do corpo; a prévia foi renderizada e revisada para evitar sobreposição. Se o servidor retornar conteúdo que exceda uma página física, a emissão falha fechada até que a RPC devolva páginas canônicas.
- O modelo técnico foi mantido em revisão até aprovação auditada deliberada. Os modelos Livre e Superior também ficam em revisão jurídica; o sistema não adapta cláusulas técnicas por inferência.
