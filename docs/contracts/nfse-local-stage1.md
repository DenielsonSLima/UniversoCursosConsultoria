# NFS-e — contrato local da etapa 1

Status: CANÔNICO para a estrutura da etapa 1; contrato proposto para as RPCs fiscais futuras, sem autorização de emissão. A liberação restrita em produção acrescenta somente a confirmação de acesso descrita abaixo.

## Continuidade em 08/11/2026

Este documento descreve a fundação, não o inventário completo da versão atual. Recebimentos,
modelos/prévia de descrição, serviços para parceiros e projeção DANFSe já possuem RPCs próprias,
aplicadas e entregues até a versão 4.8.270. A produção observada em 08/11 é 4.8.271.
As flags do serviço fiscal central não bloqueiam essas funcionalidades independentes.

A continuidade local autorizada está no [contrato de preparação e fila](nfse-preparation-queue.md).
Configuração e certificado têm contratos próprios em `services/configuration/` e
`supabase/functions/nfse-certificate-upload/README.md`. DPS, assinatura e cancelamento estão
documentados em `supabase/functions/_shared/nfse-national/README.md`. Sua existência local
não comprova aplicação remota, representação fiscal, homologação ou transmissão.

## Limite operacional

`services/nfse.runtime.ts` mantém leitura remota, escrita e provedor fiscal desabilitados. O serviço público lança `NfseUnavailableError` antes de importar o transporte Supabase ou realizar rede. O módulo não devolve sucesso, notas ou valores fictícios para contornar essa indisponibilidade. A interface apresenta o estado de preparação.

As factories aceitam transporte injetado exclusivamente para testar os contratos isoladamente. Capabilities recebidas pela interface não removem o bloqueio local. As operações fiscais `dispatch` e `reconcile` no diretório `api/` não possuem transporte implementado e sempre informam indisponibilidade.

Na fundação não havia RPC de emissão implantada, certificado armazenado ou canal de cadastro A1. As entregas posteriores estão identificadas acima. Habilitar flags pressupõe backend revisado e homologado; não constitui o processo de implantação por si só.

## Liberação individual em produção

A RPC `get_nfse_access_secure(p_context_id uuid)` retorna somente um booleano. Ela exige a identidade autenticada, o contexto institucional ativo, a permissão efetiva do módulo, a agenda institucional e uma concessão explícita em `private.nfse_access_grants`. O navegador não pode ler ou alterar essa tabela. A concessão inicial é individual e não altera perfis compartilhados.

O frontend consulta esse gate separadamente dos serviços fiscais. Ausência de confirmação, erro ou contexto divergente bloqueiam menu, conteúdo e configuração. A configuração ainda exige contexto de matriz. A confirmação de acesso não habilita emissão, cálculo, gravação fiscal ou cadastro de credenciais.

## Responsabilidades das pastas

| Pasta | Responsabilidade |
| --- | --- |
| `types/` | Tipos de apresentação e escopo; mês padrão no fuso America/Maceio. |
| `services/` | Validação dos envelopes, projeção dos dados, contratos RPC e bloqueio operacional local. |
| `queries/` | Chaves TanStack por contexto, polo, ambiente, mês, recurso e filtros. |
| `hooks/` | Consultas, mutations sem retry automático, invalidação no escopo original e ciclo de assinatura Realtime. |
| `realtime/` | Reconhecimento de eventos sanitizados do polo/ambiente/mês e invalidação de recursos. |
| `api/` | Fronteira da futura API interna de despacho e reconciliação; sem cliente direto da API fiscal no navegador. |

As abas cuidam da apresentação e seleção. Cálculo, composição, elegibilidade, seleção entre páginas, autorização, reserva de numeração, idempotência e decisão fiscal pertencem ao backend.

## Escopo e envelope

Toda consulta recebe `NfseScope` com `poloId` UUID, `contextKey` não vazio, `environment` HOMOLOGACAO/PRODUCAO e `month` YYYY-MM. Escopo ausente, inválido ou agregado (`todos`) desabilita a consulta. Não há fallback silencioso para matriz ou todos os polos.

`contextKey` é chave de correlação/cache da sessão e suas permissões, nunca prova de autorização. A RPC deve obter a identidade autenticada, revalidar o contexto institucional e autorizar polo, recurso e operação no servidor. O cliente não fornece `isMatriz` para autorizar configuração. O CNPJ do emitente é resolvido no cadastro de polos pelo servidor.

Resposta proposta:

```json
{
  "version": 1,
  "scope": {
    "poloId": "UUID",
    "contextKey": "contexto-opaco",
    "environment": "HOMOLOGACAO",
    "month": "2026-11"
  },
  "data": {}
}
```

