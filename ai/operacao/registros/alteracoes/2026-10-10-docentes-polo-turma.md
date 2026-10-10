# Docentes pelo polo da turma

Correção solicitada em 10/10/2026 após o modal de docentes mostrar 12 professores e o cadastro da unidade mostrar 3. Entrega 4.8.203, revisão 212, com análise em três frentes e publicação dentro da autorização vigente.

## Causa e aceite

A grade consultava todos os parceiros Professor/ATIVO. O cadastro filtrava pela união de polo_id e polo_ids da unidade. Consulta agregada em produção confirmou 12 ativos no total, 3 elegíveis em Japoatã e 10 em Aquidabã, incluindo um vínculo multipolo. Não havia nomes simulados no caminho.

O serviço agora consulta o polo real da turma sob RLS e usa o mesmo filtro do cadastro. Falha de consulta, turma ausente ou polo não definido não podem liberar a lista global. Atribuições já armazenadas continuam visíveis mesmo fora das novas opções.

A migration adiciona uma função privada e um trigger AFTER para validar somente novas associações docente/turma/disciplina técnicas. Aceita polo principal ou vínculo adicional; remoção e retenção de vínculo existente continuam permitidas. O timing AFTER preserva o ramo UPDATE do upsert, que dispara BEFORE INSERT antes de detectar conflito. Autorizações, RLS, status ativo, controles acadêmicos e contratos das outras modalidades permanecem em suas funções atuais.

## Validação

Reprodução anterior: os três testes novos do serviço falharam. Com a correção, oito testes de serviço/sincronização passaram, assim como lint focado. Revisão independente confirmou filtro, multipolo, retenção e contrato do trigger. PGlite 0.3.16: três testes aprovados com as RPCs canônicas, cobrindo o defeito anterior, a regra nova e a falha de BEFORE no upsert legado. O harness simula somente a autorização de operação, sem substituir a validação visual ou de RLS. TypeScript e build aprovados; os testes passam a executar no CI. Uma verificação antiga de atividades delimitava sua consulta pela posição da consulta de professores; o recorte agora termina no próprio filtro de turma. Os 19 testes de atividades passaram após esse ajuste.

Produção consultada antes do patch: 12 turmas técnicas, nenhuma sem polo; 14 vínculos docentes existentes, nenhum fora do escopo. Nenhum cadastro real será removido ou criado para testar. O teste SQL usa somente fixtures sintéticas e rollback no ambiente isolado.

Migration aplicada via MCP como `20261010155632_technical_teacher_polo_scope`; trigger AFTER e função privada com search_path vazio, sem EXECUTE para anon/authenticated, conferidos no banco. Os 14 vínculos anteriores permanecem.

Conferência visual pendente com o usuário, conforme orientação anterior. O acesso ao Safari foi recusado pela revisão automática por possível interferência com outra automação.

## Manifesto explícito

Total: 12 arquivos.

- `modules/gestor/gestao/tecnicos/detalhes/turma-grade.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/turma-grade-professores.service.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.test.mjs`
- `supabase/migrations/20261010210000_technical_teacher_polo_scope.sql`
- `supabase/tests/technical_teacher_polo_scope.rollback.sql`
- `supabase/tests/technical_teacher_polo_scope.isolated.test.mjs`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-10-docentes-polo-turma.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
