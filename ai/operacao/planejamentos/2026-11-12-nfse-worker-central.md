# Reconciliação NFS-e central: etapa 2

Estado: implementação isolada; não aplicada, não ativada e sem ação fiscal real.

## Objetivo
Consultar operações já enviadas sem depender da sessão do navegador. A fila não prepara, assina, emite, cancela ou reenvia. O transporte fiscal permite apenas GET da própria DPS, nota e evento de cancelamento. O POST HTTP ao relay é apenas o envelope de transporte autenticado; seu método fiscal interno continua GET.

## Fluxo
1. Transição fiscal submetida gera job único ISSUE/CANCEL. PREVIEWED nunca entra.
2. Kickoff curto e cron de recuperação a cada minuto usam token próprio no Vault. Nenhum token aparece no SQL do cron.
3. Claim atômico SKIP LOCKED atribui token aleatório e lease de 90 segundos, com limite por polo.
4. Getter de material aceita somente job/token válidos e deriva polo/emitente/certificado da operação persistida. Não toma emprestado login/contexto do criador.
5. Consulta fiscal tem deadline de 45 segundos e valida contrato, XML e identidade. A1 só existe durante a execução e segue ao mesmo relay autorizado.
6. Persistência de prova exige lease atual, alvo exato, transição permitida e identidades XML. Triggers existentes atualizam as projeções e Realtime.
7. Resultado inconclusivo tem backoff 3/5/10/30/60/300 segundos. O kickoff cobre os primeiros intervalos; cron cobre os maiores e recuperação de lease.
8. Credencial/configuração indisponível mantém retry conservador a cada 15 minutos, revalidando o material atual; prova inválida bloqueia o job para inspeção. Falha transitória mantém retry. Erros no kickoff não desfazem resposta fiscal válida.

## Limites importantes
- O relay atual não transmite Retry-After. Em 429, o worker aplica espera conservadora de 300 segundos; não se afirma cumprimento de um header que não recebeu.
- Não há SLA de autorização: uma consulta só confirma quando existe prova válida.
- Job de cancelamento em análise continua pendente; somente CANCELLED comprovado altera o estado final.
- Acesso interno é por lease e alvo já submetido, não por impersonação de operador.
- Scheduler nasce desabilitado. Ativação é etapa separada após testes e implantação do endpoint autenticado.
- A fila preserva histórico e não exclui origem/recebível. Exibição de notas em abas é outra projeção.

## Gates antes de produção
Testes SQL de permissão, lease/token expirado, cross-target, XML divergente, terminal monotônico e certificado/polo; concorrência PostgreSQL real; Deno check/test; revisão independente de segurança; validação de deploy com token interno sem operação real; conferência de cron/controle; ativação explícita e observação dos jobs sem duplicidade. Estado atual: gates ainda em execução.

## Verificações locais realizadas
- Deno check do entrypoint: passou.
- Deno test: 6/6 passaram (autenticação, GET-only, escopo, lease, prova e estados).
- Fila PGlite isolada: passou (claim, CAS, terminal, throttle, elegibilidade e grants).
- PostgreSQL real, getter/prova e revisão independente: pendentes; não substituir por simulação.

## Implantação coordenada
Implantar Edge preservando verify_jwt=true. Cron envia Authorization com JWT anon legado do próprio projeto, previamente configurado somente em Vault (nfse_reconciliation_gateway_jwt), além do token próprio. Não usar service_role no header do cron. Scheduler rejeita JWT ausente, inválido, expirado, de outro projeto ou role diferente de anon; gateway verifica a assinatura. Manter control.enabled=false durante publicação. JWT anon sozinho não autoriza claim; handler exige segredo específico. Só habilitar após gates e verificação de endpoint/scheduler. Não registrar ou devolver tokens.
