# Publicação e Recuperação

Status: CANÔNICO. Última revisão: 2026-08-12.

## Publicação

Produção exige pedido explícito e critérios de aceite confirmados.

Fluxo padrão:

1. Delimitar um lote coeso e o manifesto de arquivos.
2. Validar o fluxo diretamente afetado.
3. Atualizar versão e changelog quando houver alteração de produto.
4. Criar commit, branch, pull request e merge pelo conector GitHub autorizado.
5. Confirmar CI e preview.
6. Aplicar migration e implantar Edge Functions pelo conector Supabase
   autorizado, quando fizer parte do lote.
7. Confirmar o deploy de produção.
8. Registrar limitações reais, como smoke visual pendente.

As regras completas de lotes ficam em ai/operacao/PROTOCOLO_DE_LOTES.md.

## Banco e Edge Functions

- Nunca reaplicar migration já registrada no banco.
- Nunca editar uma migration aplicada; criar migration corretiva.
- Manter o arquivo de migration versionado no repositório.
- Ao republicar Edge Function, preservar a configuração de autenticação
  requerida por ela.
- Para financeiro, Auth e RLS, validar também autorização e caminho de falha.

## Recuperação e rollback

| Tipo de entrega | Recuperação segura |
| --- | --- |
| Frontend ou serviço | Reverter por novo commit ou pull request; confirmar preview antes de produção. |
| Migration | Criar migration compensatória; não apagar nem reescrever histórico aplicado. |
| Edge Function | Publicar a versão anterior conhecida ou uma correção explícita; confirmar configuração de JWT e segredos. |
| Configuração externa | Restaurar versão conhecida no provedor e registrar o motivo. |
| Dados pessoais ou financeiro | Parar a operação, preservar auditoria e seguir o procedimento autorizado; nunca corrigir por script improvisado. |

## Fontes de versão e histórico

- Versão oficial: internal/versioning/system-version.json.
- Histórico publicado: internal/versioning/CHANGELOG.md.
- Registro de lote: ai/operacao/registros/.
- Decisões arquiteturais: docs/decisions/.

