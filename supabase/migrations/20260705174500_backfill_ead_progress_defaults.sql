update public.ead_aluno_progresso
set progress = jsonb_build_object(
  'completedContentIds', '[]'::jsonb,
  'completedActivityIds', '[]'::jsonb,
  'completedVideoIds', '[]'::jsonb,
  'activityAnswers', '{}'::jsonb,
  'quizAnswers', '{}'::jsonb
) || coalesce(progress, '{}'::jsonb)
where progress is null
  or not (progress ? 'completedContentIds')
  or not (progress ? 'completedActivityIds')
  or not (progress ? 'completedVideoIds')
  or not (progress ? 'activityAnswers')
  or not (progress ? 'quizAnswers');
