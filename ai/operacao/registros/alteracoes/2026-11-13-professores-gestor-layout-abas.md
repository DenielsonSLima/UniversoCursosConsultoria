# Professores no Gestor: visual compacto e abas funcionais

Data: 13/11/2026 (America/Maceio).
Classificação: mudança crítica (Supabase/Storage e leitura financeira).
Status: implementação local validada e consolidada na PR #429. As três migrations desta frente foram aplicadas pelo MCP em 14/11/2026, com pós-checagem remota de permissões aprovada; publicação ainda sem conclusão registrada.

## Pedido e aceite

Reformular cadastro e perfil do professor no acesso Gestor conforme o padrão compacto aprovado e desenvolver as abas Turmas/Disciplinas, Documentos e Financeiro mostradas nas capturas.
Aceite funcional: preservar campos e ações; retirar placeholders; exibir vínculos reais, dossiê privado e lançamentos vinculados; respeitar identidade, polo e permissões.
Teste visual Safari foi explicitamente adiado pelo usuário nesta conversa. Essa conferência permanece pendente.
Na etapa inicial, produção não foi solicitada. A publicação foi posteriormente autorizada na PR #429 e é acompanhada no registro `2026-11-13-professor-portal-mobile.md`.

## Implementação

- Cadastro e Dados compactos, navegação por linha inferior e seletores próprios pesquisáveis.
- Correção local dos aliases de nome, telefone, UF e unidade no payload já existente.
- Perfil aguarda hidratação completa antes de permitir edição e isola o cache pelo contexto do gestor.
- Turmas: ID exato do professor, RLS existente, pesquisa por nome da turma, conclusão e paginação no servidor. Não concluída não presume disciplina em andamento.
- Documentos: solicitações explícitas, envio PDF/imagem, versões imutáveis, prévia privada e revisão com histórico. Não presume checklist obrigatório nem altera elegibilidade acadêmica.
- Financeiro: leitura do ID/polo exatos, fontes autorizadas e paginação/contagem no banco. Não cria cobranças nem realiza baixas.

## Manifesto explícito

- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorTurmas.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-turmas.service.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-profile.css`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-turmas.service.test.mjs`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ParceiroProfessorForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorPersonalStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/professor-registration.css`
- `modules/gestor/parceiros/components/formularioparceiros/professor/professor-form.interaction.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDados.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-dados.css`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-dados.interaction.test.mjs`
- `modules/gestor/parceiros/partner-email-update.interaction.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-profile.interaction.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorFinanceiro.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-financeiro.query.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-financeiro.query.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDocumentos.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ProfessorDocumentoDialog.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ProfessorDocumentoCard.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ProfessorDocumentoForms.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-documentos.presentation.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-documentos.service.ts`
- `supabase/migrations/20261114033433_professor_private_dossier_schema.sql`
- `supabase/migrations/20261114033440_professor_private_dossier_rpc.sql`
- `supabase/migrations/20261114033449_professor_gestor_financeiro_read.sql`
- `supabase/tests/professor_private_dossier.fixture.ts`
- `supabase/tests/professor_private_dossier.isolated.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-13-professores-gestor-layout-abas.md`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-documentos.service.test.mjs`
- `supabase/tests/professor_gestor_financeiro.isolated.test.mjs`

Total: 35 arquivos.

## Validação e limites

- Capturas do usuário e componentes reais confirmaram visual antigo e três placeholders.
- Testes de interação do cadastro, Dados, hidratação e consulta de vínculos aprovados; e-mail pendente preservado.
- Migrations reais executadas em PostgreSQL isolado (PGlite), sem efeito remoto. Dossiê: 1 ensaio/6 etapas; financeiro incluído nos 22 testes Node aprovados.
- Alvo MCP conferido: kfekgwyqozhicpfuunpo. Ledger recente consultado somente para leitura.
- TypeScript completo, build Node 24.22.1, ESLint dos arquivos do lote e gate de 500 linhas aprovados. Manifesto com 35 arquivos, nenhum acima do teto.
- Revisão independente concluída: recuperação de confirmação ambígua do envio e barreiras Storage para anon corrigidas e testadas; nenhuma pendência de código identificada nessa revisão.
- Cabeçalho/abas mantêm navegação por teclado; o perfil bloqueia edição durante hidratação para evitar sobrescrever campos ausentes no resumo.
- Histórico é fechado ao abrir prévia de documento para evitar sobreposição de modais e retenção de bloqueio de rolagem.
- Sem smoke autenticado ou confirmação visual desktop/móvel nesta etapa por adiamento explícito do usuário.
- Alterações prévias no checkout foram preservadas; o manifesto delimita os arquivos desta entrega, sem sincronização ampla.
- Lote operacional anterior continua documentado em `2026-11-13-sincronizacao-fontes-publicadas.md`.

## Reprodução dos ensaios

- Testes Node: cadastro/modelo, Dados, perfil/hidratação, vínculos, e-mail pendente, serviço Documentos e query Financeiro, além de `supabase/tests/professor_gestor_financeiro.isolated.test.mjs`: 22 aprovados.
- PGlite Node usa `PGLITE_MODULE_PATH` apontando para instalação local do pacote; nesta máquina: `tmp/lgpd-test-runtime/node_modules/@electric-sql/pglite`.
- Dossiê: `deno test --config /tmp/professor-dossier-deno.json --allow-read supabase/tests/professor_private_dossier.isolated.test.ts`; config temporária reproduzível: `{"nodeModulesDir":"none","lock":false}`.
- JSDOM dos testes React usa instalação local configurável por `NFSE_TEST_JSDOM_MODULE`, conforme o harness existente do projeto.
- Artefatos gerados de build, caches e ensaios em tmp não integram o manifesto.

## Retomada

1. Conferir cadastro, edição, cinco abas e seletores no Safari desktop/móvel; usuário adiou esta etapa.
2. As três migrations foram aplicadas no lote consolidado com versões reais `20261114033433`, `20261114033440` e `20261114033449`; não reaplicar. Mapeamento e hashes preservados no registro do portal.
3. Publicar somente o manifesto por MCP GitHub/Supabase, validar RPCs e Storage autenticados e conferir o deploy associado.
