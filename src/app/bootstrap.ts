import { getOrCreateDefaultProfile } from "./profile";
async function loadJSON<T>(path: string): Promise<T> {
  const base = import.meta.env.BASE_URL; // "/food-train/"
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

function ensure(key: string, value: any) {
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

export async function bootstrap() {
  if (!localStorage.getItem("app:device")) {
    localStorage.setItem("app:device", crypto.randomUUID());
  }

  ensure("app:locale", "es");

// Perfil usuario (fuente de verdad)
const profile = getOrCreateDefaultProfile();

// Mantener compatibilidad con el motor actual (app:user)
ensure("app:user", {
  sex: profile.sex,
  age: profile.age,
  height_cm: profile.height_cm,
  weight_kg: profile.weight_kg,
  primary_goal: profile.goal, // ojo: profile.goal -> primary_goal
  equipment: profile.equipment,
  injuries: profile.injuries ?? [],
  days_available_per_week: profile.training_days_per_week
});

// Si el usuario cambia el perfil después, aquí NO lo sobreescribimos.
// En siguiente iteración, el motor leerá directamente app:profile.

  // Carga catálogos y rules desde /public solo si no existen
  if (!localStorage.getItem("app:ruleset:rules_v1")) {
    const rules = await loadJSON<any>("rules/rules_v1.json");
    localStorage.setItem("app:ruleset:active", JSON.stringify("rules_v1"));
    localStorage.setItem("app:ruleset:rules_v1", JSON.stringify(rules));
  }

  if (!localStorage.getItem("app:catalog:workouts")) {
    const w = await loadJSON<any>("catalog/workouts.v1.json");
    localStorage.setItem("app:catalog:workouts", JSON.stringify(w.items));
  }

  if (!localStorage.getItem("app:catalog:menus")) {
    const m = await loadJSON<any>("catalog/menus.v1.json");
    localStorage.setItem("app:catalog:menus", JSON.stringify(m.items));
  }

  // Estos dos aún no los usa el motor, pero los dejamos listos
  if (!localStorage.getItem("app:catalog:foods")) {
    const f = await loadJSON<any>("catalog/foods.v1.json");
    localStorage.setItem("app:catalog:foods", JSON.stringify(f.items));
  }

  if (!localStorage.getItem("app:catalog:exercises")) {
    const e = await loadJSON<any>("catalog/exercises.v1.json");
    localStorage.setItem("app:catalog:exercises", JSON.stringify(e.items));
  }
}
if (!localStorage.getItem("app:index:dayplans")) {
  localStorage.setItem("app:index:dayplans", JSON.stringify([]));
}
