# Lote ativo

Estado: CONSULTA API PROESC E RECUPERAÇÃO BANESE — VALIDADO PARA PUBLICAÇÃO 4.8.52

## Lote: 2026-09-12-consulta-api-proesc-banese

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-consulta-api-proesc-banese.md`

- Pedido: painel Consulta API Proesc nas Configurações, semelhante ao Banese, com execuções, consultas, baixas e erros; revisar os erros Banese mostrados pelo usuário.
- Três frentes: ledger/RPC/worker Proesc, interface Proesc e diagnóstico/projeção Banese. Frontend apenas apresenta dados, filtros e paginação RPC. Sem controle de emissão/importação na nova tela.
- Ledger registra somente execuções futuras reais, com concessão atômica e dados sanitizados; importações anteriores não se tornam execuções automáticas. Campos financeiros exigem permissão adicional. Datas e durações desconhecidas permanecem nulas.
- Banese: 479 eventos históricos em 51 títulos; 478 eventos/50 títulos possuem consulta posterior bem-sucedida, 1 evento pertence a título atualmente pago/DONE sem GET posterior comprovada. Nenhuma falha ativa nesses títulos; worker, fila e valores preservados. Migration de recuperação aplicada, teste readonly aprovado.
- Usuário renovou explicitamente autorização para ajustar e publicar às 21:09. Base 4.8.51/02409544d1def71a655e2831c0a6c72cd30fc891. RPCs Proesc instaladas após revisão; seis unidades SQL isoladas aprovadas após índices, sem timeout no teste final. Não confundir falhas internas com recusa do token.
- Falha de Configurações no localhost: 504 OutdatedOptimizeDep reproduzido; reinício do servidor pelo arquivo de configuração regenerou dependências. Vinte leituras de dez ícones retornaram 200. Nenhuma mudança no código Vite necessária.
- Usuário pediu explicação de 56/110 exclusões do Caixa agosto/setembro Matriz. Diagnóstico somente leitura confirmou fonte UNKNOWN/REVIEW sem prova de baixa ou aberto integral. Em setembro, somente 20 das 110 já venceram; 90 ainda não. Preservada a exclusão da margem até obter evidência suficiente.

- Incidente às 21:24–21:26: timeout no teste combinado do novo painel coincidiu com HTTP500 de Caixa/Financeiro e falhas temporárias de Auth. Não há prova de corrupção; suspensos ensaios cumulativos, consultas agora isoladas. Financeiro/Caixa recuperados e conferidos na interface de produção. Helper de escopo em conjunto e índices de prova de pagamento aplicados; dashboard 2.475 ms na primeira carga; feeds de 23 a 913 ms nos testes finais.
- CNAB overview passa a ser carregado somente em Remessas, Retorno e Diagnóstico. Ausência do EDI7 aparece como configuração pendente; nenhuma credencial foi criada ou alterada.

- Edge Proesc v7 publicada, duas execuções reais de 60 cobranças concluídas sem falha e com telemetria completa. Safari autenticado confirmou Configurações, abas Proesc, paginação/polo, recuperação Banese e filtros Proesc/Banese de Conciliação. Build final 7,36 s; filtro e diagnóstico CNAB autenticados aprovados; publicação da interface autorizada via manifesto isolado.

## Entregas anteriores

- Caixa 4.8.51: PR145/02409544, CI/Vercel/HTTP200 e novas imagens do usuário confirmados. Registro: `ai/operacao/registros/alteracoes/2026-09-12-caixa-indicadores-mensais.md`.
- Conciliação 4.8.50: PR144/4b513e0, Vercel/HTTP200 confirmados; smoke autenticado final do filtro ainda pendente. Registro: `ai/operacao/registros/alteracoes/2026-09-12-conciliacao-origem-proesc-banese.md`.
- Importação 4.8.49: PR143/58a6675, nove turmas, 392 matrículas e 385 pessoas; 2.535 cobranças em conferência. Registro: `ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md`.
