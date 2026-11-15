# Professor: turma sugerida nas despesas e Pix opcional

Data: 15/11/2026. Classificação: mudança crítica de Financeiro e cadastro de parceiros.
Status: implementação e validação concluídas para entrega 4.8.343; conferência remota no PR do lote.

## Escopo e aceite

- Ao selecionar um credor do tipo Professor em nova despesa fixa ou variável, ativar Vincular a uma turma e sugerir a última turma usada em despesa desse professor no mesmo polo.
- Aceitar somente turma disponível na lista autorizada do formulário, com modalidade conhecida.
- Preservar a desativação e as escolhas manuais, inclusive enquanto a consulta estiver pendente ou for atualizada; consulta vazia ou com erro não impede lançar sem turma.
- Manter tipo e chave Pix opcionais no cadastro inicial e permitir cadastrar, alterar ou remover depois na aba Financeiro do perfil do professor.
- Preservar explicitamente o tipo Pix, sem inferir CPF ou telefone de chaves antigas sem tipo.
- Gravação posterior restrita aos campos Pix, respeitando a RLS existente de parceiros; sem alterar e-mail, acesso institucional, demais dados ou pagamentos.
- Nenhum PDF incluído: o usuário esclareceu que pretendia apenas chave Pix e tipo.

## Diagnóstico e implementação

- Cadastro inicial já oferecia os cinco tipos Pix e aceitava ambos os campos vazios; o mapper descartava o tipo porque faltava armazenamento no schema.
- Consulta estreita da última turma por polo, fornecedor, despesas fixas/variáveis não canceladas e não excluídas; ordenação created_at e id decrescentes.
- Hook com estado por polo/professor e proteção da intervenção manual; nenhuma regra financeira ou cálculo alterado.
- Editor posterior separado da atualização genérica do parceiro para evitar apagar campos ou iniciar rotinas de acesso institucional.
- Coluna opcional tipo_chave_pix, sem backfill ou nova permissão; RLS atual segue como autoridade de escrita.

## Validação

- 15/15 testes de serviço e interação da turma aprovados; revisão independente sem bloqueios.
- 17/17 testes do mapper aprovados, incluindo tipo explícito, campos vazios e chave legada sem tipo.
- Integração do perfil aprovada: espera cadastro completo, passa permissões e preserva dados ao mesclar o retorno parcial de Pix.
- Lint focado do automatismo e propagação de permissão aprovado.
- Smoke real no Safari com componentes de produto e dados sintéticos aprovado: Professor A ativa Sim e sugere turma A; Não limpa vínculo; Professor B reaplica Sim e turma B; Pix do tipo E-mail salva e exibe a chave de teste; remoção salva ambos vazios. As falhas anteriores de automação foram superadas sem trocar de navegador.
- Editor Pix: 11/11 testes interativos; serviço estreito: 7/7; cadastro inicial: 1/1; integração do perfil: 1/1.
- Migration `20261115044718_professor_optional_pix_key_type.sql` aplicada via MCP; coluna text nullable, constraints de tipo e presença de chave, sem dados retroativos. Hash de todas as chaves existentes, RLS e políticas de parceiros idênticos antes/depois.
- Nenhuma chave real de professor foi cadastrada ou alterada nesta entrega; ensaios usam dados sintéticos.
- 6/6 testes SQL isolados (PGlite) aprovados. Ensaio no banco real, com RLS e triggers ativos, aprovado: gestor autorizado grava e limpa somente Pix; filtro Professor, constraints, legado e demais colunas preservados; escrita anônima negada. ROLLBACK confirmado, com zero registros sintéticos restantes.
- A negativa Financeiro sem Parceiros foi exercida no teste isolado. Não havia gestor ativo com essa combinação para executar a negativa condicional real; nenhuma permissão nova foi criada.
- Entrega isolada sobre main 4.8.342; incremento paralelo de polos PF excluído do manifesto.
- ESLint focado em 17 arquivos e build completo com Node 24.22.1 aprovados. Conferência do teto de 500 linhas executada na entrega isolada. Checkout compartilhado mantém ausências de outros lotes, fora deste manifesto.
- Smoke autenticado da nova versão permanece pendente; smoke Safari dos componentes reais com dados sintéticos concluído.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/despesas-sugestoes.service.ts`
- `modules/gestor/financeiro/despesas/components/DespesaForm.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormAssociations.tsx`
- `modules/gestor/financeiro/despesas/hooks/useDespesaProfessorTurma.ts`
- `modules/gestor/financeiro/despesas/hooks/useDespesaProfessorTurma.interaction.test.mjs`
- `modules/gestor/financeiro/despesas/despesas-sugestoes.service.test.mjs`
- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx`
- `modules/gestor/parceiros/utils/parceiro-mappers.ts`
- `modules/gestor/parceiros/utils/parceiro-mappers.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-profile.interaction.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-08-versao-4-8-275.md`
- `modules/gestor/parceiros/components/viewparceiros/professor/ProfessorPixEditor.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ProfessorPixEditor.interaction.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-pix.service.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-pix.service.test.mjs`
- `supabase/migrations/20261115044718_professor_optional_pix_key_type.sql`
- `supabase/tests/professor_pix_optional_type.isolated.test.mjs`
- `supabase/tests/professor_pix_optional_type.production-rollback.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-15-professor-turma-pix-opcional.md`
- `ai/operacao/registros/alteracoes/2026-11-15-cartas-credito-categoria-fornecedores.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 26 arquivos.
