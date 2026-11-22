// Von scripts/freeze-core.mjs erzeugt – nicht von Hand ändern.
// Eingefrorene Sim-Kerne älterer Versionen (server/cores/v*/) für die Nachsimulation nach Updates.
import { simulateReplay as v0_2_0 } from '../cores/v0.2.0/sim/replay';
import { simulateReplay as v0_3_0 } from '../cores/v0.3.0/sim/replay';
import { simulateReplay as v0_4_0 } from '../cores/v0.4.0/sim/replay';
import { simulateReplay as v0_4_1 } from '../cores/v0.4.1/sim/replay';
import { simulateReplay as v0_5_0 } from '../cores/v0.5.0/sim/replay';
import { simulateReplay as v0_5_1 } from '../cores/v0.5.1/sim/replay';
import { simulateReplay as v0_5_2 } from '../cores/v0.5.2/sim/replay';
import { simulateReplay as v0_6_0 } from '../cores/v0.6.0/sim/replay';
import { simulateReplay as v0_6_1 } from '../cores/v0.6.1/sim/replay';
import { simulateReplay as v1_0_0 } from '../cores/v1.0.0/sim/replay';
import { simulateReplay as v1_0_1 } from '../cores/v1.0.1/sim/replay';
import { simulateReplay as v1_1_0 } from '../cores/v1.1.0/sim/replay';
import { simulateReplay as v1_2_0 } from '../cores/v1.2.0/sim/replay';
import { simulateReplay as v1_3_0 } from '../cores/v1.3.0/sim/replay';

export type FrozenSim = (replay: never) => { score: number; sector: number; kills: number; ticks: number; credits: number; valid: boolean; error?: string };

export const FROZEN_CORES: Record<string, FrozenSim> = {
  '0.2.0': v0_2_0 as unknown as FrozenSim,
  '0.3.0': v0_3_0 as unknown as FrozenSim,
  '0.4.0': v0_4_0 as unknown as FrozenSim,
  '0.4.1': v0_4_1 as unknown as FrozenSim,
  '0.5.0': v0_5_0 as unknown as FrozenSim,
  '0.5.1': v0_5_1 as unknown as FrozenSim,
  '0.5.2': v0_5_2 as unknown as FrozenSim,
  '0.6.0': v0_6_0 as unknown as FrozenSim,
  '0.6.1': v0_6_1 as unknown as FrozenSim,
  '1.0.0': v1_0_0 as unknown as FrozenSim,
  '1.0.1': v1_0_1 as unknown as FrozenSim,
  '1.1.0': v1_1_0 as unknown as FrozenSim,
  '1.2.0': v1_2_0 as unknown as FrozenSim,
  '1.3.0': v1_3_0 as unknown as FrozenSim,
};
