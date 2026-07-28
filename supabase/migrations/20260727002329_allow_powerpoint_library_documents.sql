-- Allow PowerPoint presentations in the digital library.

alter table public.biblioteca_documentos
  drop constraint if exists biblioteca_documentos_tipo_arquivo_check;

alter table public.biblioteca_documentos
  add constraint biblioteca_documentos_tipo_arquivo_check
  check (tipo_arquivo in ('PDF', 'DOC', 'XLS', 'PPT', 'IMG', 'VIDEO', 'OTHER'));
