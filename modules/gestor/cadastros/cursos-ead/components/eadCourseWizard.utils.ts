import type { EadConfig } from '../../cadastros.types';

export const formatDuration = (minutes: number) => {
  if (!minutes) return '0min';
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}min`;
  }
  return `${remainingMinutes}min`;
};

export const normalizeVimeoVideoUrl = (value?: string) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  const iframeSrc = rawValue.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&');
  const sourceUrl = iframeSrc || rawValue;

  try {
    const parsed = new URL(sourceUrl);
    if (!parsed.hostname.includes('vimeo.com')) return sourceUrl;

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const videoId = parsed.hostname.includes('player.vimeo.com') && pathParts[0] === 'video'
      ? pathParts[1]
      : pathParts[0];

    return videoId ? `https://vimeo.com/${videoId}` : sourceUrl;
  } catch {
    return sourceUrl;
  }
};

export const getMainEadVideoUrl = (config?: EadConfig | null) => {
  const directUrl = normalizeVimeoVideoUrl((config as any)?.videoUrl || (config as any)?.videoPrincipalUrl);
  if (directUrl) return directUrl;

  const legacyVideo = (config?.conteudos || []).find((item: any) => String(item?.videoUrl || '').trim());
  return normalizeVimeoVideoUrl(legacyVideo?.videoUrl);
};

export const getVimeoEmbedUrl = (value?: string) => {
  const videoUrl = normalizeVimeoVideoUrl(value);
  if (!videoUrl) return '';

  try {
    const parsed = new URL(videoUrl);
    if (!parsed.hostname.includes('vimeo.com')) return '';
    const videoId = parsed.pathname.split('/').filter(Boolean)[0];
    return videoId ? `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479` : '';
  } catch {
    return '';
  }
};

export const normalizeChoiceAnswer = (
  options: string[] | undefined,
  answerIndex: number | undefined,
) => {
  const normalizedEntries = (options || [])
    .map((option, originalIndex) => ({
      option: String(option || '').trim(),
      originalIndex,
    }))
    .filter(({ option }) => Boolean(option));
  const remappedAnswerIndex = normalizedEntries.findIndex(
    ({ originalIndex }) => originalIndex === answerIndex,
  );

  return {
    options: normalizedEntries.map(({ option }) => option),
    answerIndex: remappedAnswerIndex >= 0 ? remappedAnswerIndex : 0,
  };
};
