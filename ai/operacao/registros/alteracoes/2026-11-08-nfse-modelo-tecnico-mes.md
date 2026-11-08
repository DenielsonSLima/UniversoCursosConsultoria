# NFS-e — modelo de curso técnico e mês dos recebimentos

## Objetivo e aceite

Cadastrar modelo para educação profissional técnica de nível médio, condição confirmada pelo usuário. Disponibilizar `{{mes_referencia}}` na descrição, expandida pela RPC como mês por extenso em português e ano. Na preparação, usar o mês dos recebimentos selecionados; não o mês do cabeçalho quando diferente nem a competência fiscal das parcelas.

Editor com inserção do marcador e prévia do texto, sem cálculo no frontend. Marcadores desconhecidos ou malformados falham na prévia e no salvamento. Preservar autorização, escopo, idempotência e auditoria do cadastro de modelos.

## Manifesto explícito

- `modules/gestor/emissor-nfse/modelos/NfseDescriptionPreview.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelDescriptionEditor.tsx`
- `modules/gestor/emissor-nfse/modelos/nfse-description-preview.css`
- `modules/gestor/emissor-nfse/modelos/hooks/useNfseModelDescriptionPreview.ts`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelServiceFields.tsx`
- `modules/gestor/emissor-nfse/preparar/PrepararNfseTab.tsx`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.service-core.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.test.ts`
- `modules/gestor/emissor-nfse/modelos/queries/nfse-models.keys.ts`
- `supabase/migrations/20261108233250_nfse_model_reference_month.sql`
- `supabase/tests/nfse_models.isolated.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-08-nfse-modelo-tecnico-mes.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 20 arquivos.

## Contrato e fontes

- Anexo B de produção: CTN 080101 e NBS 122020000 como candidatos para o curso técnico formal confirmado pelo usuário. Conferência de cadastro municipal segue distinta da lista nacional.
- `dCompet` no Anexo I refere-se à prestação/fato gerador, não ao pagamento. O texto proposto usa “Valores recebidos em” para permitir pagamentos de mensalidades de outros meses sem alterar a competência.
- Descrição proposta: `Serviços de educação profissional técnica de nível médio. Valores recebidos em {{mes_referencia}}.`
- O indicador da operação depende da forma/local da prestação. Sem confirmação de prestação integralmente presencial, não presumir indicador.
- Consulta cadastral federal atual protegida por CAPTCHA; fontes secundárias indicam sociedade empresária limitada/CNAE técnico. Código municipal de Japoatã 437/2017, arts. 8–9/124–125: sem benefício específico comprovado. TRIBUTAVEL adotado como hipótese revisável para preparação, sem definir alíquota/retenção. A consulta de CNPJ e o tratamento de ISS do modelo são registrados no recibo sem dados pessoais. Ser escola isoladamente não comprova imunidade.
- Documentação de produção: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual

## Validação e entrega

Migration nova com função privada de expansão literal, trigger de validação da descrição e RPC pública restrita ao contexto/polo autorizado. As migrations anteriores permanecem imutáveis. Nenhuma emissão, alteração de pagamentos ou valor fiscal pertence a este lote.

Testes focados verificam meses/anos, acentos, repetição do marcador, texto estático, ausência de avaliação de expressões, limites, rejeição de variáveis desconhecidas e autorização antes da prévia. 10 testes SQL do contrato de modelos aprovados; funções privadas e grants conferidos no banco real. A migration foi aplicada pelo MCP Supabase. 67 testes frontend passaram. Smoke Safari local confirmou inserção do marcador, prévia por extenso, seletores CTN/NBS, salvamento sintético e descrição na preparação. Cadastro real e smoke autenticado são conferidos após publicação. A versão 4.8.267 foi publicada por lote paralelo; este lote parte dela como 4.8.268. Metadados compostos sobre a base remota, preservando alterações paralelas do checkout.
