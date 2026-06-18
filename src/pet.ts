// Pure Tamagotchi state model for Bob. No VS Code APIs in here so it stays
// easy to reason about and test. The extension host owns one PetEngine and
// streams snapshots to the webview.

export type Activity =
  | "idle"
  | "building"
  | "waking"
  | "hungry"
  | "fed"
  | "celebrate"
  | "sleeping"
  | "gone";

export interface PetSnapshot {
  name: string;
  /** 0 = starving, 100 = full */
  fullness: number;
  /** 0 = exhausted, 100 = rested */
  energy: number;
  /** 0 = miserable, 100 = delighted */
  happiness: number;
  /** Current visual state the webview should play. */
  activity: Activity;
  /** A short human-readable mood label that maps to a speech line. */
  mood: string;
  /** Age in whole days since this Bob was hatched. */
  ageDays: number;
  isAsleep: boolean;
  isGone: boolean;
}

export interface PetConfig {
  idleSleepMinutes: number;
  statDecayMinutes: number;
  permadeath: boolean;
}

interface PetData {
  name: string;
  fullness: number;
  energy: number;
  happiness: number;
  bornAt: number;
  lastTick: number;
  lastActivityAt: number;
  isAsleep: boolean;
  isGone: boolean;
  /** Timestamp until which the celebration animation should keep playing. */
  celebrateUntil: number;
  /** Timestamp until which Bob keeps stacking bricks (coding in progress). */
  buildingUntil: number;
  /** Timestamp until which the "mmm tasty" fed reaction shows. */
  fedUntil: number;
  /** Timestamp until which the "what should we build next?" prompt shows. */
  promptUntil: number;
  /** Timestamp until which Bob is getting up / throwing off his blanket. */
  wakingUntil: number;
}

const CLAMP = (n: number) => Math.max(0, Math.min(100, n));
const MINUTE = 60_000;

/** Below this fullness Bob is hungry: he rubs his tummy and asks to be fed. */
const HUNGRY_THRESHOLD = 30;

/** How long Bob spends throwing off the blanket and getting up before building. */
const WAKE_MS = 1300;

export function freshPet(name: string, now: number): PetData {
  return {
    name,
    fullness: 80,
    energy: 90,
    happiness: 85,
    bornAt: now,
    lastTick: now,
    lastActivityAt: now,
    isAsleep: false,
    isGone: false,
    celebrateUntil: 0,
    buildingUntil: 0,
    fedUntil: 0,
    promptUntil: 0,
    wakingUntil: 0,
  };
}

export class PetEngine {
  private data: PetData;
  private config: PetConfig;

  constructor(data: PetData | undefined, config: PetConfig, now: number) {
    this.data = { ...freshPet("Bob", now), ...(data ?? {}) };
    this.config = config;
  }

  updateConfig(config: PetConfig): void {
    this.config = config;
  }

  serialize(): PetData {
    return this.data;
  }

  /** User fed Bob: tops up fullness, a quick "mmm tasty", no celebration. */
  feed(now: number): void {
    if (this.data.isGone) {
      return;
    }
    this.data.isAsleep = false;
    this.data.lastActivityAt = now;
    this.data.fullness = CLAMP(this.data.fullness + 40);
    this.data.happiness = CLAMP(this.data.happiness + 12);
    this.data.fedUntil = now + 3200;
  }

  /** Manually wake Bob from a nap. */
  wake(now: number): void {
    if (this.data.isGone) {
      return;
    }
    this.data.isAsleep = false;
    this.data.lastActivityAt = now;
  }

  /**
   * Called once on extension startup. Skips the catch-up decay for however
   * long the editor was closed (otherwise he'd boot starving), clears stale
   * transient timers, and makes sure he wakes up ready rather than hungry.
   */
  bootReset(now: number): void {
    if (this.data.isGone) {
      return;
    }
    this.data.lastTick = now;
    this.data.lastActivityAt = now;
    this.data.isAsleep = false;
    this.data.celebrateUntil = 0;
    this.data.buildingUntil = 0;
    this.data.fedUntil = 0;
    this.data.promptUntil = 0;
    this.data.wakingUntil = 0;
    this.data.fullness = Math.max(this.data.fullness, 70);
    this.data.energy = Math.max(this.data.energy, 70);
  }

  /** Start over with a brand-new Bob. */
  reset(now: number, name = "Bob"): void {
    this.data = freshPet(name, now);
  }

