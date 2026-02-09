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
};

type UserProfile = {
  sex: "male" | "female";
  age: number;
  height_cm: number;
  weight_kg: number;
  primary_goal: "fat_loss" | "recomp" | "muscle_gain";
  equipment: "gym" | "home" | "mixed";
  injuries: string[];
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

function getJSON<T>(key: string): T {
  const raw = localStorage.getItem(key);
  if (!raw) throw new Error(`Missing localStorage key: ${key}`);
  return JSON.parse(raw) as T;
}

function carbLabelFromLoad(rules: RulesV1, load: number): CarbLabel {
  if (load <= rules.carbs.label_thresholds.low_max_load) return "low";
  if (load <= rules.carbs.label_thresholds.medium_max_load) return "medium";
  return "high";
}

function pickWorkout(user: UserProfile, workouts: Workout[]): Workout {
  const eligible = workouts.filter((w) => {
    if (w.equipment !== user.equipment) return false;

    // Injury filter (simple intersection)
    const avoid = w.constraints?.avoid_if_injuries ?? [];
    if (avoid.some((tag) => user.injuries.includes(tag))) return false;

    return true;
  });

  if (eligible.length === 0) {
    throw new Error("No eligible workouts for user profile (equipment/injuries).");
  }

  // Determinista: orden por id, elige el primero.
  eligible.sort((a, b) => a.id.localeCompare(b.id));
  return eligible[0];
}

function pickMenuForTargets(menus: Menu[], carbLabel: CarbLabel, targets: { kcal: number; protein: number; carbs: number; fat: number }): Menu {
  const sameLabel = menus.filter((m) => m.carb_bias === carbLabel);
  if (sameLabel.length === 0) throw new Error(`No menus available for carb_bias=${carbLabel}`);

  // Scoring determinista: minimiza distancia relativa macros+kcal
  const score = (m: Menu) => {
    const dk = Math.abs(m.kcal_total - targets.kcal) / Math.max(1, targets.kcal);
    const dp = Math.abs(m.macros_g.protein - targets.protein) / Math.max(1, targets.protein);
    const dc = Math.abs(m.macros_g.carbs - targets.carbs) / Math.max(1, targets.carbs);
    const df = Math.abs(m.macros_g.fat - targets.fat) / Math.max(1, targets.fat);
    return dk + dp + dc + df;
  };

  const sorted = [...sameLabel].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });

  return sorted[0];
}

function calcTargets(rules: RulesV1, user: UserProfile, load: number) {
  const weight = user.weight_kg;

  // 1) Carb label from load
  const carbLabel = carbLabelFromLoad(rules, load);

  // 2) Protein
  const pPerKg = rules.protein.g_per_kg[user.primary_goal];
  const protein = Math.round(weight * pPerKg);

  // 3) Carbs
  const cPerKg = rules.carbs.g_per_kg_by_label[carbLabel];
  const carbs = Math.round(weight * cPerKg);

  // 4) Weekly energy delta split by carbLabel
  // (esto es un "ajuste" sobre el mantenimiento; en v1 no calculamos mantenimiento real)
  // Para v1: usamos kcal derivadas SOLO por macros objetivo (más realista cuando añadas mantenimiento).
  // Aun así dejamos el weekly delta para futuro.
  const minFat = Math.round(weight * rules.fat.min_g_per_kg);

  // 5) Kcal target: derivado de macros objetivo (proteína y carbs fijos, fat mínimo)
  // Luego, en futuro, añadimos mantenimiento + weekly delta.
  const fat = minFat;

  const kcal = protein * 4 + carbs * 4 + fat * 9;

  return { kcal, macros_g: { protein, carbs, fat }, carb_label: carbLabel };
}

export function generateDayPlanIfNeeded(date: string) {
  const key = `app:dayplan:${date}`;
  if (localStorage.getItem(key)) return;

  const user = getJSON<UserProfile>("app:user");
  const rules = getJSON<RulesV1>("app:ruleset:rules_v1");
  const workouts = getJSON<Workout[]>("app:catalog:workouts");
  const menus = getJSON<Menu[]>("app:catalog:menus");

  // 1) Selecciona workout determinista
  const workout = pickWorkout(user, workouts);

  // 2) Targets según load
  const targets = calcTargets(rules, user, workout.training_load_score);

  // 3) Selecciona menú compatible con targets + carb label
  const menu = pickMenuForTargets(menus, targets.carb_label as CarbLabel, {
    kcal: targets.kcal,
    protein: targets.macros_g.protein,
    carbs: targets.macros_g.carbs,
    fat: targets.macros_g.fat
  });

  const dayPlan = {
    schema_version: 1,
    date,
    workout_id: workout.id,
    menu_id: menu.id,
    training_load_score: workout.training_load_score,
    targets: {
      kcal: targets.kcal,
      macros_g: targets.macros_g,
      carb_label: targets.carb_label
    },
    created_at: new Date().toISOString()
  };

  localStorage.setItem(key, JSON.stringify(dayPlan, null, 2));
}
