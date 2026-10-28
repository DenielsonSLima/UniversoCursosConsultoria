# Catálogo EAD: alinhamento e investigação da tela branca
Data: 27/10/2026. Estado: CONCLUÍDO — entrega 4.8.242; smoke móvel permanece pendente.

## Pedido e aceite
O usuário ampliou a revisão para os outros cursos EAD, pediu a retomada dos três agentes, correção e rastreamento da tela branca. A autorização anterior de publicação integra a mesma entrega EAD. As capturas indicam prova final antiga, seguida de centro vazio com cabeçalho e navegação preservados; isso não demonstra sozinho a causa técnica.

- Conferir os 61 cursos restantes, com matriz entre ensino, prática, atividade e avaliação e pesquisa de fontes primárias.
- Substituir conteúdos e avaliações inadequados por itens próprios sustentados pelas aulas; preservar material válido.
- Manter gabaritos e resoluções fora do repositório público e do catálogo antes da resposta.
- Preservar versões anteriores, progresso, notas e certificados, com troca explícita do aluno.
- Corrigir somente causas demonstradas da interface e registrar limites da reprodução móvel.
- NR-10, máquinas e transporte escolar são cursos livres teóricos, com limite explícito: finalidade confirmada pelo usuário em resposta durante esta revisão; não comprovam prática nem habilitação profissional.
- Banco exclusivamente MCP Supabase; GitHub exclusivamente MCP; manifesto explícito e validação proporcional antes da publicação.

## Diagnóstico e etapas
1. Snapshot privado em tmp: 63 cursos EAD ativos; dois já revisados, 61 nesta etapa. Sem dados de alunos no snapshot de conteúdo.
2. Triagem estrutural: 352 aulas, 262 com marcador de template; 444/610 questões genéricas ou fallback. As flags não substituem revisão pedagógica.
3. Frentes independentes: catálogo A (Acolhimento até Excel Kids), catálogo B (Fiscal de Loja até Word Kids, exceto duas matemáticas publicadas), investigação de resposta/rolagem/renderização.
4. Autoria e reunião concluídas: 58 percursos novos, 292 aulas e 876 itens; três preservados, 24 aulas e 42 itens. Total: 61 cursos, 316 aulas e 918 itens, sem dupla contagem.

## Evidência e limites
- Dez seleções na prova e uma atividade com RPC sintética não reproduziram exceção ou loop React.
- Safari estava sendo usado simultaneamente pelo usuário; tentativas do agente sofreram troca de app/janela. Nova tentativa da raiz falhou ao iniciar o canal nativo. Isso não equivale a smoke móvel autenticado.
- O usuário confirmou que o aluno ainda não testou após atualizar. A tela branca não pode ser declarada resolvida. A alteração de rádio corrige sua área de foco nativa; a relação causal com a captura Android permanece sem confirmação.
- Importador antigo produz textos e perguntas por templates e tags; não será executado nem autorizado a sobrescrever revisões protegidas.
- Base remota atual 332f4c7807763d34c9bda19c5659b6fea0d00528 inclui entrega financeira 4.8.241, fora deste manifesto.

## Reunião e revisão independente

A autoria foi dividida em A, B, C e coordenação, com leitura por outra frente. A raiz leu integralmente nove cursos novos: Gestão Escolar, Educação Física Escolar, Mudanças da Sociedade, Metodologias Ativas, Matemática EJA, Matemática Infantil, Mediador, Monitor de Classe e Oficineiro (45 aulas e 135 itens). Resolveu os itens antes de comparar as posições privadas. O terceiro agente revisou os demais cursos; nenhum autor aprovou a própria proposta como leitura independente.

A reunião rejeitou a primeira generalização excessiva de EJA/Infantil e corrigiu a atribuição docente em material para apoio escolar. Também exigiu contexto próprio em Oficineiro, Telemarketing e Porteiro/Vigia. Após a redistribuição, raiz reescreveu três unidades dos dois últimos e o terceiro agente releu; ele reescreveu três de Oficineiro, relidas pela raiz. IDs, horas e posições de resposta foram mantidos onde a mudança era de contexto; as explicações privadas acompanharam os novos casos.

