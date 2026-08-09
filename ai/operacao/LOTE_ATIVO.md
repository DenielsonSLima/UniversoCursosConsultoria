# Lote ativo

Estado: `PRONTO_PARA_PUBLICACAO`

## Lote: 2026-08-09-publicacao-consolidada-2-3-0-beta-2

- Estado: PRONTO_PARA_PUBLICACAO
- Objetivo: publicar, em uma única entrega atômica, todas as alterações locais concluídas e validadas da versão `2.3.0-beta.2`.
- Escopo incluído: operação/memória do projeto; Grade e Docente; Plano de Curso; cadastro e documentos eleitorais; Financeiro Técnico; Contrato do Aluno; Boletim; histórico e reimpressão de documentos; compatibilidade e remoção do rodapé institucional redundante da Pasta de Identificação; migrations, testes, versionamento e registros correspondentes.
- Fora de escopo: os arquivos brutos de referência `Documentos/MINUTA - CONTRATOS ALUNOS 2.pdf` e `Documentos/PlANO DE CURSO-T37- URGÊNCIA.docx`; artefatos de build, caches, merge, Vercel e produção.
- Critérios de aceite: a branch parte da `main` remota atual; cada commit atômico contém somente seu manifesto explícito; não há segredo, dado pessoal de teste, artefato regenerável ou referência bruta; a nova Preview Vercel precisa ficar `Ready` antes do merge; produção foi autorizada explicitamente pelo usuário em 2026-08-09.
- Validações focadas: TypeScript; build de produção; versão; contratos do Contrato/PDF; testes de operação; Grade/Docente; Plano de Curso; documentos eleitorais; Financeiro Técnico e migrations relacionadas.
- Publicação prevista: branch `agent/gestao-academica-financeira-documentos-20260809`, PR #62 e complemento final atômico com formulário técnico e cabeçalho institucional, exclusivamente via MCP GitHub; merge em `main` somente após Preview `Ready`.
- Responsável: Codex, consolidação individual.
- Riscos: o lote é amplo porque reúne trabalhos já concluídos no mesmo estado local; todos os caminhos serão publicados por manifesto explícito e os dois documentos-fonte permanecerão somente locais.
- Resultado da validação final: TypeScript, lint global e build aprovados; versão `2.3.0-beta.2` consistente; Contrato/PDF 44/44; hotfix focado da Pasta 20/20; domínios acadêmico, financeiro e documental 73/73; contrato operacional aprovado; exportações oficiais sem novo pipeline raster. O modelo remoto da Pasta foi confirmado em `v14`, sem `pasta_rodape`; snapshots históricos permanecem imutáveis e têm somente o rodapé institucional conhecido removido da cópia renderizada. O lint global revelou e teve removidos dois imports sem uso e duas declarações duplicadas preexistentes.

## Complemento: hotfix da geometria da Pasta de Identificação

- Causa: o hotfix anterior corrigiu a leitura do nome do modelo na RPC, mas a primeira emissão válida expôs um snapshot legado com `pasta_rodape` em `y=1013`, sem altura explícita, fora da área canônica A4.
- Correção: novas emissões usam o modelo `v13`, com rodapé em `y=930` e altura `100`; snapshots `v<=12` com a assinatura legada exata são normalizados somente em memória antes da composição, sem regravar histórico.
- Supabase: migration local `20260809200000_fix_pasta_identificacao_footer_geometry.sql` aplicada por MCP como `20260809200839_fix_pasta_identificacao_footer_geometry`; verificação remota confirmou o modelo atual e preservou o snapshot histórico `v9`, `y=1013`, sem altura.
- Manifesto incremental: `modules/gestor/cadastros/ficha-matricula/{document-layouts.ts,pasta-template-geometry.ts}`; `modules/gestor/secretaria/historico-emissoes/{historico-emissoes.service.ts,emission-document.pdf.contract.test.ts}`; `modules/gestor/secretaria/shared/student-registration-fields.contract.test.ts`; `supabase/migrations/20260809200000_fix_pasta_identificacao_footer_geometry.sql`; `supabase/tests/student_registration_pasta_footer_geometry.contract.test.ts`; este lote e os registros operacionais do hotfix.
- Validação: 41/41 contratos documentais, 5/5 contratos específicos, TypeScript e ESLint focado aprovados; PDF A4 vetorial renderizado com Poppler, texto extraível e rodapé sem recorte. O navegador controlável permaneceu indisponível, portanto o clique autenticado final fica pendente para o usuário após recarregar o localhost.

## Complemento: remoção do rodapé institucional redundante

