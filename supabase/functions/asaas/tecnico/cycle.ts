export const TECNICO_CYCLE_INSTALLMENTS = 11;

export const isTecnicoCycleLaunch = (receivable: any) => {
  const launchType = String(receivable?.tipo_lancamento || "").toUpperCase();
  return ["MENSALIDADE", "REMATRICULA"].includes(launchType) && Boolean(receivable?.matricula_id);
};
