update public.polos
set cidade = case regexp_replace(cnpj, '[^0-9]', '', 'g')
  when '13278137000154' then 'JAPOATÃ'
  when '13278137000235' then 'AQUIDABÃ'
  when '13278137000316' then 'PORTO DA FOLHA'
  when '13278137000405' then 'PROPRIÁ'
  else cidade
end
where regexp_replace(cnpj, '[^0-9]', '', 'g') in (
  '13278137000154',
  '13278137000235',
  '13278137000316',
  '13278137000405'
);

update public.empresas
set cidade = 'JAPOATÃ'
where regexp_replace(cnpj, '[^0-9]', '', 'g') = '13278137000154';
