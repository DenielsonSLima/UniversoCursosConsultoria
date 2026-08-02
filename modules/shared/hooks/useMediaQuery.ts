import { useEffect, useState } from 'react';

const getSnapshot = (query: string) => (
  typeof window !== 'undefined' && window.matchMedia(query).matches
);

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => getSnapshot(query));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);

    updateMatches();
    mediaQuery.addEventListener('change', updateMatches);
    return () => mediaQuery.removeEventListener('change', updateMatches);
  }, [query]);

  return matches;
};

export default useMediaQuery;
