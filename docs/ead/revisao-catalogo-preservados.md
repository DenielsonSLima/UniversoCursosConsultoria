# Revisão dos cursos preservados — 27/10/2026

Decisão: manter o conteúdo de Merendeira Escolar, Serviços Gerais e Vigia.
A leitura integral das 24 aulas textuais, 12 atividades e 30 questões finais
encontrou ensino específico que sustenta as avaliações. Não há motivo para
substituir aulas, provas ou identificadores nesses três cursos neste lote.
Os sete ajustes propostos corrigem a associação da atividade à aula que ensina
seu conteúdo; a antiga associação apontava para a aula seguinte. O ensino já
existia anteriormente no percurso, portanto isso não caracteriza prova alheia
ao curso nem justifica reabrir notas já consolidadas.

## Fonte da verificação

Leitura do `ead_config` obtido do projeto Universo
`kfekgwyqozhicpfuunpo`, sem dados de alunos. O manifesto versionado em
`scripts/ead-catalog/alignment-patches.mjs` registra ID, nome, carga horária,
hash MD5 do JSONB original e os campos esperados antes de cada ajuste.
Os hashes foram reconferidos por consulta somente leitura via MCP Supabase.

Também foi feita conferência independente da alternativa correta de cada item
com `internal_academic.ead_assessment_answer_keys`: 42 de 42 coincidências,
quatro atividades e dez questões finais em cada curso. O cofre usa índices
armazenados como strings numéricas. Nenhuma resposta ou resolução privada
integra este documento, o manifesto ou a saída da consulta.

## Merendeira Escolar — 100 horas

As oito aulas tratam de responsabilidade profissional, rotina e comunicação,
higiene pessoal, ambiente/POPs, recebimento e armazenamento, preparo seguro,
distribuição e necessidades alimentares, registros e desperdício.
As avaliações cobram essas competências, incluindo limites de atuação e
encaminhamento ao nutricionista responsável. Foram preservadas integralmente.

| Atividade | Associação anterior | Associação proposta | Ensino explícito |
| --- | --- | --- | --- |
| `mer-atv-2` | `mer-etapa-4` | `mer-etapa-3` | Higiene das mãos após embalagens e troca de atividade. |
| `mer-atv-3` | `mer-etapa-6` | `mer-etapa-5` | Conferência de embalagens, identificação e comunicação de não conformidades. |
| `mer-atv-4` | `mer-etapa-8` | `mer-etapa-7` | Orientação alimentar formal, prevenção de contato cruzado e privacidade. |

Essas atividades possuem somente `etapaId`; o campo `aulaId` deve permanecer
ausente. A referência técnica complementar consultada foi a
[cartilha de boas práticas da Anvisa](https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/alimentos/manuais-guias-e-orientacoes/cartilha-boas-praticas-para-servicos-de-alimentacao.pdf).
Não foram criados prazos, temperaturas ou procedimentos clínicos novos.

## Serviços Gerais — 90 horas

As oito aulas cobrem escopo profissional, checklist e organização, limpeza,
produtos e resíduos, riscos/EPI/sinalização, ergonomia, qualidade e
sustentabilidade. As atividades e a prova final são específicas dessas aulas.
As instruções respeitam o POP e os limites de capacitação do trabalhador.

| Atividade | Associação anterior | Associação proposta | Ensino explícito |
| --- | --- | --- | --- |
| `atividade-3` | `aula-6` | `aula-5` | Piso molhado, sinalização/restrição segura, comunicação e registro. |

Alterar conjuntamente `aulaId` e `etapaId`. A aula 5 ensina a sequência de
prevenção e os limites do EPI; a aula 6 tem como foco ergonomia. Referência
complementar: [página oficial da NR-6 no MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-6-nr-6).

## Vigia — 80 horas

As oito aulas ensinam limites de atuação não ostensiva, rotina de turno,
observação factual, comunicação, registros, sigilo, emergências e melhoria
contínua. A prova avalia essas habilidades. O texto diferencia o curso livre
dos requisitos de segurança privada regulamentada e não autoriza intervenção
corporal ou atividades que exijam formação própria.

| Atividade | Associação anterior | Associação proposta | Ensino explícito |
| --- | --- | --- | --- |
| `atividade-1` | `aula-2` | `aula-1` | Propósito do curso livre e limites profissionais. |
| `atividade-3` | `aula-6` | `aula-5` | Campos de registro, fatos, comunicação e status de pendência. |
| `atividade-4` | `aula-8` | `aula-7` | Autoproteção, protocolo local, acionamento e limites da resposta. |

Alterar conjuntamente `aulaId` e `etapaId`. A referência legislativa citada na
própria aula é a Lei 14.967/2024; não se altera a interpretação ou o texto
jurídico neste ajuste de vínculo.

## Critério de publicação

Este artefato não aplica SQL. O publicador deve rejeitar hash, ID ou vínculo
anterior divergente e executar a atualização em transação. Deve comparar antes
e depois: aulas, enunciados, opções, IDs, gabaritos privados, regras, progresso,
notas, tentativas e certificados. Somente os sete vínculos do manifesto podem
mudar. Não adicionar revisão acadêmica nem resetar progresso para essa mudança.

Os vídeos não foram assistidos nesta auditoria. A conclusão de alinhamento
apoia-se no material textual disponível e nos itens efetivamente publicados;
não certifica equivalência dos vídeos ou suficiência temporal de cada carga
horária. A confirmação de chaves não revela antecipadamente as respostas aos
alunos. A conferência posterior ao alinhamento identificou explicações antecipadas
em Serviços Gerais e Vigia. A proteção complementar é descrita abaixo.


## Proteção complementar das explicações

A primeira migration de alinhamento permanece imutável e conserva o contrato
que foi validado acima. Uma operação separada reserva as dez explicações de
Serviços Gerais e as dez de Vigia no esquema acadêmico privado. Ela registra
somente o currículo legado atual, com os mesmos IDs e gabaritos, e ativa a
sanitização já existente. Não cria currículo substituto nem oferece troca de
versão: a revisão atual e a disponível são o mesmo legado.

A operação não atualiza progresso. Compara antes e depois todas as notas,
tentativas, certificados e os valores e tipos JSON dos dois cofres. As
explicações deixam o catálogo e seguem no feedback somente após submissão.
Testes isolados conferem também nota anterior 80, conclusão e certificado
inalterados, nova prova com nota 100, recarga do feedback, replay recusado e
rollback completo se o segundo curso divergir.

O gerador e seu escopo fixo estão em
`scripts/ead-catalog/protect-preserved-feedback.mjs`. A migration complementar
não contém respostas ou resoluções literais; utiliza o material existente no
banco somente após conferir identidade, horas e hash posterior ao alinhamento.
Merendeira não apresentava explicações antecipadas e não precisa desse registro.
