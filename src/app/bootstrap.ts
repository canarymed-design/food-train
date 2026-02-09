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

  // User demo (si no existe)
  ensure("app:user", {
    sex: "male",
    age: 50,
    height_cm: 176,
    weight_kg: 82,
    primary_goal: "recomp",
    equipment: "gym",
    injuries: []
  });

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
