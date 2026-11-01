# Conferência das correções LGPD

Data: 31/10/2026, America/Maceio.

## Participantes e método

Conferência assíncrona entre o coordenador e os três agentes solicitados pelo usuário:

- `lgpd_fotos`: armazenamento, transporte, capability documental e migração.
- `lgpd_dados_sensiveis`: cadastros, vacinas e integração de permissões.
- `lgpd_chat`: atendimento, anexos, diretório, categorias e revisão da IA/interface.
- Coordenador: integração sobre a base atual do GitHub, testes finais e publicação limitada ao manifesto.

Cada frente apresentou parecer e resultados; os agentes de dados e chat repetiram testes um do outro. A conferência não foi uma reunião com pessoas externas e não enviou mensagens fora desta sessão.

## Achados da conferência e decisões

| Ponto | Evidência | Decisão e validação |
| --- | --- | --- |
| Assinatura de fotos causava N+1 | Resposta com 21 fotos fazia 21 POSTs antes de devolver o JSON | Assinatura em lote com JWT original, deduplicação por resposta e sem cache entre sessões. Teste confirma um POST e negação parcial segura. |
| URL assinada de outro caminho podia ser aceita pelo transporte | Validação anterior conferia apenas prefixo de origem/bucket | Agora o caminho assinado deve coincidir com o solicitado. URLs externas ou de outro objeto são descartadas. |
| Categorias do modal não respeitavam o setor no default | Gestor de Secretaria podia receber Financeira como seleção inicial | Nova RPC projeta categorias e Geral pelo mesmo helper canônico do chat. A UI descarta opção retirada, bloqueia durante erro/conferência e não usa props/cache como autorização. |
| Cobertura de fotos usava helper de parceiros simulado | Os testes de Storage eram isolados do fechamento real de início/dashboard | Novo cenário aplica as funções reais de parceiros e fotos em conjunto, preservando titular/operador e negando início+comunicação sem finalidade de foto. |
| Árvore local divergia da base publicada | Main remoto contém entregas posteriores à base Git local | Entrega montada sobre `8e09334b231e39db5a6bd1cb6b244d29dd1db813`. Arquivos remotos preservados por hash; somente o manifesto é sobreposto. |

## Pareceres

- **Fotos:** favorável ao candidato GitHub. Sem perda de bytes ou nova exposição confirmada nos contratos examinados; cópia/hash precede remoção pública, com journal e quarentena.
- **Dados sensíveis:** favorável. Início não recebe cadastro completo; Gestão/Vacinas exige atribuição explícita e polo inclusive para global; acesso próprio não confere poder de validador.
- **Chat/IA:** favorável após correção de categorias. Diretório permanece mínimo; RLS, Storage, IDs e setor não têm bypass confirmado no escopo. IA exige habilitação aprovada e aviso, sem persistência nova.
- **Coordenação:** integrar somente os arquivos declarados e manter a implantação operacional separada da atualização do GitHub.

## Validação consolidada

Resultado na árvore candidata integral: **78 testes únicos aprovados**:

- 27 SQL/PGlite: fotos/journal (3), dados sensíveis/fotos (6), chat/diretório/categorias (18).
- 25 Node: transporte (10), sessão (3), capability (3), migração (6), handler IA (1), interação IA (1) e interação de categorias (1).
- 26 Deno: política de transcrição (8) e autorização compartilhada (18).

Também aprovados: tipos das três Edges, TypeScript global, lint global, teto global de linhas, versão/histórico e build integral com Node 24.22.1. A reconstrução integral da base remota preservou os históricos que faltavam na cópia local; o gate global passou sem apagar registros. O novo workflow `lgpd-security.yml` reproduz o conjunto sem dados reais ou chamadas a fornecedores.

## Limites preservados

- Safari nativo recuperado: smoke dos componentes reais com dados sintéticos e I/O simulado confirmou aviso de IA, cancelamento com zero chamadas, confirmação com uma chamada, setor Secretaria sem opção Financeira e início no setor autorizado. Política pública renderizada e conferida. O smoke autenticado contra o backend implantado permanece pendente da implantação autorizada.
- Nenhuma migration, Edge ou migração de fotos foi aplicada em produção nesta conferência.
- LGPD-01 só estará operacionalmente encerrado quando a fila e as origens públicas forem zeradas e a revogação/cache forem conferidos.
- Contratos de operadores, base legal documentada e temporalidade continuam sob decisão institucional. IA permanece bloqueada por padrão.
- A autorização deste turno é para atualizar o GitHub após revisar e testar. A entrega usa branch/PR e Preview; não promove produção nem mistura o candidato financeiro independente.

Os resultados finais e os identificadores de publicação serão registrados no [lote](../../ai/operacao/registros/alteracoes/2026-10-31-correcao-lgpd.md).

## Complemento de implantação — 01/11/2026

Produção e Supabase foram autorizados explicitamente após a conferência. A frente de fotos revisou o canal operacional MCP de uso único: aprovado, com sete testes SQL reais e um teste do handler. A capability não cria sessão humana, expira em cinco minutos, só pode ser emitida pelo proprietário do banco e não aceita caminhos, ator, modo ou motivo definidos pelo chamador externo. O journal e os hashes continuam protegendo retomada e preservação dos arquivos. Conjunto atualizado: 86 testes (34 SQL/PGlite, 26 Node, 26 Deno). O código das seis migrations originais foi preservado e seus prefixos alinhados ao ledger efetivo.

### Compatibilidade do Storage confirmada em produção

O HEAD dos links públicos removidos retornou HTTP400, impedindo o aceite conservador inicial. A Edge agora confere GET da mesma URL somente nesse caso, sem autenticação, parâmetro adicional ou bypass de cache. Aceita o formato legado apenas com Content-Type JSON, corpo máximo4KB, statusCode404 e código NoSuchKey/not_found. GET200/206, rede, redirect e erro genérico mantêm a pendência. A RPC final também exige origem ausente e cópia privada existente. Nove testes novos cobrem os caminhos; total atualizado95 (34 SQL/PGlite,35 Node,26 Deno). Código alinhado à documentação oficial: https://supabase.com/docs/guides/storage/debugging/error-codes.

### Aceite remoto das fotos — 01/11/2026

Migração encerrada:21/21 objetos concluídos,21 hashes SHA-256 verificados,21 cópias privadas presentes,2 em quarentena,19 referências canônicas atualizadas. Zero destinos ausentes, zero origens pessoais no bucket público, zero referências pessoais públicas atuais e zero falhas de objeto. Revogação dos links antigos conferida pela Edge antes de concluir cada job. Nenhuma operação em andamento. Última Edge de migração:v5, alinhada ao código final. Não houve descarte das duas fotos sem cadastro.

Advisors: os dois novos journals privados têm RLS sem políticas por negação intencional; anon/authenticated não os leem. Oito helpers autorizados passaram a constar no aviso genérico de SECURITY DEFINER para authenticated, com guardas e search_path vazio verificados. Os avisos anteriores de search_path(2), funções anônimas(14) e proteção de senhas permanecem fora deste lote; não foi declarada auditoria integral sem pendências.
