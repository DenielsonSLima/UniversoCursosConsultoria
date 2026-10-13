# Contrato técnico com condições individuais — 4.8.213

## Objetivo e diagnóstico

O contrato consultava quantidade e encargos legados da turma, formatava juros como moeda e não apresentava o plano completo. A correção lê a regra financeira efetiva por matrícula e suas evidências, sem preços fixos de produção. Repositório base: `14b285f46fde84fb08317422cf51d865bc82433b`.

Três frentes: financeiro, texto/identidade e PDF. Consultas via MCP confirmaram modelo técnico ativo revisão 7 e migrations até outubro; nenhuma alteração de dados ou configuração remota foi executada neste lote até a preparação da revisão.

## Comparativo

| Ponto | Antes | Candidato |
|---|---|---|
| Origem financeira | Campos antigos, sem resolver efetivo | Matrícula, padrão da turma, plano de transferência e condições revisadas |
| Valor do curso | Quantidade de um ciclo; total ausente | Ciclos, mensalidades, matrícula, rematrículas e total completo |
| Taxas omitidas | Podiam reaparecer pelo padrão da turma | Omissão exige prova explícita; registro local sem boleto conserva obrigação |
| Juros | Número percentual exibido em reais | Percentual mensal, proporcional aos dias de atraso |
| Multa de atraso | Moeda e percentual podiam parecer dois encargos | Uma multa percentual; taxa incompatível bloqueia documento sem alterar cobrança |
| Vencimentos | Campo genérico | Cadência comprovada ou datas individuais; futuro não confirmado permanece explícito |
| Parte contratante | Responsável ausente para adulto | Próprio aluno adulto; responsável legal do menor com dados suficientes |
| Deveres acadêmicos | Atribuídos genericamente ao contratante | Frequência e estágio atribuídos ao aluno |
| Número do endereço | Ausência virava S/N | Ausência omitida no V4; S/N explícito preservado |
| Texto | Termos internos e categoria TECNICO como modalidade | Linguagem contratual, sem presumir forma de oferta |
| PDF | Corpo 8,5 pt e QR truncado | V4 12 pt, paginação no servidor, código e validade completos |
| Histórico | Snapshots e aprovações existentes | Preservados; nova revisão institucional obrigatória |

## Escopo e limites

- Não modifica preços, boletos, recebíveis, pagamentos, cadastro pessoal, marca, posições configuradas ou aprovações históricas.
- Total contratado não é saldo a pagar. Ciclos futuros fazem parte da projeção quando comprovados; parcelas pagas permanecem no valor original contratado.
- Continuidade interna/importada sem plano contratual completo e ciclos sem prova suficiente impedem nova emissão inexata. A revisão do plano ocorre no fluxo financeiro existente.
- Modelo candidato nasce `EM_REVISAO`; não há aprovação jurídica automática. Publicação precisa preservar esse controle, disponibilizar o compositor V4 antes da ativação e validar emissão autenticada após aprovação da revisão.
- Diferenças institucionais entre a minuta recebida e o modelo vigente (garantias de estágio, empréstimo de livros, gratuidade de identificação e endereço) não foram preenchidas por suposição. Não foi criado IPCA/índice de correção ausente da configuração financeira.
- A multa diária por atraso de livro permanece em reais conforme regra de biblioteca; não se confunde com juros ou multa de mensalidade.

## Aceite e validação

- Valores e quantidades variam por matrícula; padrão da turma só vale conforme resolver vigente.
- Transferência parcial, taxas omitidas/dispensadas, cobranças locais e diferenças de termos são preservadas com prova.
- Contrato novo congela fonte e condições; replay e documentos anteriores conservam conteúdo financeiro.
- Testes isolados PostgreSQL executam migrations candidatas, cálculos, texto e paginação; dependências de autorização e validação financeira preexistentes são simuladas onde indicado nos fixtures.
- QA SQL → adapter → compositor verifica texto integral, 12 pt, limites físicos, QR e marca/configuração. Build de integração concluído.
- Smoke autenticado em Safari com banco atualizado permanece pendente; o ambiente desta execução não disponibiliza Safari. 

## Resultado dos testes

- 14 cenários financeiros SQL: regra individual/padrão, ciclos futuros, transferência parcial e v3, revisão, omissão comprovada, obrigação local, dispensa, encargos e datas.
- Integração das oito migrations: modelo revisionado, identidade, financeiro calculado, renderer V4 e paridade histórica.
- Emissor base e wrapper reais executados isoladamente: revisão/aprovação, adulto/menor, condições diferentes, rollback, replay autorizado e histórico imutável. Fonte financeira e fronteiras de autorização são sintéticas nesse teste; loader real é testado separadamente.
- PDF final de 12 páginas sintéticas: texto integral, corpo em 12 pt, encerramento isolado, QR completo e posições configuradas. Marca institucional também inspecionada com ativos isolados, sem dados pessoais.
- Compositor/adapter: 11 testes da revisão; contratos legados/cabeçalho/encerramento e identidade preservados. Build Vite final e auditoria de limite de linhas concluídos.
- CI adicionada para executar SQL → payload sintético → compositor PDF e publicar somente artefatos sintéticos.

## Manifesto explícito

- `.github/workflows/contract-individual-terms.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-13-contrato-financeiro-individual.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/services/contrato-aluno-template.service.test.mjs`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/services/contrato-aluno-template.service.ts`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/types/contrato-aluno.types.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/body.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/closing.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/legibility.pdf.test.mjs`
- `modules/gestor/secretaria/contratos-aluno/pdf/model.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/page.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/qr.ts`
- `modules/gestor/secretaria/shared/canonical-document-vector-pdf.source.contract.test.ts`
- `supabase/migrations/20261013120000_contract_individual_financial_plan.sql`
- `supabase/migrations/20261013120100_contract_financial_summary.sql`
- `supabase/migrations/20261013120200_freeze_contract_individual_finance.sql`
- `supabase/migrations/20261013121000_contract_party_snapshot.sql`
- `supabase/migrations/20261013121100_contract_individual_terms_render.sql`
- `supabase/migrations/20261013121200_revise_technical_contract_individual_terms.sql`
- `supabase/migrations/20261013123000_contract_v4_pagination.sql`
- `supabase/migrations/20261013123010_contract_v4_renderer_pagination.sql`
- `supabase/tests/contract_individual_finance.fixture.sql`
- `supabase/tests/contract_individual_finance.isolated.test.mjs`
- `supabase/tests/contract_individual_terms.contract.test.ts`
- `supabase/tests/contract_individual_terms.isolated.test.mjs`
- `supabase/tests/contract_individual_terms.rollback.sql`
- `supabase/tests/contract_v4_emission.isolated.test.mjs`
- `supabase/tests/contract_v4_pagination.test.mjs`

Total: 31 arquivos.
