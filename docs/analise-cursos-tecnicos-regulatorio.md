# Analise regulatoria e funcional - Cursos Tecnicos

Data da analise: 2026-06-29

Escopo: conferir o sistema atual da Universo Cursos e Consultoria, pesquisar o processo oficial de cursos tecnicos no Brasil, especialmente para operacao em Sergipe, e indicar ajustes, relatorios, etapas e controles que devem existir para reduzir risco operacional/regulatorio.

Aviso: este documento e uma analise tecnica-operacional, nao substitui parecer juridico ou consulta formal ao Conselho Estadual de Educacao.

## Fontes oficiais consultadas

- INEP - Censo Escolar: https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/censo-escolar
- INEP - Etapas da coleta do Censo Escolar: https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/censo-escolar/etapas-da-coleta
- SISTEC/MEC: https://sistec.mec.gov.br/
- Catalogo Nacional de Cursos Tecnicos (CNCT/MEC): https://cnct.mec.gov.br/
- Lei do Estagio, Lei 11.788/2008: https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2008/lei/l11788.htm
- Conselho Estadual de Educacao de Sergipe (CEE/SE): https://cee.se.gov.br/

## Diagnostico resumido

O sistema ja tem uma base academica consistente para cursos tecnicos: cadastro de cursos, turmas, alunos, matriculas, financeiro, diario de classe, boletim, historico, atestado de conclusao, transferencia, documentos de estagio, certificados, validacao publica de documentos e relatorios academicos.

O principal ponto de melhoria nao e "criar o academico do zero". O que falta e transformar obrigacoes externas em fluxo controlado dentro do sistema:

1. controle de ato autorizativo do curso tecnico;
2. aderencia explicita ao CNCT;
3. checklist de Censo Escolar/Educacenso;
4. fila operacional de SISTEC;
5. travas de conclusao antes de emitir diploma/certificado tecnico;
6. controle mais completo de estagio supervisionado.

## O que o sistema ja cobre

### Ciclo academico

Existe modelagem de status de matricula com estados relevantes para ensino tecnico: ATIVO, TRANCADO, CANCELADO, CONCLUIDO, DESISTENTE e TRANSFERIDO.

Evidencia local:

- `supabase/migrations/20260621220000_academic_lifecycle_technical_courses.sql`
- tabelas: `periodos_letivos`, `matricula_movimentacoes`, `transferencias_academicas`, `fechamentos_academicos`

Isto e positivo porque permite auditar entrada, permanencia, transferencia, abandono e conclusao.

### Diario de classe

O sistema ja possui diario de frequencia, notas, praticas pedagogicas e observacoes.

Evidencia local:

- `supabase/migrations/20260619132100_create_diario_tables_and_view.sql`
- tabelas: `diario_frequencia`, `diario_notas`, `diario_praticas`, `diario_observacoes`
- view: `v_diario_notas_resultados`

A view calcula frequencia e resultado final, usando media final >= 6,0 e frequencia >= 75%.

### Estagio supervisionado

Existe modelagem inicial de estagio por aluno/turma/disciplina com notas, frequencia, checklist, perfil do aluno e instrutor.

Evidencia local:

- `supabase/migrations/20260619170200_create_estagio_tables_and_columns.sql`
- tabela: `matriculas_estagios`
- modulo de relatorio: `modules/gestor/relatorios/components/RelatorioEstagios.tsx`
- documentos: cracha e termo de estagio na Secretaria Digital

### Certificados e validacao publica

O sistema possui fila de certificados por modalidade e campos importantes para curso tecnico: numero do certificado, pagina, livro, validacao SISTEC, dados do ensino medio e codigo de validacao publica.

Evidencia local:

- `supabase/migrations/20260622143000_create_certificados_academicos.sql`
- `modules/gestor/secretaria/certificados/SecretariaCertificadosPage.tsx`
- `modules/public/validator/ValidatorPage.tsx`

### Relatorios

O sistema ja possui central de relatorios com:

- Matricula Inicial;
- Situacao do Aluno;
- Alunos Cursando;
- Alunos Finalizados;
- Supervisao de Estagios;
- Financeiro por turma/mes;
- Inadimplencia;
- DRE/resultado de turma.

Evidencia local:

- `modules/gestor/relatorios/RelatoriosPage.tsx`
- `modules/gestor/relatorios/components/RelatorioAlunosAcademicos.tsx`
- `modules/gestor/relatorios/relatorios.service.ts`

Isto conversa bem com as etapas do Censo Escolar, principalmente Matricula Inicial e Situacao do Aluno.

## Como funciona o processo regulatorio na pratica

### 1. Antes de ofertar turma tecnica

O curso tecnico deve estar autorizado pelo orgao competente do sistema de ensino. Para Sergipe, o fluxo passa pelo CEE/SE e por protocolos/processos administrativos. O site do CEE/SE indica solicitacoes como autorizacao, credenciamento, reconhecimento/renovacao, alteracao de plano de curso, alteracao de matriz curricular e encerramento.

