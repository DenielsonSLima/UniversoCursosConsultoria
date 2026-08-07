-- Allow PowerPoint MIME types in the dedicated digital-library bucket.

update storage.buckets
set allowed_mime_types = array(
  select distinct mime_type
  from unnest(
    coalesce(allowed_mime_types, '{}'::text[])
    || array[
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
  ) as mime_type
)
where id = 'biblioteca';
