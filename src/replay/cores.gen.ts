// Von scripts/freeze-core.mjs erzeugt – nicht von Hand ändern.
// Sim-Klassen der eingefrorenen Kerne (server/cores/v*/) für die Wiedergabeseite (src/replay).
import { Sim as v0_2_0 } from '../../server/cores/v0.2.0/sim/sim';
import { Sim as v0_3_0 } from '../../server/cores/v0.3.0/sim/sim';
import { Sim as v0_4_0 } from '../../server/cores/v0.4.0/sim/sim';
import { Sim as v0_4_1 } from '../../server/cores/v0.4.1/sim/sim';
import { Sim as v0_5_0 } from '../../server/cores/v0.5.0/sim/sim';
import { Sim as v0_5_1 } from '../../server/cores/v0.5.1/sim/sim';
import { Sim as v0_5_2 } from '../../server/cores/v0.5.2/sim/sim';
import { Sim as v0_6_0 } from '../../server/cores/v0.6.0/sim/sim';
import { Sim as v0_6_1 } from '../../server/cores/v0.6.1/sim/sim';
import { Sim as v1_0_0 } from '../../server/cores/v1.0.0/sim/sim';
import { Sim as v1_0_1 } from '../../server/cores/v1.0.1/sim/sim';
import { Sim as v1_1_0 } from '../../server/cores/v1.1.0/sim/sim';
import { Sim as v1_2_0 } from '../../server/cores/v1.2.0/sim/sim';
import { Sim as v1_3_0 } from '../../server/cores/v1.3.0/sim/sim';

/** Spielversion → Sim-Klasse dieser Version */
export const FROZEN_SIMS: Record<string, unknown> = {
  '0.2.0': v0_2_0,
  '0.3.0': v0_3_0,
  '0.4.0': v0_4_0,
  '0.4.1': v0_4_1,
  '0.5.0': v0_5_0,
  '0.5.1': v0_5_1,
  '0.5.2': v0_5_2,
  '0.6.0': v0_6_0,
  '0.6.1': v0_6_1,
  '1.0.0': v1_0_0,
  '1.0.1': v1_0_1,
  '1.1.0': v1_1_0,
  '1.2.0': v1_2_0,
  '1.3.0': v1_3_0,
};