O cliente rejeita versão, polo, contexto, ambiente ou mês divergentes antes de armazenar o resultado na consulta. Os mappers projetam apenas campos declarados; material extra de credenciais não é retido. Erros brutos de SQL/provedor não vão para logs nem para mensagens da interface.

Valores monetários são strings decimais canônicas com duas casas. `null` significa desconhecido; ausência não vira zero. O cliente preserva a precisão sem conversão para Number e não soma valores da seleção. Quantidades e totais mostrados pela interface vêm do contrato canônico.

## Desenho original das RPCs da fundação

Os nomes desta tabela são o desenho original. Modelos já têm implementação própria com
assinaturas versionadas nas migrations posteriores. Preparação e configuração locais também
possuem contratos novos; não chamar suas RPCs usando esta tabela como assinatura atual.

| RPC | Resultado/entrada |
| --- | --- |
| `get_nfse_workspace_secure` | Capabilities, prontidão, totais, turmas e modelos autorizados. |
| `get_nfse_candidates_secure` | Candidatos por turma/modelo/busca/página; valor recebido, valor do serviço, elegibilidade e bloqueio calculados no servidor. |
| `get_nfse_documents_secure` | Documentos paginados por PENDENTE/EMITIDA/ERRO; pendentes podem estar em processamento ou aguardando confirmação. |
| `get_nfse_models_secure` | Modelos versionados do estabelecimento. |
| `get_nfse_configuration_secure` | Identificação e metadados fiscais autorizados; apenas sinais/validade de credencial, nunca conteúdo do segredo. |
| `prepare_nfse_batch_secure` | `requestId`, IDs candidatos e ID do modelo; nenhum valor monetário enviado como autoridade. |
| `save_nfse_model_secure` | Campos do modelo, versão esperada e requestId; configuração tributária completa dependerá da etapa fiscal. |
| `save_nfse_configuration_secure` | Município/IM, modalidade de acesso e origem da credencial, mais requestId; não aceita CNPJ arbitrário ou segredos. |

Parâmetros comuns: `p_polo_id`, `p_context_key`, `p_environment`, `p_month`. Paginação de candidatos/documentos usa 25 itens; modelos usa primeira página de até 100 nesta etapa. As telas não devem afirmar seleção global entre páginas: o contrato de snapshot/filtro integral será acrescentado na etapa de fila, sem depender das linhas carregadas no navegador.

As RPCs de escrita devem autorizar antes de consultar requestId, exigir payload imutável em replay e reservar/alocar recebimentos atomicamente. As validações locais de IDs e capacidades são somente prevenção de erro de interface. Serviço fiscal e funções privileged deverão exigir autenticação/autorização real mesmo para chamadas diretas.

## Cache e Realtime

Não usar dados anteriores de outro escopo como placeholder. Consultas têm retry desabilitado nesta fase, coleta imediata do cache quando sem observadores e cancelamento de leitura por AbortSignal. Mutations invalidam o contexto capturado no início da operação, mesmo se o usuário já tiver mudado de polo.

O listener futuro é somente INSERT na tabela proposta `nfse_change_events`, filtrado por polo. Antes de habilitá-lo, a tabela precisa existir, ser incluída na publicação Realtime e ter RLS que autorize apenas o escopo do usuário. O filtro do cliente não substitui RLS.

Evento proposto: `version: 1`, `polo_id`, `environment`, `month`, `resource` em workspace/candidates/documents/models/configuration. O payload não contém XML, nome de aluno, documento ou segredo. Eventos incompletos ou de outro escopo são ignorados, sem invalidação global. Eventos válidos invalidam o recurso correspondente e o resumo; um evento workspace invalida apenas o resumo. Atualizações de catálogos que afetem vários meses devem produzir eventos para os escopos pertinentes ou revisar este contrato antes da ativação.

## Evidência e limitações

Testes locais cobrem bloqueio de rede/escrita/emissão, divergência de escopo, valores decimais exatos, documentos sem identificação fiscal, resposta incerta, paginação/duplicidade, projeção sem segredos, origem dos valores na preparação, isolamento de cache/eventos e limite de mês em Maceió. Fixtures são sintéticas.

Não houve homologação fiscal ou transmissão. A publicação restrita verifica no banco apenas identidade, concessão e contrato de acesso. A documentação de referência do cliente RPC e Realtime foi consultada; o índice Markdown do changelog Supabase não pôde ser renderizado pela ferramenta. Antes de habilitar qualquer operação fiscal, revisar documentação vigente, contrato SQL, RLS, eventos e integração de ponta a ponta.

Referências: [RPC JavaScript](https://supabase.com/docs/reference/javascript/rpc), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [estudo funcional NFS-e](../estudos/2026-11-07-nfse-nacional.md).
