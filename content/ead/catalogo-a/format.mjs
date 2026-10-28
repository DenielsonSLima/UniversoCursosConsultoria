const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function defineCourse(metadata, modules, activityItems, examItems) {
  const revisionId = `ead-${metadata.slug}-20261027-v2`;
  const baseHours = Math.floor(metadata.hours / modules.length);
  const remainder = metadata.hours % modules.length;
  const lessons = modules.map((module, index) => ({
    id: `${revisionId}-aula-${index + 1}`,
    title: module.title,
    hours: baseHours + (index < remainder ? 1 : 0),
    skills: module.skills,
    sourceIds: module.sourceIds,
    html: `<h2>${escape(module.title)}</h2>` + module.sections.map((section) => (
      `<h3>${escape(section.title)}</h3>`
      + section.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join('\n')
    )).join('\n'),
  }));
  function assessment(items, kind) {
    return items.map((item, index) => ({
      id: `${revisionId}-${kind}-${index + 1}`,
      lessonId: lessons[item.module - 1].id,
      skill: item.skill,
      prompt: item.prompt,
      options: item.options,
      sourceIds: item.sourceIds || lessons[item.module - 1].sourceIds,
    }));
  }
  return {
    ...metadata,
    revisionId,
    lessons,
    activities: assessment(activityItems, 'atividade'),
    exam: assessment(examItems, 'questao'),
  };
}
