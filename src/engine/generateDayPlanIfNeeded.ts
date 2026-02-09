type CarbLabel = "low" | "medium" | "high";

type RulesV1 = {
  id: string;
  protein: { g_per_kg: Record<string, number> };
  carbs: {
    label_thresholds: { low_max_load: number; medium_max_load: number };
    g_per_kg_by_label: Record<CarbLabel, number>;
  };
  fat: { min_g_per_kg: number };
  energy: {
    weekly_delta_kcal: Record<string, number>;
    distribute_by_carb_label: Record<CarbLabel, number>;
  };
  workout_selection: {
    avoid_same_focus_days: number;
    max_high_load_in_row: number;
    high_load_min: number;
  };
};

type UserProfile = {
  sex: "male" | "female";
  age: number;
  height_cm: number;
  weight_kg: number;
  primary_goal: "fat_loss" | "recomp" | "muscle_gain";
  equipment: "gym" | "home" | "mixed";
  injuries: string[];
  days_available_per_week?: number; // 👈 opcional (si no está, usamos 4)
};

type Workout = {
  id: string;
  goal: string;
  type: string;
  equipment: "gym" | "home" | "mixed";
  training_load_score: number;
  muscle_focus: string[];
  constraints?: { avoid_if_injuries?: string[]; requires_equipment?: string[] };
};

type Menu = {
  id: string;
  kcal_total: number;
  carb_bias: CarbLabel;
  macros_g: { protein: number; carbs: number; fat: number };
};

type DayPlan = {
  schema_version: number;
  date: string;
  workout_id: string | null;
  menu_id: string;
  training_load_score: number;
  targets: {
    kcal: number;
    macros_g: { protein: number; carbs: number; fat: number };
    carb_label: CarbLabel;
  };
  meta: {
    is_training_day: boolean;
    reason?: string;
  };
  created_at: string;
};

function getJSON<T>(key: string): T {
  const raw = localStorage.getItem(key);
  if (!raw) throw new Error(`Missing localStorage key: ${key}`);
  return JSON.parse(raw) as T;
}

function setJSON(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

function addDaysISO(dateISO: string, deltaDays: number) {
  const d = new Date(dateISO + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function weekdayISO(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00.000Z");
  return d.getUTCDay(); // 0=Sun ... 6=Sat
}

function carbLabelFromLoad(rules: RulesV1, load: number): CarbLabel {
  if (load <= rules.carbs.label_thresholds.low_max_load) return "low";
  if (load <= rules.carbs.label_thresholds.medium_max_load) return "medium";
  return "high";
}

function calcTargets(rules: RulesV1, user: UserProfile, load: number) {
  const weight = user.weight_kg;

  const carbLabel = carbLabelFromLoad(rules, load);

  const pPerKg = rules.protein.g_per_kg[user.primary_goal];
  const protein = Math.round(weight * pPerKg);

  const cPerKg = rules.carbs.g_per_kg_by_label[carbLabel];
  const carbs = Math.round(weight * cPerKg);

  const minFat = Math.round(weight * rules.fat.min_g_per_kg);
  const fat = minFat;

  const kcal = protein * 4 + carbs * 4 + fat * 9;

  return { kcal, macros_g: { protein, carbs, fat }, carb_label: carbLabel };
}

function pickMenuForTargets(menus: Menu[], carbLabel: CarbLabel, targets: { kcal: number; protein: number; carbs: number; fat: number }): Menu {
  const sameLabel = menus.filter((m) => m.carb_bias === carbLabel);
  if (sameLabel.length === 0) throw new Error(`No menus available for carb_bias=${carbLabel}`);

  const score = (m: Menu) => {
    const dk = Math.abs(m.kcal_total - targets.kcal) / Math.max(1, targets.kcal);
    const dp = Math.abs(m.macros_g.protein - targets.protein) / Math.max(1, targets.protein);
    const dc = Math.abs(m.macros_g.carbs - targets.carbs) / Math.max(1, targets.carbs);
    const df = Math.abs(m.macros_g.fat - targets.fat) / Math.max(1, targets.fat);
    return dk + dp + dc + df;
  };

  return [...sameLabel].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  })[0];
}

function getPastPlans(date: string, daysBack: number): DayPlan[] {
  const out: DayPlan[] = [];
  for (let i = 1; i <= daysBack; i++) {
    const d = addDaysISO(date, -i);
    const raw = localStorage.getItem(`app:dayplan:${d}`);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // ignore corrupted
    }
  }
  return out;
}

// Patrón determinista por días disponibles (0=Sun..6=Sat)
function trainingDaysPattern(daysPerWeek: number): number[] {
  const n = Math.max(1, Math.min(7, Math.round(daysPerWeek)));
  switch (n) {
    case 1: return [2]; // Tue
    case 2: return [2, 5]; // Tue, Fri
    case 3: return [1, 3, 5]; // Mon, Wed, Fri
    case 4: return [1, 2, 4, 6]; // Mon, Tue, Thu, Sat
    case 5: return [1, 2, 3, 5, 6]; // Mon, Tue, Wed, Fri, Sat
    case 6: return [1, 2, 3, 4, 5, 6]; // Mon..Sat
    case 7: return [0, 1, 2, 3, 4, 5, 6]; // all
    default: return [1, 3, 5];
  }
}

