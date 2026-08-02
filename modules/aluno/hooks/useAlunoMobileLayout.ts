import useMediaQuery from '../../shared/hooks/useMediaQuery';

const ALUNO_MOBILE_MEDIA_QUERY = '(max-width: 767px)';

const useAlunoMobileLayout = () => useMediaQuery(ALUNO_MOBILE_MEDIA_QUERY);

export default useAlunoMobileLayout;
