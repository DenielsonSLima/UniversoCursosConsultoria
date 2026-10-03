# Lote ativo

## Lote: 2026-10-03-proesc-composicao-automatica

Estado: PUBLICAÇÃO 4.8.153 AUTORIZADA, condicionada à CI do commit final. Migration 20261003040108 aplicada e verificada; função anterior e resolução financeira preservadas. Credencial V2 anteriormente substituída no Vault por autorização expressa, com consultas dirigidas HTTP 200.
Aceite: separar ausência de detalhamento de diferença monetária; preservar componentes desconhecidos, totais, datas, pagamentos e abertura operacional. Não fabricar tarifa, desconto aplicado ou forma de pagamento a partir da API.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-03-proesc-composicao-automatica.md` (19 arquivos).
Pendências: CI/Preview e publicação da interface; smoke Safari autenticado e incorporação auditável das provas individuais. Fallback estrito mantém RPC anterior somente quando a nova RPC ainda não existe; não há fallback de rede para Proesc V1.
Base remota: 4.8.151, main `56d927a7e25b9f1d6b5911e260a126bd34edd29d`; alterações de atividades preservadas. Versão 4.8.152 reservada por trabalho local paralelo, não incluído neste lote. Metadados compartilhados de publicação preparados sobre a base remota, preservando o conteúdo local paralelo.

## Contexto remoto anterior preservado

### Lote anterior: 2026-10-02-atividades-extra-retroativas-recuperaveis

Estado: CORREÇÃO 4.8.151, publicação condicionada à CI do commit. Prazos retroativos, edição protegida e arquivo recuperável na grade. Sem mudança de dados acadêmicos reais. Migração 20261002191442 aplicada e verificada em Universo; Smoke autenticado Safari pendente; o status de CI e publicação do frontend deve ser conferido no PR.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-02-atividades-extra-retroativas-recuperaveis.md` (22 arquivos).
Base: main `330810837211338b53ba10f7745d082ac8eb7464`, versão 4.8.150. Publicar somente o manifesto, com as verificações obrigatórias aprovadas.

## Contexto anterior preservado

### Lote anterior: 2026-10-01-caixa-mensal-carteira-conferencia

Estado: PUBLICAÇÃO PENDENTE 4.8.150. Mês/carteira separados; modal automático sem botão de atualização. Migrations 114–118 aplicadas: 22 retiradas recuperáveis e duas quitações de setembro comprovadas no portal. Outubro e parcelas futuras preservados. Testes e smoke local do modal aprovados. Divergência Caixa/Financeiro diagnosticada; ajuste desse fluxo aguarda decisão. XLS desconsiderado a pedido do usuário.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-01-caixa-mensal-carteira-conferencia.md` (30 arquivos).
Base 4.8.149: PR240, squash `a2a0c0d0e3f57380e5414a6bdc8249f157d39504`. Publicar somente o manifesto revisto, preservando alterações paralelas.