O sistema deveria controlar:

- ato autorizativo;
- data de publicacao;
- validade/vigencia;
- orgao emissor;
- curso, matriz e polo/unidade vinculados ao ato;
- anexos do plano de curso aprovado;
- matriz curricular aprovada;
- status regulatorio: em preparacao, protocolado, autorizado, renovacao pendente, vencido, encerrado.

Hoje, nao encontrei esses campos como primeira classe no cadastro do curso tecnico. Ha campos genericos como nome, area, carga horaria, versao, descricao, duracao e publicacao no site, mas nao um dossie regulatorio.

### 2. Cadastro do curso conforme CNCT

O Catalogo Nacional de Cursos Tecnicos orienta denominacao, eixo tecnologico, carga horaria minima, perfil profissional, infraestrutura e referencia nacional do curso.

O sistema deveria registrar no cadastro do curso:

- eixo tecnologico CNCT;
- codigo/identificador CNCT, quando aplicavel;
- carga horaria minima CNCT;
- carga horaria aprovada no plano;
- perfil profissional de conclusao;
- infraestrutura minima;
- campo indicando se a matriz cadastrada confere com a matriz aprovada.

Hoje o sistema tem carga horaria e area, mas nao vi campos explicitos de CNCT/eixo/ato.

### 3. Matricula e pasta do aluno

Na matricula tecnica, a instituicao precisa manter dados cadastrais e documentos que sustentem a vida escolar do aluno.

O sistema ja tem perfil, documentos, secretaria, ficha de matricula, controle financeiro e matricula. O ajuste recomendado e criar um checklist de prontidao da pasta academica com:

- RG/CPF;
- comprovante de residencia;
- documento escolar exigido;
- comprovante de ensino medio ou declaracao equivalente, conforme regra do curso;
- contrato/ficha de matricula;
- autorizacao de menor, quando aplicavel;
- aceite LGPD/termos;
- foto;
- documentos especificos do curso/estagio.

### 4. Execucao do curso

Durante a turma, o nucleo academico precisa registrar:

- diario de classe;
- conteudo ministrado;
- frequencia;
- notas;
- recuperacao;
- movimentacoes academicas;
- transferencias;
- trancamentos/desistencias;
- fechamento de periodo.

O sistema ja cobre grande parte disso. O cuidado recomendado e travar fechamento de periodo/turma quando houver pendencias de diario ou notas.

### 5. Estagio supervisionado

A Lei 11.788/2008 exige formalizacao do estagio e acompanhamento. Para cursos tecnicos com estagio obrigatorio, o sistema deve manter pelo menos:

- termo de compromisso;
- plano de atividades;
- unidade concedente;
- CNPJ/endereco da concedente;
- supervisor da concedente;
- orientador/supervisor da instituicao;
- periodo do estagio;
- carga horaria prevista;
- carga horaria cumprida;
- frequencia;
- avaliacao;
- relatorio do aluno/supervisor, quando exigido no plano;
- seguros/apolices, quando aplicavel.

O sistema ja tem termo, cracha, checklist e avaliacao, mas deveria evoluir para "dossie de estagio" com concedente, supervisores, carga prevista/cumprida e anexos.

### 6. Conclusao e certificacao

Antes de emitir certificado/diploma tecnico, o sistema deve validar:

- aluno aprovado em todas as disciplinas;
- frequencia minima atendida;
- estagio obrigatorio concluido, quando houver;
- documentos obrigatorios completos;
- ensino medio informado/comprovado, quando exigido para diplomacao;
- turma/curso com ato autorizativo valido;
- registros academicos fechados;
- numero/livro/pagina definidos;
- registro/validacao SISTEC preenchido quando aplicavel.

Hoje o sistema cria certificado quando a matricula muda para CONCLUIDO e, para tecnico, verifica reprovacoes via `v_diario_notas_resultados`. Isto e bom, mas ainda nao vi uma validacao completa incluindo ato autorizativo, estagio, pasta documental e pendencia SISTEC.

### 7. Relatorios para governo

O relatorio governamental mais recorrente identificado e o Censo Escolar via Educacenso/INEP, com etapas de Matricula Inicial e Situacao do Aluno.

O sistema ja possui relatorios com esses nomes, mas eles parecem ser relatorios internos inspirados no Censo, nao ainda um pacote completo de conferencias oficiais.

Recomendacao: criar uma aba "Censo Escolar / Educacenso" com:

- ano-base;
- escola/polo;
- turmas;
- alunos;
- matriculas iniciais;
- movimento/rendimento;
- pendencias cadastrais;
- exportacao CSV/XLSX;
- checklist de campos obrigatorios;
- data de geracao;
- responsavel pela conferencia;
- status: em preparacao, conferido, enviado, retificado.

## Lacunas e risco

### Alta prioridade

1. Ausencia de dossie regulatorio do curso tecnico.
   Sem ato autorizativo e vigencia no sistema, uma turma pode ser aberta/publicada sem conferencia regulatoria.

