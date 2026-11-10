export interface DiarioExtraClasseActivity {
  id: string;
  titulo: string;
  cargaHoraria: number;
  /** Data acadêmica efetiva devolvida pelo backend, sem conversão no cliente. */
  dataSource: string;
  /** Sessão da aula de origem; null mantém legado sem associação inferida. */
  aulaOrigemId?: string | null;
}

/** Crédito acadêmico separado da chamada presencial e congelado na assinatura. */
export interface DiarioExtraClassCredit {
  schemaVersion: 1;
  activities: DiarioExtraClasseActivity[];
  /** Intercala encontros e complementos na ordem canônica devolvida pelo banco. */
  contentOrder?: Array<{ tipo: 'AULA' | 'EXTRA_CLASSE'; id: string }>;
  eligibleActivityIdsByStudent: Record<string, string[]>;
}
