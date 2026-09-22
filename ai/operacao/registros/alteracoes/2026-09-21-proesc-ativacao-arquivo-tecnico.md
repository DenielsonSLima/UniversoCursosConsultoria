# Ativação do arquivo técnico Proesc

Estado: APLICADO E VALIDADO.

## Objetivo e autorização

Ativar a rotina de histórico técnico privado e transferir o acervo elegível, conforme confirmação do usuário após o piloto recuperável. O trabalho é limitado a detalhes técnicos antigos; fatos financeiros, referências e autorização permanecem preservados.

## Critérios de aceite

- Piloto real identificado e aprovado antes da ativação.
- Até 25 execuções por lote, arquivo privado íntegro e origem conferida antes do commit.
- Concorrência limitada, respostas verificadas e recuperação sem perda de dados.
- Conferir o espaço real e a integridade após a transferência.
- Ajustes do Caixa pertencem a uma análise separada.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-21-proesc-ativacao-arquivo-tecnico.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `supabase/migrations/20260922004337_activate_proesc_technical_archive.sql`
- `supabase/tests/proesc_technical_archive_activation.readonly.sql`

Total: 7 arquivos.

## Validação

- Migration de ativação aplicada sob a versão `20260922004337`; fonte local renomeada conforme o ledger, sem alteração de conteúdo.
- Piloto real e restauração conferidos antes da ativação; rotina habilitada com um lote limitado por execução.
- Agendamento ativo nos minutos 9, 29 e 49, com comando e nome fixos conferidos. Auditoria inicial sem violações de integridade.
- Transferência sequencial do estoque elegível concluída; worker manual e ciclo automático seguinte confirmaram ausência de candidatos, sem lote pendente.
- Cada lote usou upload privado, download, conferência de integridade e revalidação da origem antes do commit.
- Manutenção física restrita às duas tabelas de pacotes técnicos: lock sem espera, prazo de cinco segundos, contagem e SHA do conteúdo completos idênticos antes/depois.
- Auditoria final sem objetos inválidos, sobreposição de fontes, referências ausentes, manifestos inválidos ou divergências nos totais examinados.
- Hashes das referências preservados; contagem, pagamentos, valores, datas e contas do comparativo financeiro sem alteração.
- Tamanho físico conferido após a manutenção; medidas operacionais e identificadores ficam fora deste repositório público.
- Build, versão, limite de linhas e contrato operacional/RAG aprovados. CI e Preview conferem o conteúdo exato da publicação.

## Limitações e acompanhamento

- O banco mantém fatos financeiros e metadados necessários à consulta, autorização e auditoria. O Storage e esses metadados continuam sujeitos a crescimento legítimo; não há garantia de capacidade gratuita indefinida.
- A confirmação de reutilização em um ciclo natural Proesc bem-sucedido continua pendente; a espera progressiva após falhas foi observada, sem forçar consultas financeiras para teste.
- O aviso de Fair Use pode refletir a média diária do período, mesmo depois de reduzir o tamanho atual, conforme a documentação do Supabase.
- A análise separada do Caixa identificou trabalho SQL repetido, espera na troca de polo e um cálculo financeiro no componente. Nenhuma correção desse módulo integra este lote; a medição autenticada pela interface permanece pendente.