2. SISTEC tratado como campo manual simples.
   O sistema tem `validacao_sistec`, mas nao uma fila operacional de envio, pendencia, validacao e auditoria.

3. Relatorio Censo ainda nao parece completo para Educacenso.
   Ha Matricula Inicial e Situacao do Aluno, mas falta checklist oficial, ano-base, campos obrigatorios e status de envio/conferencia.

4. Conclusao academica ainda deveria bloquear pendencias.
   A regra atual verifica notas/frequencia, mas deveria incluir estagio, documentos, ato autorizativo e dados de ensino medio.

### Media prioridade

5. Estagio precisa virar dossie completo.
   Hoje ha avaliacao/checklist/termo, mas faltam campos estruturados de concedente, supervisor, orientador, periodo e carga cumprida.

6. CNCT nao aparece como cadastro estruturado.
   O curso tem area/carga horaria, mas nao eixo tecnologico, codigo CNCT, carga minima CNCT e vinculo com plano aprovado.

7. Historico/certificado devem herdar dados regulatorios.
   Diploma/historico devem carregar ato autorizativo, matriz aprovada, carga, estagio e SISTEC.

### Baixa prioridade

8. Painel de calendario regulatorio.
   Seria util para datas de Censo, renovacao de autorizacao, fechamento de turma e pendencias de SISTEC.

9. Exportacoes padronizadas.
   PDF ja existe em varias areas, mas CSV/XLSX para conferencia governamental facilitaria operacao.

## Plano de implementacao recomendado

### Fase 1 - Controle regulatorio minimo

Criar campos/tabela para dossie regulatorio:

- curso_id;
- polo_id opcional;
- tipo_ato;
- numero_ato;
- orgao_emissor;
- data_publicacao;
- data_inicio_vigencia;
- data_fim_vigencia;
- status;
- link/anexo do ato;
- link/anexo do plano de curso;
- link/anexo da matriz aprovada;
- observacoes.

Adicionar bloqueios/alertas:

- curso tecnico publicado sem ato ativo;
- turma tecnica aberta sem ato ativo;
- ato vencendo em 90/60/30 dias;
- matriz alterada apos ato sem revisao regulatoria.

### Fase 2 - Censo Escolar / Educacenso

Criar modulo de conferencia:

- ano-base;
- etapa: Matricula Inicial ou Situacao do Aluno;
- filtros por polo/turma/curso;
- lista de pendencias por aluno;
- indicadores de dados ausentes;
- exportacao CSV/XLSX;
- registro de conferencia/envio.

Campos a validar no minimo:

- aluno: nome, CPF, nascimento, sexo, endereco/UF, PCD e recursos;
- matricula: turma, curso, data, status;
- turma: modalidade, turno, data de inicio/fim, polo;
- curso: modalidade, carga horaria, eixo/CNCT;
- situacao final: cursando, concluido, transferido, desistente, trancado/cancelado conforme mapeamento interno.

### Fase 3 - SISTEC

Evoluir `certificados_academicos` ou criar tabela complementar:

- certificado_id;
- status_sistec: pendente, enviado, validado, pendencia, corrigido, dispensado;
- codigo_sistec;
- data_envio;
- data_validacao;
- operador_id;
- observacao;
- anexos/comprovantes.

Na tela de certificados, separar "emitir documento" de "regularizar SISTEC".

### Fase 4 - Dossie de estagio

Criar controle estruturado de estagio:

- matricula_id;
- turma_id;
- disciplina_id ou modulo_id;
- concedente_nome;
- concedente_cnpj;
- concedente_endereco;
- supervisor_concedente;
- orientador_instituicao;
- data_inicio;
- data_fim;
- carga_prevista;
- carga_cumprida;
- status;
- anexos.

Adicionar relatorio de pendencias de estagio.

### Fase 5 - Travas de conclusao

Antes de marcar matricula como CONCLUIDO ou liberar certificado tecnico:

- todas as disciplinas aprovadas;
- frequencia minima atendida;
- periodo/turma fechado;
- estagio concluido quando obrigatorio;
- documentos obrigatorios entregues;
- ensino medio informado;
- ato autorizativo ativo;
- pendencia SISTEC marcada conforme politica interna.

## Conclusao

O sistema esta maduro em operacao academica interna, secretaria, documentos e financeiro. Para cursos tecnicos, a melhoria mais importante e adicionar uma camada regulatoria: ato autorizativo, CNCT, Censo/Educacenso, SISTEC e dossie de estagio.

Minha recomendacao tecnica e nao tratar isso como ajustes soltos. O ideal e criar um modulo "Conformidade Tecnica" com quatro subareas:

1. Dossie regulatorio do curso;
2. Censo Escolar / Educacenso;
3. SISTEC;
4. Estagio supervisionado.

Com isso, o sistema deixa de apenas registrar a vida escolar e passa a orientar a secretaria sobre o que precisa ser conferido, enviado, validado e arquivado.