- Causa: após a emissão voltar a funcionar, o smoke do usuário mostrou que `pasta_rodape` repetia nome, CNPJ, endereço, telefone e e-mail já exibidos no cabeçalho institucional canônico.
- Correção: o template padrão passou para `v14` sem `pasta_rodape`; modelos e snapshots `v<=13` perdem somente a assinatura institucional redundante exata na cópia renderizada. Rodapé personalizado ou geometria desconhecida permanece intacto e bloqueia a migration em vez de ser apagado.
- Supabase: migration local `20260809202500_remove_redundant_pasta_identificacao_footer.sql` aplicada por MCP como `20260809202910_remove_redundant_pasta_identificacao_footer`. O modelo atual foi verificado em `v14`, com zero rodapés; o snapshot histórico mais recente permaneceu em `v10`, com seu campo original em `y=1000`.
- Manifesto incremental adicional: `modules/gestor/cadastros/ficha-matricula/{document-layouts.ts,pasta-template-geometry.ts}`; `modules/gestor/secretaria/historico-emissoes/{historico-emissoes.service.ts,emission-document.pdf.contract.test.ts}`; `modules/gestor/secretaria/shared/student-registration-fields.contract.test.ts`; `supabase/migrations/20260809202500_remove_redundant_pasta_identificacao_footer.sql`; `supabase/tests/student_registration_pasta_redundant_footer.contract.test.ts`; este lote e os registros do complemento.
- Validação: Contrato/PDF 44/44, foco do complemento 20/20, TypeScript e ESLint aprovados. O PDF A4 renderizado contém a identidade institucional uma única vez, no cabeçalho, sem texto duplicado na faixa inferior e sem rasterização A4.

## Complemento: formulário em etapas da nova turma técnica

- Estado: PRONTO_PARA_PUBLICACAO.
- Causa: o modal de criação concentrava todos os dados em uma única rolagem e ainda enviava somente parte da regra financeira flexível já aceita pelo backend.
- Correção: o formulário foi isolado em pasta própria e dividido em quatro etapas — turma, inscrições, financeiro e revisão. A etapa financeira agora coleta matrícula opcional, mensalidades, rematrícula opcional, desconto, juros, multa, vencimento, incidência por tipo de título e instrução do boleto/carnê.
- Matrícula opcional: `cobrarMatricula` nasce habilitado como padrão atual, mas pode ser desligado na criação. Nesse caso nenhum título inicial integra o plano; a regra continua editável depois no Financeiro da turma.
- Contrato financeiro: a criação persiste toda a intenção da regra flexível e mantém validação, cronograma e cálculos monetários no backend canônico; não cria aluno, título ou cobrança em gateway no navegador.
- Supabase: nenhuma migration ou operação remota foi necessária; a mudança utiliza as colunas e o gatilho canônico já existentes.
- Manifesto incremental: `modules/gestor/gestao/components/forms/TechnicalEnrollmentSettings.tsx`; `modules/gestor/gestao/components/forms/turma-tecnico/*`; `modules/gestor/gestao/{gestao.mappers.ts,gestao.service.ts,gestao.types.ts}`; `modules/gestor/gestao/tecnicos/{GestaoTecnicos.tsx,detalhes/components/financeiro/matricula-tecnica-financeiro.contract.test.ts}`; `scripts/test-technical-financial-cycle.mjs`; este lote e o registro operacional correspondente.
- Validação: contratos focados aprovados, TypeScript global, lint global e build aprovados. O Safari autenticado confirmou modal, stepper de quatro etapas, seleção de curso/polo e bloqueio de avanço com calendário incompleto; nenhuma turma foi criada.

## Complemento: cabeçalho institucional único

- Estado: PRONTO_PARA_PUBLICACAO.
- Resultado: Relatórios, documentos elegíveis da Secretaria, Caixa, Financeiro e Parceiros passaram a compartilhar o mesmo modelo institucional, com três linhas por coluna, e-mail oficial protegido, dados dinâmicos de matriz/polo e metadados em faixa fixa.
- Marca-d'água: a prévia somente leitura em Modelos de Documentos carrega a configuração da unidade em retrato e paisagem; na ausência de arte paisagem, herda integralmente arte, rotação, escala e opacidade do retrato.
- Escopo preservado: diários, certificados, boleto, carnê, carteirinha estudantil, preceptor, SES, crachás e boletim informativo de Parceiros permanecem fora; nenhum snapshot, RPC, schema, RLS ou histórico foi alterado por este complemento.
- Manifesto principal: `modules/gestor/components/{DocumentHeader.tsx,institutional-header.model.ts}`; `modules/gestor/secretaria/shared/canonical-institutional-header-pdf.ts`; Caixa; consumidores de Relatórios/Financeiro/Parceiros; prévia em `modelos-documentos/cabecalho-institucional`; testes contratuais e script `test:institutional-header`.
- Validação: cabeçalho 7/7, Caixa 21/21, contratos 44/44, exportações vetoriais aprovadas, TypeScript, lint global, build, Poppler e revisão independente sem achados críticos/importantes. Smoke autenticado no Safari confirmou matriz, selo, seis linhas, e-mail oficial e faixa de metadados; nenhuma gravação remota ocorreu.