function isTrainingDay(user: UserProfile, date: string): boolean {
  const n = user.days_available_per_week ?? 4;
  const pattern = trainingDaysPattern(n);
  return pattern.includes(weekdayISO(date));
}

function normalizeGoal(userGoal: UserProfile["primary_goal"]): string {
  // Mapeo simple para score
  if (userGoal === "fat_loss") return "fat_loss";
  if (userGoal === "recomp") return "recomp";
  // muscle_gain suele ir de la mano con fuerza
  return "strength";
}

function pickWorkoutRotating(user: UserProfile, rules: RulesV1, workouts: Workout[], date: string): Workout {
  const eligible = workouts.filter((w) => {
    if (w.equipment !== user.equipment) return false;

    const avoid = w.constraints?.avoid_if_injuries ?? [];
    if (avoid.some((tag) => user.injuries.includes(tag))) return false;

    return true;
  });

  if (eligible.length === 0) {
    throw new Error("No eligible workouts for user profile (equipment/injuries).");
  }

  const history = getPastPlans(date, 14); // miramos 2 semanas atrás
  const avoidDays = rules.workout_selection.avoid_same_focus_days;

  // streak de high-load recientes (contiguos)
  let highStreak = 0;
  for (const p of history) {
    if (!p.meta?.is_training_day) break;
    if (p.training_load_score >= rules.workout_selection.high_load_min) highStreak++;
    else break;
  }

  const recentFocus = new Set<string>();
  for (let i = 0; i < Math.min(avoidDays, history.length); i++) {
    const p = history[i];
    if (!p.workout_id) continue;
    const w = workouts.find(x => x.id === p.workout_id);
    if (!w) continue;
    for (const f of w.muscle_focus) recentFocus.add(f);
  }

  const targetGoal = normalizeGoal(user.primary_goal);

  // scoring determinista
  const candidates = eligible.map((w) => {
    let penalty = 0;

    // Evitar repetir foco
    const repeatsFocus = w.muscle_focus.some((f) => recentFocus.has(f));
    if (repeatsFocus) penalty += 1000;

    // Evitar demasiados high seguidos
    const isHigh = w.training_load_score >= rules.workout_selection.high_load_min;
    if (isHigh && highStreak >= rules.workout_selection.max_high_load_in_row) penalty += 2000;

    // Preferencia por goal
    if (w.goal !== targetGoal) penalty += 10;

    // Preferir alternancia “full_body” no repetida si se puede
    // (pequeña ayuda, no bloqueante)
    if (w.muscle_focus.includes("full_body") && recentFocus.has("full_body")) penalty += 50;

    return { w, penalty };
  });

  // Si todo queda penalizado por foco, relajamos esa regla (pero mantenemos high-streak)
  const minPenalty = Math.min(...candidates.map((c) => c.penalty));
  let pool = candidates;
  if (minPenalty >= 1000) {
    pool = candidates.map((c) => {
      const reduced = { ...c, penalty: c.penalty >= 1000 ? c.penalty - 1000 : c.penalty };
      return reduced;
    });
  }

  pool.sort((a, b) => {
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    return a.w.id.localeCompare(b.w.id);
  });

  return pool[0].w;
}

export function generateDayPlanIfNeeded(date: string) {
  const key = `app:dayplan:${date}`;
  if (localStorage.getItem(key)) return;

  const user = getJSON<UserProfile>("app:user");
  const rules = getJSON<RulesV1>("app:ruleset:rules_v1");
  const workouts = getJSON<Workout[]>("app:catalog:workouts");
  const menus = getJSON<Menu[]>("app:catalog:menus");

  const training = isTrainingDay(user, date);

  let workout: Workout | null = null;
  let load = 0;
  let reason = "";

  if (training) {
    workout = pickWorkoutRotating(user, rules, workouts, date);
    load = workout.training_load_score;
  } else {
    reason = "Rest day by weekly schedule";
    load = 0;
  }

  const targets = calcTargets(rules, user, load);
  const menu = pickMenuForTargets(menus, targets.carb_label, {
    kcal: targets.kcal,
    protein: targets.macros_g.protein,
    carbs: targets.macros_g.carbs,
    fat: targets.macros_g.fat
  });

  const dayPlan: DayPlan = {
    schema_version: 1,
    date,
    workout_id: workout ? workout.id : null,
    menu_id: menu.id,
    training_load_score: load,
    targets: {
      kcal: targets.kcal,
      macros_g: targets.macros_g,
      carb_label: targets.carb_label
    },
    meta: {
      is_training_day: training,
      ...(reason ? { reason } : {})
    },
    created_at: new Date().toISOString()
  };

  localStorage.setItem(key, JSON.stringify(dayPlan, null, 2));

  // index (opcional pero útil)
  const idxKey = "app:index:dayplans";
  const idxRaw = localStorage.getItem(idxKey);
  const idx: string[] = idxRaw ? JSON.parse(idxRaw) : [];
  if (!idx.includes(date)) {
    idx.push(date);
    idx.sort();
    setJSON(idxKey, idx);
  }
}
