import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pdvPrinterService, readPdvWorkstationId, rememberPdvWorkstationId } from './printer.service';
import { pdvPrinterQueryKeys, type SavePdvPrinterInput } from './printer.types';

export function usePrinterSettings(poloId?: string | null) {
  const activePolo = poloId && poloId !== 'todos' ? poloId : '';
  const currentPolo = useRef(activePolo);
  currentPolo.current = activePolo;
  const [selected, setSelected] = useState({ poloId: activePolo, id: readPdvWorkstationId(activePolo) });
  const stationId = selected.poloId === activePolo ? selected.id : readPdvWorkstationId(activePolo);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: pdvPrinterQueryKeys.settings(activePolo, stationId),
    queryFn: ({ signal }) => pdvPrinterService.getSettings(activePolo, stationId, signal),
    enabled: Boolean(activePolo), retry: false, staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const selectStation = (id: string) => {
    const station = query.data?.workstations.find(item => item.id === id && item.active && item.ownedByCurrentUser);
    if (!station) return;
    rememberPdvWorkstationId(activePolo, id);
    setSelected({ poloId: activePolo, id });
  };
  const resetStation = () => {
    rememberPdvWorkstationId(activePolo, null);
    setSelected({ poloId: activePolo, id: null });
  };
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    if (stationId && data.workstations.some(item => item.id === stationId && item.active && item.ownedByCurrentUser)) return;
    const fallback = data.workstations.find(item => item.id === data.selectedWorkstationId && item.active && item.ownedByCurrentUser);
    const id = fallback?.id || null;
    if (id === stationId) return;
    rememberPdvWorkstationId(activePolo, id);
    setSelected({ poloId: activePolo, id });
  }, [activePolo, query.data, stationId]);
  const register = useMutation({
    mutationFn: (input: { poloId: string; name: string; requestId: string }) => {
      if (query.data?.canManage !== true || input.poloId !== activePolo) throw new Error('Acesso indisponível para esta unidade.');
      return pdvPrinterService.registerWorkstation(input.poloId, input.name, input.requestId);
    },
    retry: false,
    onSuccess: async (station, input) => {
      if (currentPolo.current === input.poloId) {
        rememberPdvWorkstationId(input.poloId, station.id);
        setSelected({ poloId: input.poloId, id: station.id });
      }
      await queryClient.invalidateQueries({ queryKey: pdvPrinterQueryKeys.polo(input.poloId) });
    },
  });
  const save = useMutation({
    mutationFn: (input: { printer: SavePdvPrinterInput; requestId: string }) => {
      if (query.data?.canManage !== true || input.printer.poloId !== activePolo) throw new Error('Acesso indisponível para esta unidade.');
      return pdvPrinterService.savePrinter(input.printer, input.requestId);
    },
    retry: false,
    onSuccess: async (_printer, input) => {
      await queryClient.invalidateQueries({ queryKey: pdvPrinterQueryKeys.polo(input.printer.poloId) });
    },
  });
  return { query, activePolo, stationId, selectStation, resetStation, register, save };
}
