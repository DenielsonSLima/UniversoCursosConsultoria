alter table public.whatsapp_birthday_settings
  add column if not exists meta_template_name text not null default 'mensage_de_aniversario',
  add column if not exists meta_template_language text not null default 'pt_BR',
  add column if not exists header_image_url text not null default 'https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/whatsapp-assets/aniversario/aniversario-universo.png',
  add column if not exists header_image_source_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-assets',
  'whatsapp-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

update public.whatsapp_birthday_settings
set
  meta_template_name = 'mensage_de_aniversario',
  meta_template_language = 'pt_BR',
  header_image_url = 'https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/whatsapp-assets/aniversario/aniversario-universo.png',
  header_image_source_url = 'https://scontent.whatsapp.net/v/t61.29466-34/679582721_1007301435522771_6945891303576289958_n.png?ccb=1-7&_nc_sid=8b1bef&_nc_ohc=L54juOr7sN8Q7kNvwHPIr5G&_nc_oc=AdpxbJJQqFI2Q3iFbbj6yKjXcieLXPvY9jtx-vTHMF1NTcIxy-0gNVXFK-2pMkh0NUng20Yq-RZSMpuRvQC36PER&_nc_zt=3&_nc_ht=scontent.whatsapp.net&edm=AH51TzQEAAAA&_nc_gid=5191EGfqz-ePykZjTcfK7Q&_nc_tpa=Q5bMBQGwev_OQOC2r9gmMmN5agUeguOPv7K7LIc8x9-ciI81NxI7k3_lJWcOdPzD6Id3uFSoWX_q66vRcw&oh=01_Q5Aa5AFDxKSnQ5vrwObG_CJzg9LOO1udSBAvdLIJd8FdnQVnow&oe=6A83ADC9',
  updated_at = now()
where id = true;

comment on column public.whatsapp_birthday_settings.meta_template_name is
  'Nome do modelo de marketing aprovado na Meta usado pelo agente de aniversario.';

comment on column public.whatsapp_birthday_settings.header_image_url is
  'Imagem publica enviada no cabecalho do modelo de aniversario aprovado na Meta.';
