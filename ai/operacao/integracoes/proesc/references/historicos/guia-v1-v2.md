# Referência histórica — não orientar novas consultas

Arquivado em 01/10/2026. A escolha operacional agora é V2; leia [contrato vigente](../v2-operacional.md). O texto abaixo preserva diagnósticos e decisões anteriores, sem afirmar o estado atual de produção.

# Proesc V1 e V2: o que fazem e quando usar

Atualizado em 19/09/2026. Contrato oficial: snapshot de 12/09/2026, preservado no [catálogo](../../documentation/CATALOGO.md) e nos arquivos originais com hashes em `../documentation/manifest.json`. Evidências locais: testes de 12 a 19/09 e [entrega V1/V2](../../../../registros/alteracoes/2026-09-18-proesc-conexoes-v1-v2.md).

## Como interpretar

- **Documentado:** o fornecedor publica o recurso/campo; não prova permissão do token, conteúdo preenchido ou funcionamento real.
- **Observado:** uma chamada real confirmou o comportamento no escopo e data indicados.
- **Integrado:** o produto usa esse fluxo; código de cliente disponível não significa sincronização ativa.
- Os retornos abaixo resumem campos documentados. O catálogo contém os caminhos completos e o OpenAPI de cada operação. Campos opcionais podem faltar ou ser nulos; não prometer preenchimento de todos os registros.

## Escolha rápida

| Necessidade | Escolha e motivo |
| --- | --- |
| Conferir financeiro legado já integrado | V1 `accounting_data`, com unidade, ano de vencimento e mês. Fluxo atual validado; não trocar pela V2 apenas por ser mais nova. |
| Consultar pessoas, documentos básicos e vínculos | V2 `people`: acesso confirmado com token próprio e WAF; validar cada campo necessário antes de importar. |
| Consultar título eleitoral, zona, seção, emissão ou UF eleitoral | `people` V2 não forneceu esses campos na varredura completa. Nenhum recurso eleitoral confirmado neste catálogo. Solicitar ao Proesc recurso, parâmetro ou exportação específico; não inferir dados. |
| Consultar turma/catraca do legado | V1 `list_students_filter`, selecionando unidade e exercício acadêmico correto. Não substitui histórico de matrícula. |
| Consultar estrutura acadêmica e responsáveis | V1 `school_data` documenta uma estrutura ampla; V2 `people` documenta vínculos por pessoa. Escolher pelos campos e provar o retorno requerido. |
| Consultar notas | V1 `student_grades` ou V2 `grades`, conforme vínculo e formato necessários. Acesso com a credencial atual ainda não validado nesta documentação. |
| Avaliar parcelas individuais, boleto e Pix via V2 | `invoices` tem contrato mais detalhado, mas consulta real excedeu o prazo; primeiro confirmar acesso, identidade e semântica. Não migrar o financeiro com base apenas no schema. |
| Enviar frequência ou criar débito | São POSTs distintos, documentados abaixo. Exigem escopo autorizado de gravação; não executar para testar leitura. |

## V1 escolar

Base `https://app.proesc.com/api/v1`; autenticação por query `token` da entidade. A chave V1 não é o Bearer V2. Parâmetros abaixo omitem somente o token comum a todas as operações.

