begin;

do $seed$
declare
  v_course_id uuid;
  v_course_count integer;
  v_module_id uuid;
  v_subject record;
  v_subject_id uuid;
  v_candidate_count integer;
  v_assessment_id uuid;
  v_version integer;
  v_published_count integer;
  v_draft_count integer;
begin
  select count(*), (array_agg(course.id))[1]
  into v_course_count, v_course_id
  from public.cursos course
  where upper(coalesce(course.modalidade, '')) = 'LIVRE'
    and pg_catalog.lower(extensions.unaccent(pg_catalog.btrim(course.nome))) = 'informatica basica';
  if v_course_count <> 1 then
    raise exception 'Seed de Informática Básica exige exatamente um Curso Livre normalizado; encontrados: %.',
      v_course_count;
  end if;

  select module.id into v_module_id
  from public.modulos module
  where module.curso_id = v_course_id
  order by case when pg_catalog.lower(extensions.unaccent(pg_catalog.btrim(module.nome)))
    = 'modulo unico' then 0 else 1 end, module.created_at, module.id
  limit 1;
  if v_module_id is null then
    insert into public.modulos(curso_id, nome)
    values (v_course_id, 'MÓDULO ÚNICO') returning id into v_module_id;
  else
    update public.modulos module set nome = 'MÓDULO ÚNICO'
    where module.id = v_module_id;
  end if;

  for v_subject in select * from (values
    ('INTRODUÇÃO À INFORMÁTICA', 8, 'Conceitos de informática, evolução dos computadores, tipos de equipamento e uso responsável da tecnologia.', array['introducao a informatica','introducao a informatica e ao computador']::text[]),
    ('HARDWARE E PERIFÉRICOS', 10, 'Componentes internos, processador, memória, armazenamento, portas, impressoras e manutenção preventiva.', array['hardware e perifericos','hardware e periferios']::text[]),
    ('SOFTWARES E SISTEMAS OPERACIONAIS', 10, 'Tipos de software, funções do sistema operacional, instalação segura, licenças e atualização de aplicativos.', array['softwares e sistemas operacionais','softwares e sistema operacionais']::text[]),
    ('MICROSOFT WINDOWS', 8, 'Área de trabalho, janelas, configurações, contas, atalhos e organização de pastas e arquivos no Windows.', array['microsoft windows','sistema operacional e organizacao de arquivos']::text[]),
    ('MICROSOFT WORD', 8, 'Criação, edição e formatação de documentos, tabelas, imagens, cabeçalhos, revisão e impressão.', array['microsoft word','editor de textos']::text[]),
    ('MICROSOFT EXCEL', 10, 'Células, referências, fórmulas, funções básicas, classificação, filtros, tabelas e gráficos.', array['microsoft excel','planilhas eletronicas']::text[]),
    ('MICROSOFT POWER POINT', 10, 'Planejamento de apresentações, layouts, temas, recursos visuais, transições e modo de apresentação.', array['microsoft power point','apresentacoes digitais']::text[]),
    ('PESQUISA NA INTERNET E DOWNLOAD', 8, 'Navegação, mecanismos de busca, avaliação de fontes, downloads seguros, e-mail e armazenamento em nuvem.', array['pesquisa na internet e download','internet, e-mail e seguranca digital']::text[]),
    ('COMPLEMENTOS', 8, 'Segurança digital, senhas, cópias de segurança, ergonomia, acessibilidade e integração das ferramentas estudadas.', array['complementos','projeto pratico de informatica']::text[])
  ) as subject(nome, carga, descricao, aliases)
  loop
    select count(*), (array_agg(discipline.id order by discipline.created_at, discipline.id))[1]
    into v_candidate_count, v_subject_id
    from public.disciplinas discipline
    join public.modulos module on module.id = discipline.modulo_id
    where module.curso_id = v_course_id
      and pg_catalog.lower(extensions.unaccent(pg_catalog.btrim(discipline.nome)))
        = any(v_subject.aliases);
    if v_candidate_count > 1 then
      raise exception 'Grade ambígua para a matéria canônica: %.', v_subject.nome;
    elsif v_candidate_count = 0 then
      insert into public.disciplinas(modulo_id, nome, carga_horaria, descricao)
      values (v_module_id, v_subject.nome, v_subject.carga, v_subject.descricao)
      returning id into v_subject_id;
    else
      update public.disciplinas discipline
      set modulo_id = v_module_id, nome = v_subject.nome,
          carga_horaria = v_subject.carga, descricao = v_subject.descricao
      where discipline.id = v_subject_id;
    end if;
    if not exists (
      select 1 from public.aulas lesson where lesson.disciplina_id = v_subject_id
    ) then
      insert into public.aulas(disciplina_id, titulo, carga_horaria)
      values (v_subject_id, 'Resumo e prática: ' || v_subject.nome, v_subject.carga);
    end if;
  end loop;

  if (
    select count(*) from public.disciplinas discipline
    join public.modulos module on module.id = discipline.modulo_id
    where module.curso_id = v_course_id
  ) <> 9 then
    raise exception 'Grade de Informática Básica possui matérias extras ou não reconhecidas.';
  end if;

  update public.cursos course
  set carga_horaria = 80,
      descricao = 'Curso prático de informática básica com Windows, Word, Excel, PowerPoint, internet, segurança digital e avaliação final.'
  where course.id = v_course_id;

  select count(*) into v_published_count
  from public.curso_livre_avaliacoes assessment
  where assessment.curso_id = v_course_id and assessment.status = 'PUBLICADA';
  if v_published_count = 0 then
    select count(*) into v_draft_count
    from public.curso_livre_avaliacoes assessment
    where assessment.curso_id = v_course_id and assessment.status = 'RASCUNHO';
    if v_draft_count <> 0 then
      raise exception 'Seed não sobrescreve rascunho de avaliação existente de Informática Básica.';
    end if;
    select coalesce(max(assessment.versao), 0) + 1 into v_version
    from public.curso_livre_avaliacoes assessment where assessment.curso_id = v_course_id;
    insert into public.curso_livre_avaliacoes(
      curso_id, versao, status, titulo, nota_minima_percentual,
      quantidade_sorteada, minimo_banco
    ) values (v_course_id, v_version, 'RASCUNHO', 'Prova Final — Informática Básica', 70, 10, 50)
    returning id into v_assessment_id;

    insert into public.curso_livre_questoes(
      avaliacao_id, enunciado, opcoes, resposta_correta, ativa
    )
    select v_assessment_id, question.enunciado,
      question.opcoes, question.correta, true
    from (values
      ('Qual componente executa instruções e cálculos no computador?', jsonb_build_array('Processador (CPU)','Monitor','Teclado','Gabinete'), 0),
      ('Qual memória perde seu conteúdo quando o computador é desligado?', jsonb_build_array('SSD','Memória RAM','HD','Pen drive'), 1),
      ('Qual dispositivo é usado principalmente para armazenamento permanente?', jsonb_build_array('Memória RAM','Cooler','SSD','Mouse'), 2),
      ('Qual dos itens é um periférico de entrada?', jsonb_build_array('Impressora','Monitor','Caixa de som','Teclado'), 3),
      ('Qual dos itens é um periférico de saída?', jsonb_build_array('Monitor','Scanner','Microfone','Webcam'), 0),
      ('Para que serve o cooler do computador?', jsonb_build_array('Imprimir','Resfriar componentes','Armazenar arquivos','Conectar à internet'), 1),
      ('Qual conexão é comum para teclado, mouse e pen drive?', jsonb_build_array('VGA','HDMI','USB','P2 de áudio'), 2),
      ('Antes de limpar componentes, qual é a primeira medida segura?', jsonb_build_array('Abrir programas','Molhar o gabinete','Aumentar o brilho','Desligar e desconectar o equipamento'), 3),
      ('O que é software?', jsonb_build_array('Conjunto de programas e instruções','Parte metálica do gabinete','Cabo de energia','Dispositivo de impressão'), 0),
      ('Qual é a função principal de um sistema operacional?', jsonb_build_array('Criar somente planilhas','Gerenciar hardware, arquivos e programas','Substituir o processador','Fornecer energia elétrica'), 1),
      ('Qual prática reduz falhas e riscos em aplicativos?', jsonb_build_array('Ignorar avisos','Desativar senhas','Manter atualizações em dia','Baixar de qualquer site'), 2),
      ('Software de código aberto caracteriza-se por:', jsonb_build_array('Não possuir licença','Ser sempre pago','Funcionar só na internet','Disponibilizar seu código conforme a licença'), 3),
      ('No Windows, onde ficam temporariamente arquivos excluídos?', jsonb_build_array('Lixeira','Painel de Controle','Área de Transferência','Gerenciador de Tarefas'), 0),
      ('Qual atalho normalmente copia um item selecionado?', jsonb_build_array('Ctrl+V','Ctrl+C','Ctrl+Z','Ctrl+P'), 1),
      ('Qual atalho normalmente cola um item copiado?', jsonb_build_array('Ctrl+X','Ctrl+A','Ctrl+V','Ctrl+F'), 2),
      ('Para renomear com segurança um arquivo, deve-se:', jsonb_build_array('Apagar a extensão sempre','Desligar o computador','Mover para a lixeira','Usar Renomear e preservar a extensão necessária'), 3),
      ('Uma pasta serve para:', jsonb_build_array('Organizar arquivos e outras pastas','Aumentar a memória RAM','Remover vírus automaticamente','Projetar slides'), 0),
      ('Qual recurso mostra aplicativos e processos em execução no Windows?', jsonb_build_array('Bloco de Notas','Gerenciador de Tarefas','Calculadora','Lixeira'), 1),
      ('No Word, qual alinhamento deixa o texto uniforme nas duas margens?', jsonb_build_array('Esquerda','Centralizado','Justificado','Direita'), 2),
      ('Qual recurso do Word identifica possíveis erros de escrita?', jsonb_build_array('Zoom','Quebra de página','Mala direta','Verificação ortográfica e gramatical'), 3),
      ('Para iniciar conteúdo em uma nova página no Word, use:', jsonb_build_array('Quebra de página','Sublinhado','Rodapé','Recuo'), 0),
      ('Cabeçalho e rodapé são usados para:', jsonb_build_array('Apagar páginas','Repetir informações nas margens das páginas','Calcular fórmulas','Compactar imagens'), 1),
      ('Antes de imprimir um documento, é recomendável:', jsonb_build_array('Fechar sem salvar','Excluir as margens','Conferir a visualização de impressão','Trocar a extensão'), 2),
      ('Qual formato preserva melhor o layout para compartilhar um documento final?', jsonb_build_array('TXT','CSV','XLSX','PDF'), 3),
      ('No Excel, uma fórmula normalmente começa com:', jsonb_build_array('Sinal de igual (=)','Ponto final','Arroba','Barra invertida'), 0),
      ('Qual função soma um intervalo de células no Excel?', jsonb_build_array('MÉDIA','SOMA','MÁXIMO','CONT.SE'), 1),
      ('A referência B3 indica:', jsonb_build_array('Planilha B, página 3','Linha B, coluna 3','Coluna B, linha 3','Arquivo B com três abas'), 2),
      ('Qual recurso exibe apenas linhas que atendem a critérios?', jsonb_build_array('Mesclar','Quebrar texto','Congelar painéis','Filtro'), 3),
      ('Para copiar uma fórmula para células vizinhas, pode-se usar:', jsonb_build_array('Alça de preenchimento','Cabeçalho','Rodapé','Comentário'), 0),
      ('Um gráfico no Excel é útil para:', jsonb_build_array('Proteger contra vírus','Representar dados visualmente','Instalar programas','Renomear pastas'), 1),
      ('Qual referência permanece fixa ao copiar uma fórmula?', jsonb_build_array('A1','A:A','$A$1','1:1'), 2),
      ('Antes de ordenar uma tabela, é importante:', jsonb_build_array('Apagar os títulos','Converter tudo em imagem','Desligar filtros','Selecionar corretamente o conjunto de dados'), 3),
      ('No PowerPoint, um slide é:', jsonb_build_array('Uma página da apresentação','Uma fórmula','Uma pasta do Windows','Um antivírus'), 0),
      ('O tema de uma apresentação define principalmente:', jsonb_build_array('A senha do arquivo','Cores, fontes e estilos visuais','A conexão de rede','As fórmulas'), 1),
      ('Para manter legibilidade nos slides, recomenda-se:', jsonb_build_array('Parágrafos longos','Muitas fontes diferentes','Texto objetivo e bom contraste','Todas as animações disponíveis'), 2),
      ('Transição no PowerPoint é o efeito:', jsonb_build_array('Aplicado a células','Usado para corrigir ortografia','Que compacta imagens','Entre um slide e outro'), 3),
      ('O modo Apresentação de Slides serve para:', jsonb_build_array('Exibir a apresentação ao público','Editar fórmulas','Formatar o disco','Gerenciar pastas'), 0),
      ('Ao usar imagem de terceiros em uma apresentação, deve-se:', jsonb_build_array('Remover a autoria','Verificar licença e citar a fonte quando necessário','Alterar apenas a cor','Afirmar que é própria'), 1),
      ('Qual operador ajuda a buscar uma expressão exata na internet?', jsonb_build_array('Parênteses','Asterisco','Aspas','Ponto e vírgula'), 2),
      ('Antes de confiar em uma informação online, deve-se:', jsonb_build_array('Compartilhar imediatamente','Ler somente o título','Usar o primeiro resultado','Comparar autoria, data e outras fontes'), 3),
      ('Download significa:', jsonb_build_array('Transferir um arquivo da internet para o dispositivo','Excluir um arquivo remoto','Enviar um arquivo para a internet','Criar uma senha'), 0),
      ('Qual sinal torna um download mais confiável?', jsonb_build_array('Promessa de prêmio','Site oficial e arquivo esperado','Muitos anúncios','Extensão desconhecida'), 1),
      ('Em um e-mail, o campo Cco serve para:', jsonb_build_array('Anexar arquivos','Definir assunto','Ocultar os destinatários entre si','Cancelar o envio'), 2),
      ('Armazenamento em nuvem permite:', jsonb_build_array('Aumentar a CPU','Dispensar toda senha','Funcionar sem internet em qualquer situação','Guardar e sincronizar arquivos em servidores remotos'), 3),
      ('Uma senha mais segura combina:', jsonb_build_array('Frase longa e caracteres variados','Apenas a data de nascimento','O mesmo código em todos os serviços','Nome do usuário'), 0),
      ('Autenticação em dois fatores adiciona:', jsonb_build_array('Um antivírus gratuito','Uma segunda verificação de identidade','Mais memória RAM','Um atalho no desktop'), 1),
      ('Phishing é uma tentativa de:', jsonb_build_array('Melhorar a conexão','Compactar arquivos','Enganar para obter dados ou credenciais','Atualizar o sistema'), 2),
      ('Backup é:', jsonb_build_array('Um tipo de monitor','Uma atualização automática','Um atalho de teclado','Uma cópia de segurança dos dados'), 3),
      ('Para reduzir desconforto no computador, recomenda-se:', jsonb_build_array('Ajustar postura, tela e fazer pausas','Usar a tela no brilho máximo','Trabalhar sem intervalos','Apoiar o notebook no colo por horas'), 0),
      ('Ao terminar em computador compartilhado, deve-se:', jsonb_build_array('Deixar contas abertas','Sair das contas e remover dados sensíveis','Salvar senhas no navegador','Desativar o bloqueio de tela'), 1)
    ) as question(enunciado, opcoes, correta);

    update public.curso_livre_avaliacoes assessment
    set status = 'PUBLICADA' where assessment.id = v_assessment_id;
  end if;
end;
$seed$;

commit;
