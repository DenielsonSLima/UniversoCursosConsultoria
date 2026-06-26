import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { bibliotecaQueryKeys } from '../biblioteca.queryKeys';

export function useFileExplorerRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('realtime-file-explorer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biblioteca_pastas' }, () => {
        queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.foldersRoot });
        queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.allFoldersMoveRoot });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biblioteca_documentos' }, () => {
        queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.documentsRoot });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