| Operação | Finalidade e retorno documentado | Parâmetros/estado conhecido |
| --- | --- | --- |
| GET `/configuration_data` | Unidades (`units`), exercícios (`academic_years`) e categorias (`categories`), com IDs e nomes. | Leitura confirmada em 12/09; resposta real usa objeto com `status`, `description` e coleções; nome da unidade em `unidade`. |
| GET `/accounting_data` | Linhas contábeis: `chave_id`, conta, aluno/responsável e CPF, curso, bloco `id`, valor, unidade, período, criação, vencimento, pagamento, forma de pagamento e CEP. | Exige `unidade_id`, `ano_letivo`, `mes`. Consulta e conciliação do legado integradas. Linhas contábeis não equivalem a boletos. |
| GET `/financial_statement` | Extrato: aluno, vencimento, emissão, pagamento, tipo de débito, valor bruto e nível acadêmico. | `ano_letivo` é ano do vencimento; filtro `unidade_id`. Testes de 12/09 retornaram 302 para `/erro`; extrato não validado. |
| GET `/general_student_list` | Pessoa, nome, matrícula, RA, nascimento, celular, sexo, série, turma e professor responsável. | Teste sem unidade retornou HTTP200 com erro lógico `unit id required`; parâmetro adicional exato não comprovado. |
| GET `/list_students_filter` | Foto, nome, pessoa, atualização, identificação/CPF, nascimento, telefone, sexo, série, curso, turma, ativo, inadimplência, responsável e grupo. | Exige `unidades`; `ano_letivo` acadêmico opcional. Observado com sucesso em 2025/2026. Envelope real `{status, students, description}`. |
| GET `/official_financial_data` | Dados para desconto em folha: chave, unidade, código do colaborador, aluno/colaborador e CPF, valor e vencimento. | Exige `unidade_id`, `ano_letivo`, `mes`. Documentado; sem teste real registrado aqui. |
| GET `/school_data` | Unidades, cursos, turmas, disciplinas, matrículas, aluno, contato, foto, nascimento, RA, link de boletim e responsáveis. | Documentado; sem teste real registrado aqui. Não presumir que o `status` da raiz seja situação da matrícula. |
| GET `/student_grades` | IDs de entidade, unidade, curso, turma, matrícula, pessoa, período, disciplina, avaliação e exercício; datas, notas e tipo de avaliação. | Documentado; consultar filtros na operação original. Sem teste real registrado aqui. |
| GET `/workers_data` | Unidades e funcionários/professores: pessoa, grupo, nome, telefone, e-mail, CPF, foto, datas e turmas/disciplinas vinculadas. | Exige `unidades`. Documentado; sem teste real registrado aqui. |
| POST `/turn_frequency` | Envia registro de frequência/movimentação. Não há schema de resposta publicado. | Exige `pessoa_id`, `tipo`, `data_movimentacao`. Gravação não executada nesta análise. |

Leia [contratos](../contratos.md), [diagnóstico inicial](../diagnostico-2026-09-12.md) e, para interpretar pagamentos, [conferência contábil](../conferencia-t42-2026-09-12.md). Não converter códigos exemplificativos do fornecedor em regras de baixa: o retorno real apresentou divergências.

## V2 escolar

Base `https://api.proesc.com/api/v2`; `Authorization: Bearer` com token V2 e, nesta conexão, `x-proesc-waf` fornecido pelo suporte. Valores de token/WAF ficam no Vault. Recursos têm permissões próprias.

| Operação | Finalidade e retorno documentado | Filtros/estado conhecido |
| --- | --- | --- |
| GET `/people` | Pessoas com identificação, documentos básicos, grupo, matrículas e responsáveis; detalhamento abaixo. | Filtros `unit_id`, `page`. Acesso confirmado; 99 páginas e 1.969 pessoas examinadas. |
| GET `/invoices` | ID da parcela, entidade, descrição, ordem/grupo/tipo, status, vencimento, valor original, descontos, multa, juros, valor atualizado/pago, data de pagamento, boleto e Pix. | `expiration_year`, `expiration_month`, `unit_id`, `invoice_type_id`, `page`. Sem período usa ano/mês corrente segundo a documentação. Teste de setembro/2026 excedeu 25s; acesso não confirmado. |
| GET `/configuration_data` | Unidades, anos letivos, categorias e IDs de turma/aluno/tipo de parcela para consultas (`student_grades`, `financial_statement`). | Documentado; sem teste real registrado aqui. “Dados” não significa exportação integral do cadastro. |
| GET `/grades` | Turma/ID, ano letivo, matrículas, pessoa/ID/nome, notas e anexos com título, tipo e URL. | Documentado; consultar filtros na operação original. Sem teste real registrado aqui. |
| POST `/debits/create` | Cria débito; resposta documenta `sucess`, mensagem e dados do débito, pessoa, matrícula, unidade, responsável financeiro, valor, parcelas e datas. | Exige pessoa, nome/descrição, opção de boleto, conta, data/tipo de débito, matrícula, vencimento, valor, quantidade de parcelas e descontos. Sem execução nesta análise. |

### Campos documentados de Pessoas

| Caminho relativo a `data[]` | Significado documentado |
| --- | --- |
| `id`, `name`, `birth_date` | Identificação Proesc, nome e nascimento. |
| `student_identification_number` | Identificação/RA do aluno. |
| `cpf_number`, `identity_card_number` | CPF e RG; manter como texto para preservar zeros. |
| `main_group.id`, `main_group.name` | Grupo principal da pessoa; não assumir que todas as pessoas são alunos. |
| `enrollments[].id` | Identificador da matrícula. |
| `enrollments[].class.id`, `enrollments[].class.name` | Turma vinculada. |
| `enrollments[].academic_year`, `enrollments[].grade_year`, `enrollments[].course` | Ano letivo, série e curso da matrícula. |
| `guardians.financial_guardian.data` | Responsável financeiro: `id`, `name`, `type`. |
| `guardians.educational_guardian1.data`, `guardians.educational_guardian2.data` | Responsáveis educacionais: `id`, `name`, `type`. |

