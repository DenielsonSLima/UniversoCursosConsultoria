# Crédito extra-classe em implantação legada — 09/11/2026

## Pedido e aceite

Corrigir as atividades anteriores ao ajuste de frequência sem apagar faltas, alterar notas, inventar ingresso acadêmico ou fechar diário. Mudança crítica restrita ao helper de elegibilidade acadêmica. Base main 6fae69a1d0fe5720aab3abe0072f4176776f657b, versão 4.8.279; candidata 4.8.280, revisão 289.

## Diagnóstico e regra

A implantação técnica criou vínculos depois das aulas. A regra anterior tratava esse timestamp como ingresso e o PENDENTE técnico como situação acadêmica, ignorando extras publicadas retroativas.

A exceção exige simultaneamente: movimento MATRÍCULA PENDENTE para ATIVO com origem IMPLANTACAO_LEGADA; matrícula da mesma turma; chamada individual datada da mesma oferta até a data da extra; e extra anterior ao ingresso técnico. Transferência externa de ingresso explícita impede a exceção. Não usar início da turma, nota, outra disciplina, cadastro tardio ou marcador isolado como prova.

Somente o movimento de ativação marcado é desconsiderado na busca do estado posterior. Movimentos reais, estado atual conservador, saídas e trancamentos continuam valendo. PENDENTE real na exceção exige liberação explícita não revogada. Preservados roster, histórico importado, aproveitamento, atividade publicada positiva e realizada, e chamada completa.

## Reprodução e abrangência

Simulação somente leitura em todas as ofertas com extras: 44 alunos, 13 aumentos de crédito e nenhuma redução. Na oferta legada, 12 alunos com chamada completa passam a contar 32h; outro com chamada parcial recebe apenas as 11h posteriores à primeira prova individual e continua sem resultado completo. Onze sem chamada permanecem sem crédito. A outra oferta de vinte alunos não muda.

Exemplo sintético reproduzido: 48h presenciais, 16h de faltas, 32h extras e nota 7 resultavam em 66,67%; com prova legada, 80% e aprovação. Nenhum dado pessoal consta neste registro ou nas fixtures.

## Manifesto explícito

- `.github/workflows/extra-class-attendance.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-09-extra-classe-legado-comprovado.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-10-versao-4-8-203.md`
- `internal/versioning/system-version.json`
- `supabase/migrations/20261109114644_extra_class_legacy_rollout_evidence.sql`
- `supabase/tests/diario_extra_classe.fixture.mjs`
- `supabase/tests/diario_extra_classe_legacy.isolated.test.mjs`

Total: 11 arquivos. Versão antiga 4.8.203 arquivada sem alterar seu texto para manter changelog abaixo de 500 linhas.

## Validação e limites

20 testes PostgreSQL isolados aprovados localmente, incluindo os 12 originais e oito novos. Cobrem três consumidores, ausência de nota/chamada, fronteiras temporais, estados reais, liberação pendente, roster, histórico, edição de carga/data, arquivo/restauração e repetição da migration. Metadados OID/owner/ACL/security/search_path e todos os registros sintéticos permaneceram idênticos no teste de substituição.

PGlite local 0.3.14 disponível no ambiente; CI usa a versão 0.5.8 fixada pelo workflow existente. Integração completa, snapshot e Preview serão conferidos no commit final antes da aplicação. A migração mantém assinatura e formato JSON, sem alterar interface, tabelas, permissões ou documentos assinados.

Smoke visual autenticado Safari pendente: Mac offline. A verificação SQL real é evidência separada e não substitui interação visual. Checkout local é seletivo; a CI executa build e verificações globais no checkout completo.

## Publicação e reversibilidade

Apenas uma função privada é substituída, em transação, por migration versionada via MCP Supabase. O arquivo anterior permanece imutável. Antes e depois, conferir hash/contagem dos dados acadêmicos, metadados da função e resultados efetivos. Se houver divergência inesperada, interromper; eventual rollback restaura a definição anterior em nova migration, sem apagar histórico.

GitHub e Supabase exclusivamente via MCP. Publicar somente este manifesto. Estado inicial: candidato preparado; nenhuma alteração remota de dados ou função executada.

