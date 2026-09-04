# Lote ativo

Estado: `BACKEND APLICADO — PUBLICAÇÃO GITHUB/VERCEL EM ANDAMENTO`

## Lote: 2026-09-04-progresso-real-e-carne-no-financeiro-tecnico

- Pedido: tornar a emissão do ciclo técnico mensurável com percentual e contagem
  reais; reorganizar a identidade do aluno na tabela financeira; alternar as
  faixas visuais; e permitir abrir o carnê Banese diretamente em Gestão.
- Autorização: implementação, aplicação e publicação em produção autorizadas
  pelo gestor em 04/09/2026.
- Risco: crítico por envolver financeiro, Realtime, projeção Supabase e leitura
  dos documentos oficiais Banese.
- Registro e manifesto:
  `ai/operacao/registros/alteracoes/2026-09-04-progresso-real-e-carne-no-financeiro-tecnico.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-04-progresso-real-e-carne-no-financeiro-tecnico.md`

### Contrato de aceite

1. A barra começa em 0% e avança somente quando cada título BolePix for validado
   e persistido pelo backend, exibindo também `emitidos/total`.
2. Nenhum avanço é estimado pelo tempo e nenhuma chamada bancária é repetida
   para calcular progresso.
3. A tabela exibe CPF e matrícula abaixo do nome, sem coluna separada, com
   alternância visual acessível entre alunos.
4. O botão de carnê consulta pelo UUID exato da matrícula e reutiliza o mesmo
   catálogo, compositor vetorial e modal da Secretaria.
5. Carnê incompleto, ambíguo ou com menos de três títulos falha fechado; a ação
   nunca cria nem reemite cobranças.