  /** Coding is happening: Bob stacks bricks (waking up first if asleep). */
  registerCoding(now: number): void {
    if (this.data.isGone) {
      return;
    }
    if (this.data.isAsleep) {
      // Throw off the blanket and get up before any bricks get laid.
      this.data.wakingUntil = now + WAKE_MS;
      this.data.isAsleep = false;
    }
    this.data.lastActivityAt = now;
    // If he is still getting up, building begins once the wake-up finishes.
    const startBuild = Math.max(now, this.data.wakingUntil);
    this.data.buildingUntil = startBuild + 1500;
    this.data.happiness = CLAMP(this.data.happiness + 0.4);
  }

  /** A large block just finished: Bob celebrates the completed building. */
  registerBigBlock(now: number): void {
    if (this.data.isGone) {
      return;
    }
    this.data.isAsleep = false;
    this.data.lastActivityAt = now;
    this.data.buildingUntil = 0;
    this.data.celebrateUntil = now + 3000;
    // After celebrating, Bob asks what's next for a few seconds.
    this.data.promptUntil = now + 3000 + 4500;
    this.data.happiness = CLAMP(this.data.happiness + 10);
  }

  /** Advance time: apply decay, idle-sleep, energy recovery, and death. */
  tick(now: number): void {
    if (this.data.isGone) {
      return;
    }
    const elapsedMin = Math.max(0, (now - this.data.lastTick) / MINUTE);
    this.data.lastTick = now;

    const decayPerMin = 100 / Math.max(1, this.config.statDecayMinutes * 8);
    const idleMin = (now - this.data.lastActivityAt) / MINUTE;

    // Fall asleep after the idle threshold.
    if (!this.data.isAsleep && idleMin >= this.config.idleSleepMinutes) {
      this.data.isAsleep = true;
    }

    // Hunger always creeps down.
    this.data.fullness = CLAMP(this.data.fullness - decayPerMin * elapsedMin);

    if (this.data.isAsleep) {
      // Sleeping recovers energy faster than it drains anything else.
      this.data.energy = CLAMP(this.data.energy + decayPerMin * 2 * elapsedMin);
    } else {
      // Awake and idle slowly tires and saddens him.
      this.data.energy = CLAMP(this.data.energy - decayPerMin * 0.6 * elapsedMin);
    }

    // Happiness suffers when he is hungry or tired.
    const wellbeing = (this.data.fullness + this.data.energy) / 2;
    if (wellbeing < 35) {
      this.data.happiness = CLAMP(this.data.happiness - decayPerMin * elapsedMin);
    } else if (this.data.isAsleep) {
      this.data.happiness = CLAMP(this.data.happiness + decayPerMin * 0.3 * elapsedMin);
    }

    // Neglect consequences.
    const starving = this.data.fullness <= 0 && this.data.happiness <= 0;
    if (starving && this.config.permadeath) {
      this.data.isGone = true;
    }
  }

  snapshot(now: number): PetSnapshot {
    const d = this.data;
    const ageDays = Math.floor((now - d.bornAt) / (24 * 60 * MINUTE));

    let activity: Activity;
    let mood: string;

    if (d.isGone) {
      activity = "gone";
      mood = "gone";
    } else if (d.isAsleep) {
      activity = "sleeping";
      mood = d.energy < 50 ? "exhausted" : "sleeping";
    } else if (now < d.celebrateUntil) {
      activity = "celebrate";
      mood = "thrilled";
    } else if (now < d.fedUntil) {
      activity = "fed";
      mood = "fed";
    } else if (now < d.wakingUntil) {
      activity = "waking";
      mood = "waking";
    } else if (now < d.buildingUntil) {
      activity = "building";
      mood = "building";
    } else if (now < d.promptUntil) {
      activity = "idle";
      mood = "prompt";
    } else if (d.fullness < HUNGRY_THRESHOLD) {
      activity = "hungry";
      mood = "hungry";
    } else {
      activity = "idle";
      mood = this.deriveIdleMood();
    }

    return {
      name: d.name,
      fullness: Math.round(d.fullness),
      energy: Math.round(d.energy),
      happiness: Math.round(d.happiness),
      activity,
      mood,
      ageDays,
      isAsleep: d.isAsleep,
      isGone: d.isGone,
    };
  }

  private deriveIdleMood(): string {
    const d = this.data;
    if (d.energy < 25) {
      return "sleepy";
    }
    if (d.happiness < 30) {
      return "sad";
    }
    if (d.happiness > 75) {
      return "happy";
    }
    return "content";
  }
}
