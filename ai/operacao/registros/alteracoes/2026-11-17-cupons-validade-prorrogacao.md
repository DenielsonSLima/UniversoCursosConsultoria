# Cupons EAD: validade e prorrogação

## Escopo
Corrigir indicação indevida de Ativo após expiração; permitir prorrogação explícita somente do término. Sem modificar cupons reais, quotas, resgates, autorização, checkout ou banco.

## Manifesto explícito
- `modules/gestor/secretaria/cupons-ead/CuponsEadPage.tsx`
- `modules/gestor/secretaria/cupons-ead/components/CuponsEadList.tsx`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.css`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.status.ts`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.status.test.ts`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.extension.test.mjs`
- `modules/gestor/secretaria/cupons-ead/hooks/useCupomClock.ts`
- `modules/gestor/secretaria/cupons-ead/formularios/cupom-extension.model.ts`
- `modules/gestor/secretaria/cupons-ead/formularios/CupomExtendDialog.tsx`
- `ai/operacao/registros/alteracoes/2026-11-17-cupons-validade-prorrogacao.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 12 arquivos.

## Aceite
Expirado a partir do instante final; Agendado antes do início; Desativado e Esgotado coexistem quando aplicáveis. Relógio atualiza tela aberta e após foco. Prorrogação exige data futura e superior ao fim anterior, preservando início exato, benefício, estado, limites e utilizações. Não reativa nem libera quotas automaticamente. Cancelamento e falha não alteram dados.

## Validação
19 testes sintéticos de status, extensão e fluxo de gerenciamento passaram; revisão independente aprovada. Build e CI/Preview conferidos no fechamento. Smoke autenticado Safari pendente; nenhum teste com resgate real.

## Publicação
PR draft/Preview sobre main 8ddd71ddd900b46e4c3d6778e399778432ccd371. Produção depende de autorização explícita; não publicar sem ela.
