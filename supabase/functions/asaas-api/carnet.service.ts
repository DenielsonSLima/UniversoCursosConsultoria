import { createTecnicoCarnetService } from "../asaas/tecnico/carnet.ts";

export const createAsaasCarnetService = (admin: any, _syncReceivable: unknown) => {
  const tecnicoCarnet = createTecnicoCarnetService(admin);

  return {
    generateOfficialCarnet: tecnicoCarnet.generateOfficialCarnet,
  };
};
