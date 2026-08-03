update public.polos
set telefone = '(79) 99602-8316 / (79) 99861-7614'
where lower(coalesce(status, 'ativo')) = 'ativo';

update public.empresas
set telefone = '(79) 99602-8316 / (79) 99861-7614'
where ativo = true;