Fontes institucionais foram efetivamente pesquisadas e seus limites de acesso registrados nos seis relatórios. A raiz conferiu adicionalmente BNCC, LDB, Inep sobre apoio/AEE e laudo, UNESCO/GEM e Iphan. Endereço bibliográfico ou texto indexado não foi apresentado como leitura integral de PDF indisponível. Não se afirma revisão dos vídeos antigos nem prática profissional inexistente.

## Rastreio da tela branca

Na janela correspondente ao horário aproximado das capturas, a consulta de logs encontrou respostas HTTP 200 dos getters e do catálogo e nenhuma chamada de mutação de progresso. Isso não identifica a sessão do aluno e não prova causa. Selecionar a alternativa é uma ação local antes do envio. O cabeçalho e a navegação permanecerem visíveis também não demonstram falha de autenticação ou do banco.

O rádio antigo oculto tinha alvo nativo de foco de um pixel sem ancoragem no retângulo visível. O componente compartilhado passa a manter foco e seleção dentro da alternativa, preservando índices originais, rótulo acessível e estado desabilitado. Quatro testes DOM/CSS verificam essa geometria e o comportamento nas duas avaliações. Não se atribui a esse defeito, sem reprodução móvel, a causa definitiva da captura Android.

## Validação e publicação

- 60 testes focados passaram: 49 de interação/feedback/revisões anteriores, oito de catálogo/publicação completa e três de proteção dos legados. O teste nativo percorreu os 58 pacotes com as 876 chaves reais em PostgreSQL isolado, preservou a versão anterior e submeteu atividades e provas sem usar alunos reais.
- A primeira execução final detectou uma explicação privada de Eletricista insuficiente; ela foi ampliada e relida independentemente antes da geração/aplicação. A nova execução passou integralmente.
- Build com Node 24.22.1, TypeScript e ESLint dos arquivos de implementação passaram. O manifesto tem 208 arquivos existentes e nenhum acima de 500 linhas; o máximo é 453.
- O comando global de linhas foi executado, mas a cópia local incompleta não contém 36 caminhos históricos da base remota, fora do lote. Nenhum foi alterado para ocultar a ausência. A checagem completa da árvore GitHub permanece critério de merge; o manifesto atual foi conferido integralmente.
- Treze migrations publicaram os 58 cursos e os sete vínculos. O readback revelou 20 explicações antecipadas em dois legados; uma 14ª migration, com três testes adicionais e revisão independente, registrou somente o currículo legado atual e reservou as explicações sem trocar perguntas ou atualizar progresso.
- Readback MCP: 58 hashes de fontes e todas as contagens/snapshots corretos; 876 índices e explicações privados idênticos aos pacotes revisados; três configurações preservadas exatamente com os ajustes autorizados; duas matemáticas anteriores com hashes intactos. Nos 63 cursos não há índice correto nem explicação de avaliação no catálogo. A reserva privada terminou vazia.
- As transações verificaram a preservação de progresso, notas, tentativas, certificados e tipos JSON dos cofres. A operação complementar não executa UPDATE de progresso. Papéis anon, authenticated e service_role não leem os cofres/pacotes diretamente.
- Prefixo local 202610280041 é exclusivo. O preparador recusa sobrescrita; uma tentativa de replay foi recusada sem mudar as 13 fontes. Migrations aplicadas permanecem imutáveis.
- Entrega web 4.8.242 sobre a base 4.8.241, em commit atômico com somente o manifesto abaixo. CI e Preview Vercel são conferidos antes do merge autorizado. O resultado de deployment é verificável no SHA e nos checks da PR.

Identificadores remotos das migrations aplicadas via MCP:

- `20261028004457` — `publish_ead_catalog_batch_00`
- `20261028004515` — `publish_ead_catalog_batch_01`
- `20261028004520` — `publish_ead_catalog_batch_02`
- `20261028004524` — `publish_ead_catalog_batch_03`
- `20261028004529` — `publish_ead_catalog_batch_04`
- `20261028004538` — `publish_ead_catalog_batch_05`
- `20261028004543` — `publish_ead_catalog_batch_06`
- `20261028004549` — `publish_ead_catalog_batch_07`
- `20261028004553` — `publish_ead_catalog_batch_08`
- `20261028004604` — `publish_ead_catalog_batch_09`
- `20261028004609` — `publish_ead_catalog_batch_10`
- `20261028004614` — `publish_ead_catalog_batch_11`
- `20261028004616` — `align_preserved_ead_activities`
- `20261028005216` — `protect_preserved_ead_feedback`