O schema não promete endereço, e-mail, telefone nem ficha documental completa em `people`. Não afirmar ausência desses dados no sistema Proesc; procurar um recurso documentado que os exponha quando forem necessários.

Em `invoices`, o schema aninha inclusive pagamentos e boleto sob `discounts`. Boleto inclui gateway/URL, linha digitável e Pix (`pix_qrcode`, `pix_text`). Conferir o JSON real antes de mapear: não reorganizar o contrato por intuição nem interpretar presença de boleto como pagamento.

## Evidencias e limites

- Em 18/09/2026, Bearer V2 mais WAF retornou HTTP200 em `people`. O probe da Edge também confirmou HTTP200 às 00:28:21UTC de 19/09 (21:28:21 de 18/09 em Brasília).
- A varredura concluída em 19/09 cobriu 99/99 páginas e 1.969 pessoas, sem falhas. Envelope observado: `data`, `links`, `meta`; primeira página com 20 registros. Não presumir envelope real pela declaração de array no OpenAPI.
- Nenhum campo eleitoral foi encontrado, inclusive em objetos aninhados. Isso comprova apenas a ausência no retorno consultado; não prova ausência no cadastro interno Proesc nem em outros recursos.
- Não houve preenchimento de aluno. O cruzamento estatístico de CPF com cadastros locais não comprovou unicidade remota nem autorização para sobrescrever dados existentes.
- O timeout de `invoices` não é HTTP403, não prova falta de permissão e não autoriza declarar V2 financeira validada.
- O rótulo do token informou Notas, Parcelas, Pessoas, Dados, Débitos e Matrícula x Financeiro. Rótulos não garantem todos os campos; o snapshot público não identifica uma operação separada “Matrícula x Financeiro”. Não inventar esse endpoint.
- Os antigos 403 permanecem como histórico. Não diagnosticar o acesso atual somente a partir deles, nem atribuir toda recusa futura ao WAF.

## Integração disponível no Universo

Referência da entrega: produto 4.8.69/revisão 78, PR161; Edge `proesc-api` v17, migration `20260919002500`. Esses números são uma fotografia da entrega, não versões permanentes.

- Conexões V1 e V2 independentes. V2 usa tabela privada `internal_proesc.connection_v2` e segredos Vault separados para token/WAF; as credenciais V1 foram preservadas.
- Configuração do gestor salva/remove/testa cada versão separadamente. O status retorna metadados sem segredos. Salvar V2 sem novo WAF preserva o existente.
- Teste V1 consulta configuração e contabilidade. Seu resultado interno usa o rótulo `invoices`, mas não chama `/api/v2/invoices`.
- Teste V2 consulta somente `people`. “Teste OK” não valida notas, parcelas, criação de débito nem todos os campos de pessoas.
- O módulo fonte `supabase/functions/proesc-api/operations.ts` mapeia `legacy_configuration`/`legacy_accounting` para V1 e `people`/`invoices` para V2. É um cliente reutilizável; sua existência não significa que todos os fluxos estejam ligados ao handler ou sincronizando dados em produção.
- Financeiro legado/workers continuam na V1; nenhum cron foi alterado por essa entrega. Não há fallback automático entre versões após falha.

## Próxima consulta ou importação

Escolha o dado desejado na matriz, abra os parâmetros/campos completos no catálogo e confirme a credencial da versão. Consulte internamente, sem navegador, conforme orientação do usuário. Use leitura pequena para provar acesso e schema; complete a paginação somente quando o escopo exigir inventário integral.

Antes de preencher ausências, prove a correspondência da pessoa e o valor explícito na origem. CPF/nome isolados não comprovam matrícula nem obrigação financeira; registre ambiguidades. Para dados eleitorais, aguarde uma fonte que retorne os campos: não usar RG/RA como título nem deduzir zona/seção por endereço.

Documentação V2.1/Bora Estudar é uma família específica, com base `/api/v1/bora-estudar`, recursos ENEM/melhores alunos e permissões próprias. Não é substituição automática da V2 escolar; detalhes no catálogo.
