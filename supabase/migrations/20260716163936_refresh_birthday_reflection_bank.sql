ALTER TABLE public.whatsapp_birthday_settings
  ALTER COLUMN message_template SET DEFAULT '🎉 Bom dia, {{nome_aluno}}!

Hoje é um dia muito especial! A equipe da Universo Cursos e Consultoria deseja a você um feliz aniversário.

Que este novo ciclo seja repleto de saúde, paz, felicidade, conquistas e muito sucesso em sua caminhada.

Aproveite bastante o seu dia. Parabéns! 🎂🎈

Uma reflexão para o seu novo ciclo:

{{frase_aniversario}}';

UPDATE public.whatsapp_birthday_settings
SET message_template = '🎉 Bom dia, {{nome_aluno}}!

Hoje é um dia muito especial! A equipe da Universo Cursos e Consultoria deseja a você um feliz aniversário.

Que este novo ciclo seja repleto de saúde, paz, felicidade, conquistas e muito sucesso em sua caminhada.

Aproveite bastante o seu dia. Parabéns! 🎂🎈

Uma reflexão para o seu novo ciclo:

{{frase_aniversario}}',
    updated_at = now()
WHERE id = true;

DELETE FROM public.whatsapp_birthday_quote_bank;

INSERT INTO public.whatsapp_birthday_quote_bank (quote_text, author)
VALUES
  ('Cada novo ciclo é uma oportunidade de acreditar mais em si e seguir em direção aos seus sonhos.', 'Universo Cursos e Consultoria'),
  ('Que a experiência de ontem fortaleça suas escolhas e inspire os caminhos que começam hoje.', 'Universo Cursos e Consultoria'),
  ('A vida ganha novos sentidos quando escolhemos crescer com cada etapa da caminhada.', 'Universo Cursos e Consultoria'),
  ('Celebre o quanto você já avançou e mantenha a coragem para chegar ainda mais longe.', 'Universo Cursos e Consultoria'),
  ('Um novo ciclo começa cheio de possibilidades para quem continua acreditando em seu potencial.', 'Universo Cursos e Consultoria'),
  ('Que seus sonhos sejam maiores que seus medos e sua determinação maior que os desafios.', 'Universo Cursos e Consultoria'),
  ('O melhor presente de um novo ciclo é a oportunidade de escrever uma história ainda mais bonita.', 'Universo Cursos e Consultoria'),
  ('Cada conquista nasce da coragem de dar o primeiro passo e da persistência para continuar.', 'Universo Cursos e Consultoria'),
  ('Que esta nova etapa traga sabedoria para escolher, coragem para agir e motivos para agradecer.', 'Universo Cursos e Consultoria'),
  ('Sua caminhada é única; valorize cada aprendizado e confie nos próximos passos.', 'Universo Cursos e Consultoria'),
  ('Recomeçar também é uma forma de crescer e descobrir novas possibilidades.', 'Universo Cursos e Consultoria'),
  ('O futuro se transforma quando você acredita em si e cuida dos sonhos que deseja realizar.', 'Universo Cursos e Consultoria'),
  ('Que nunca faltem força para superar desafios e humildade para celebrar cada conquista.', 'Universo Cursos e Consultoria'),
  ('Mais importante que contar os anos é reconhecer tudo o que eles ensinaram.', 'Universo Cursos e Consultoria'),
  ('Cada dia deste novo ciclo pode ser uma nova oportunidade de evoluir e fazer a diferença.', 'Universo Cursos e Consultoria'),
  ('Acredite no seu caminho: grandes transformações começam com pequenas decisões.', 'Universo Cursos e Consultoria'),
  ('Que a gratidão pelo que passou se una à esperança por tudo o que ainda está por vir.', 'Universo Cursos e Consultoria'),
  ('Seu potencial cresce sempre que você escolhe aprender, persistir e tentar novamente.', 'Universo Cursos e Consultoria'),
  ('Um novo ano de vida é um convite para renovar sonhos e construir novas conquistas.', 'Universo Cursos e Consultoria'),
  ('Leve para o novo ciclo os aprendizados, a coragem e a certeza de que você pode ir além.', 'Universo Cursos e Consultoria');