## Ajuste demonstrado no ambiente de CI

A primeira Preview ficou READY e o novo workflow do catálogo passou. A checagem
remota completa de linhas, TypeScript e lint também passou, resolvendo a
limitação da cópia local. Três jobs existentes falharam antes dos testes de
navegador: ubuntu-latest selecionou Ubuntu 26.04, não suportado pelos pacotes
Playwright fixados em 1.58.2 e 1.56.1. Os logs registraram explicitamente o erro.

Somente runs-on de student-registration-login, class-financial-statement e
ead-automatic-certificate foi fixado em ubuntu-24.04. Não se alteraram testes,
dependências ou código desses domínios. A compatibilidade 24.04 foi conferida
no código oficial do Playwright 1.58.2, hostPlatform.ts, via MCP GitHub. O
candidato é substituído atomicamente para manter um commit final; os checks e
a Preview do novo SHA devem passar antes do merge. As migrations já aplicadas
não são reexecutadas nem modificadas.

## Manifesto explícito

- `.github/workflows/class-financial-statement.yml`
- `.github/workflows/ead-automatic-certificate.yml`
- `.github/workflows/ead-catalog-revision.yml`
- `.github/workflows/student-registration-login.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-ead-catalogo-alinhamento-tela-branca.md`
- `content/ead/catalogo-a/acolhimento.mjs`
- `content/ead/catalogo-a/agente-comunitario-saude.mjs`
- `content/ead/catalogo-a/agente-portaria.mjs`
- `content/ead/catalogo-a/almoxarifado.mjs`
- `content/ead/catalogo-a/analises-clinicas.mjs`
- `content/ead/catalogo-a/atendente-farmacia.mjs`
- `content/ead/catalogo-a/auxiliar-corretor.mjs`
- `content/ead/catalogo-a/auxiliar-cozinha.mjs`
- `content/ead/catalogo-a/auxiliar-creche.mjs`
- `content/ead/catalogo-a/auxiliar-pedagogico.mjs`
- `content/ead/catalogo-a/auxiliar-veterinario.mjs`
- `content/ead/catalogo-a/barbeiro.mjs`
- `content/ead/catalogo-a/cilios-sobrancelha.mjs`
- `content/ead/catalogo-a/conhecimentos-bancarios.mjs`
- `content/ead/catalogo-a/consultorio-medico.mjs`
- `content/ead/catalogo-a/cuidador-idoso.mjs`
- `content/ead/catalogo-a/educacao-inclusiva.mjs`
- `content/ead/catalogo-a/educacao-interdimensional.mjs`
- `content/ead/catalogo-a/educacao-social-adolescencia.mjs`
- `content/ead/catalogo-a/eletricista.mjs`
- `content/ead/catalogo-a/estoque-faturamento.mjs`
- `content/ead/catalogo-a/format.mjs`
- `content/ead/catalogo-a/index.mjs`
- `content/ead/catalogo-a/loja-virtual.mjs`
- `content/ead/catalogo-a/radiologia.mjs`
- `content/ead/catalogo-a/transporte-escolar.mjs`
- `content/ead/catalogo-b/fiscal-de-loja/assessments.mjs`
- `content/ead/catalogo-b/fiscal-de-loja/index.mjs`
- `content/ead/catalogo-b/fiscal-de-loja/lessons.mjs`
- `content/ead/catalogo-b/fiscal-de-loja/sources.mjs`
- `content/ead/catalogo-b/frentista/assessments.mjs`
- `content/ead/catalogo-b/frentista/index.mjs`
- `content/ead/catalogo-b/frentista/lessons.mjs`
- `content/ead/catalogo-b/frentista/sources.mjs`
- `content/ead/catalogo-b/gestao-em-rh/assessments.mjs`
- `content/ead/catalogo-b/gestao-em-rh/index.mjs`
- `content/ead/catalogo-b/gestao-em-rh/lessons.mjs`
- `content/ead/catalogo-b/gestao-em-rh/sources.mjs`
- `content/ead/catalogo-b/instagram-para-vendas/assessments.mjs`
- `content/ead/catalogo-b/instagram-para-vendas/index.mjs`
- `content/ead/catalogo-b/instagram-para-vendas/lessons.mjs`
- `content/ead/catalogo-b/instagram-para-vendas/sources.mjs`
- `content/ead/catalogo-b/introducao-a-nutricao/assessments.mjs`
- `content/ead/catalogo-b/introducao-a-nutricao/index.mjs`
- `content/ead/catalogo-b/introducao-a-nutricao/lessons.mjs`
- `content/ead/catalogo-b/introducao-a-nutricao/sources.mjs`
- `content/ead/catalogo-b/logistica-4-0/assessments.mjs`
- `content/ead/catalogo-b/logistica-4-0/index.mjs`
- `content/ead/catalogo-b/logistica-4-0/lessons.mjs`
- `content/ead/catalogo-b/logistica-4-0/sources.mjs`
- `content/ead/catalogo-b/manicure-e-pedicure/assessments.mjs`
- `content/ead/catalogo-b/manicure-e-pedicure/index.mjs`
- `content/ead/catalogo-b/manicure-e-pedicure/lessons.mjs`
- `content/ead/catalogo-b/manicure-e-pedicure/sources.mjs`
- `content/ead/catalogo-b/marketing-digital/assessments.mjs`
- `content/ead/catalogo-b/marketing-digital/index.mjs`
- `content/ead/catalogo-b/marketing-digital/lessons.mjs`
- `content/ead/catalogo-b/marketing-digital/sources.mjs`
- `content/ead/catalogo-b/matematica-eja/assessments.mjs`
- `content/ead/catalogo-b/matematica-eja/index.mjs`
- `content/ead/catalogo-b/matematica-eja/lessons.mjs`
- `content/ead/catalogo-b/matematica-eja/sources.mjs`
- `content/ead/catalogo-b/matematica-infantil/assessments.mjs`
- `content/ead/catalogo-b/matematica-infantil/index.mjs`
- `content/ead/catalogo-b/matematica-infantil/lessons.mjs`
- `content/ead/catalogo-b/matematica-infantil/sources.mjs`
- `content/ead/catalogo-b/mediador-escolar-monitor-escolar/assessments.mjs`
- `content/ead/catalogo-b/mediador-escolar-monitor-escolar/index.mjs`
- `content/ead/catalogo-b/mediador-escolar-monitor-escolar/lessons.mjs`
- `content/ead/catalogo-b/mediador-escolar-monitor-escolar/sources.mjs`
- `content/ead/catalogo-b/metodologias-ativas-para-o-professor/assessments.mjs`
- `content/ead/catalogo-b/metodologias-ativas-para-o-professor/index.mjs`
- `content/ead/catalogo-b/metodologias-ativas-para-o-professor/lessons.mjs`
- `content/ead/catalogo-b/metodologias-ativas-para-o-professor/sources.mjs`
- `content/ead/catalogo-b/monitor-escolar-de-classe-auxiliar-do-regente/assessments.mjs`
- `content/ead/catalogo-b/monitor-escolar-de-classe-auxiliar-do-regente/index.mjs`
- `content/ead/catalogo-b/monitor-escolar-de-classe-auxiliar-do-regente/lessons.mjs`
- `content/ead/catalogo-b/monitor-escolar-de-classe-auxiliar-do-regente/sources.mjs`
- `content/ead/catalogo-b/nr-10/assessments.mjs`
- `content/ead/catalogo-b/nr-10/index.mjs`
- `content/ead/catalogo-b/nr-10/lessons.mjs`
- `content/ead/catalogo-b/nr-10/sources.mjs`
- `content/ead/catalogo-b/oficineiro/assessments.mjs`
- `content/ead/catalogo-b/oficineiro/index.mjs`
- `content/ead/catalogo-b/oficineiro/lessons.mjs`
- `content/ead/catalogo-b/oficineiro/sources.mjs`
- `content/ead/catalogo-b/operador-de-caixa/assessments.mjs`
- `content/ead/catalogo-b/operador-de-caixa/index.mjs`
- `content/ead/catalogo-b/operador-de-caixa/lessons.mjs`
- `content/ead/catalogo-b/operador-de-caixa/sources.mjs`
- `content/ead/catalogo-b/operador-de-empilhadeira/assessments.mjs`
- `content/ead/catalogo-b/operador-de-empilhadeira/index.mjs`
- `content/ead/catalogo-b/operador-de-empilhadeira/lessons.mjs`
- `content/ead/catalogo-b/operador-de-empilhadeira/sources.mjs`
- `content/ead/catalogo-b/oratoria/assessments.mjs`
- `content/ead/catalogo-b/oratoria/index.mjs`
- `content/ead/catalogo-b/oratoria/lessons.mjs`
- `content/ead/catalogo-b/oratoria/sources.mjs`
- `content/ead/catalogo-b/pa-carregadeira/assessments.mjs`
- `content/ead/catalogo-b/pa-carregadeira/index.mjs`
- `content/ead/catalogo-b/pa-carregadeira/lessons.mjs`
- `content/ead/catalogo-b/pa-carregadeira/sources.mjs`
- `content/ead/catalogo-b/porteiro-e-vigia/assessments.mjs`
- `content/ead/catalogo-b/porteiro-e-vigia/index.mjs`
- `content/ead/catalogo-b/porteiro-e-vigia/lessons.mjs`
- `content/ead/catalogo-b/porteiro-e-vigia/sources.mjs`
- `content/ead/catalogo-b/redes-sociais/assessments.mjs`
- `content/ead/catalogo-b/redes-sociais/index.mjs`
- `content/ead/catalogo-b/redes-sociais/lessons.mjs`
- `content/ead/catalogo-b/redes-sociais/sources.mjs`
- `content/ead/catalogo-b/retroescavadeira/assessments.mjs`
- `content/ead/catalogo-b/retroescavadeira/index.mjs`
- `content/ead/catalogo-b/retroescavadeira/lessons.mjs`
- `content/ead/catalogo-b/retroescavadeira/sources.mjs`
- `content/ead/catalogo-b/secretariado-escolar/assessments.mjs`
- `content/ead/catalogo-b/secretariado-escolar/index.mjs`
- `content/ead/catalogo-b/secretariado-escolar/lessons.mjs`
- `content/ead/catalogo-b/secretariado-escolar/sources.mjs`
- `content/ead/catalogo-b/servicos-sociais-basico/assessments.mjs`
- `content/ead/catalogo-b/servicos-sociais-basico/index.mjs`
- `content/ead/catalogo-b/servicos-sociais-basico/lessons.mjs`
- `content/ead/catalogo-b/servicos-sociais-basico/sources.mjs`
- `content/ead/catalogo-b/telemarketing/assessments.mjs`
- `content/ead/catalogo-b/telemarketing/index.mjs`
- `content/ead/catalogo-b/telemarketing/lessons.mjs`
- `content/ead/catalogo-b/telemarketing/sources.mjs`
- `content/ead/catalogo-c/educacao-e-gestao-escolar/assessments.mjs`
- `content/ead/catalogo-c/educacao-e-gestao-escolar/index.mjs`
- `content/ead/catalogo-c/educacao-e-gestao-escolar/lessons.mjs`
- `content/ead/catalogo-c/educacao-e-gestao-escolar/sources.mjs`
- `content/ead/catalogo-c/educacao-fisica-escolar/assessments.mjs`
- `content/ead/catalogo-c/educacao-fisica-escolar/index.mjs`
- `content/ead/catalogo-c/educacao-fisica-escolar/lessons.mjs`
- `content/ead/catalogo-c/educacao-fisica-escolar/sources.mjs`
- `content/ead/catalogo-c/educacao-nas-mudancas-da-sociedade/assessments.mjs`
- `content/ead/catalogo-c/educacao-nas-mudancas-da-sociedade/index.mjs`
- `content/ead/catalogo-c/educacao-nas-mudancas-da-sociedade/lessons.mjs`
- `content/ead/catalogo-c/educacao-nas-mudancas-da-sociedade/sources.mjs`
- `content/ead/catalogo-raiz/auxiliar-administrativo/assessments.mjs`
- `content/ead/catalogo-raiz/auxiliar-administrativo/index.mjs`
- `content/ead/catalogo-raiz/auxiliar-administrativo/lessons.mjs`
- `content/ead/catalogo-raiz/auxiliar-administrativo/sources.mjs`
- `content/ead/catalogo-raiz/digitacao-interativa/assessments.mjs`
- `content/ead/catalogo-raiz/digitacao-interativa/index.mjs`
- `content/ead/catalogo-raiz/digitacao-interativa/lessons.mjs`
- `content/ead/catalogo-raiz/digitacao-interativa/sources.mjs`
- `content/ead/catalogo-raiz/excel-basico-avancado/assessments.mjs`
- `content/ead/catalogo-raiz/excel-basico-avancado/index.mjs`
- `content/ead/catalogo-raiz/excel-basico-avancado/lessons.mjs`
- `content/ead/catalogo-raiz/excel-basico-avancado/sources.mjs`
- `content/ead/catalogo-raiz/excel-kids/assessments.mjs`
- `content/ead/catalogo-raiz/excel-kids/index.mjs`
- `content/ead/catalogo-raiz/excel-kids/lessons.mjs`
- `content/ead/catalogo-raiz/excel-kids/sources.mjs`
- `content/ead/catalogo-raiz/tecnicas-redacao/assessments.mjs`
- `content/ead/catalogo-raiz/tecnicas-redacao/index.mjs`
- `content/ead/catalogo-raiz/tecnicas-redacao/lessons.mjs`
- `content/ead/catalogo-raiz/tecnicas-redacao/sources.mjs`
- `content/ead/catalogo-raiz/word-kids/assessments.mjs`
- `content/ead/catalogo-raiz/word-kids/index.mjs`
- `content/ead/catalogo-raiz/word-kids/lessons.mjs`
- `content/ead/catalogo-raiz/word-kids/sources.mjs`
- `docs/ead/revisao-catalogo-a.md`
- `docs/ead/revisao-catalogo-b.md`
- `docs/ead/revisao-catalogo-c.md`
- `docs/ead/revisao-catalogo-preservados.md`
- `docs/ead/revisao-catalogo-raiz.md`
- `docs/ead/revisao-cruzada-catalogo.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/aluno/cursos/components/EadActivitiesPanel.tsx`
- `modules/aluno/cursos/components/EadAnswerRadio.tsx`
- `modules/aluno/cursos/components/EadQuizPanel.tsx`
- `modules/aluno/cursos/eadAnswerRadio.test.mjs`
- `scripts/ead-catalog/alignment-patches.mjs`
- `scripts/ead-catalog/alignment-publication.mjs`
- `scripts/ead-catalog/alignment-publication.test.mjs`
- `scripts/ead-catalog/content.test.mjs`
- `scripts/ead-catalog/course-scope.mjs`
- `scripts/ead-catalog/load-revisions.mjs`
- `scripts/ead-catalog/native-packages.test.mjs`
- `scripts/ead-catalog/prepare-publication.mjs`
- `scripts/ead-catalog/protect-preserved-feedback.mjs`
- `scripts/ead-catalog/protect-preserved-feedback.test.mjs`
- `scripts/ead-catalog/publication-sql.mjs`
- `scripts/ead-catalog/publication.test.mjs`
- `scripts/ead-catalog/revision-model.mjs`
- `supabase/migrations/20261028004100_publish_ead_catalog_batch_00.sql`
- `supabase/migrations/20261028004101_publish_ead_catalog_batch_01.sql`
- `supabase/migrations/20261028004102_publish_ead_catalog_batch_02.sql`
- `supabase/migrations/20261028004103_publish_ead_catalog_batch_03.sql`
- `supabase/migrations/20261028004104_publish_ead_catalog_batch_04.sql`
- `supabase/migrations/20261028004105_publish_ead_catalog_batch_05.sql`
- `supabase/migrations/20261028004106_publish_ead_catalog_batch_06.sql`
- `supabase/migrations/20261028004107_publish_ead_catalog_batch_07.sql`
- `supabase/migrations/20261028004108_publish_ead_catalog_batch_08.sql`
- `supabase/migrations/20261028004109_publish_ead_catalog_batch_09.sql`
- `supabase/migrations/20261028004110_publish_ead_catalog_batch_10.sql`
- `supabase/migrations/20261028004111_publish_ead_catalog_batch_11.sql`
- `supabase/migrations/20261028004112_align_preserved_ead_activities.sql`
- `supabase/migrations/20261028004113_protect_preserved_ead_feedback.sql`

Total: 208 arquivos.
