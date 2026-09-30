# Cadastro de professor com polos identificados e Pix tipado

Estado: VALIDADO PARA PUBLICAÇÃO — PRODUÇÃO NÃO AUTORIZADA

## Objetivo e aceite

Corrigir a jornada de cadastro de professor para listar cada polo em uma linha própria, com nome e cidade/UF em duas linhas; exigir somente polo, nome e CPF; manter os demais campos opcionais; oferecer tipos controlados e formatação específica para chave Pix; e garantir feedback visível e persistência correta ao salvar.

## Causa confirmada

- O formulário inicializava e enviava `Corrente`, enquanto a restrição remota de `parceiros.tipo_conta` aceita `CORRENTE` ou `POUPANÇA`; o payload falharia mesmo quando o usuário deixasse o valor padrão.
- Qualquer polo real diferente dos dois UUIDs legados era convertido silenciosamente para `matriz`, fazendo `polo_id` e `polo_ids` receberem a unidade errada.
- A falha da mutation era substituída por uma mensagem genérica sobre CPF, ocultando o erro devolvido pelo banco.
- A validação nativa e o botão desabilitado não forneciam feedback de etapa consistente; o novo fluxo usa validação controlada e alerta inline.

## Manifesto explícito

- `modules/gestor/parceiros/components/formularioparceiros/professor/ParceiroProfessorForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorPersonalStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorEducationStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorPaymentStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorContactStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/professor-form.model.ts`
- `modules/gestor/parceiros/components/formularioparceiros/professor/professor-form.model.test.ts`
- `modules/gestor/parceiros/components/ParceiroFormHost.tsx`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/hooks/useParceirosMutations.ts`
- `modules/gestor/parceiros/parceiros.service.ts`
- `modules/gestor/parceiros/utils/parceiro-mappers.ts`
- `modules/gestor/parceiros/utils/parceiro-mappers.test.ts`
- `modules/gestor/parceiros/utils/parceiro-validators.ts`
- `modules/gestor/parceiros/utils/parceiro-validators.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-cadastro-professor-polos-pix.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 20 arquivos.

## Contratos preservados

- Nenhuma migration ou alteração de RLS foi necessária; a chave normalizada continua gravada na coluna existente `chave_pix`.
- O tipo da chave Pix orienta máscara e validação no cadastro, sem criar dependência de coluna ainda inexistente no banco.
- Atualizações parciais antigas de professor continuam aceitando CPF vazio; somente o cadastro novo exige CPF válido.
- E-mail, formação, vínculo, Pix, conta bancária, endereço, contato, foto e observações permanecem opcionais.
- A publicação é limitada a branch e Pull Request com Preview; produção depende de autorização separada.

## Validação

- Supabase remoto conferido em modo somente leitura: polos ativos possuem `nome`, `cidade` e `estado`; a restrição de tipo de conta aceita `CORRENTE` e `POUPANÇA`.
- 25 testes focados aprovados para cadastro mínimo, CPF obrigatório no create, múltiplos polos do professor, normalização bancária, telefone Pix brasileiro com DDD, dígitos verificadores de CNPJ alfanumérico, tipos/máscaras Pix e prevenção de envio automático ao entrar na etapa final.
- TypeScript sem emissão e ESLint do manifesto de implementação aprovados.
- Smoke local no Safari confirmou polos verticais em duas linhas, avanço com somente polo/nome/CPF, campos opcionais, máscara Pix por tipo, erro inline e envio somente no clique final.
- O smoke usou um harness temporário sem persistência; nenhum professor de teste foi inserido no banco.
- Build de produção e controle de versão `4.8.137` aprovados; os 20 arquivos do manifesto possuem no máximo 486 linhas.
- A auditoria global de linhas mantém 12 referências históricas a arquivos removidos, fora do manifesto e sem relação com esta correção.
- Índice RAG final recriado após integrar a base remota mais recente: 14 fontes e 80 trechos.
- Publicação remota limitada à branch `codex/cadastro-professor-polos-pix-4.8.137`, com um único commit, Pull Request e Preview Vercel; os links ficam no fechamento da entrega, sem promoção para produção.

## Riscos e pendências

- O ambiente de produção permanece na versão anterior até autorização explícita; portanto o fluxo autenticado pós-deploy deverá ser repetido antes de promover o Preview.
- A causa exata de não haver POST no clique observado em produção não pôde ser reconstruída retroativamente, mas o novo fluxo remove o bloqueio silencioso e mostra o erro real se a gravação falhar.
