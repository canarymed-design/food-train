import "./style.css";
import { bootstrap } from "./app/bootstrap";
import { generateDayPlanIfNeeded } from "./engine/generateDayPlanIfNeeded";

type Locale = "es" | "en";
type DayFeedback = {
  schema_version: 1;
  date: string;
  workout_completed: boolean;
  menu_adherence_pct: number; // 0..100
  notes?: string;
  updated_at: string;
};

function feedbackKey(date: string) {
  return `app:feedback:${date}`;
}

function getFeedback(date: string): DayFeedback | null {
  const raw = localStorage.getItem(feedbackKey(date));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveFeedback(fb: DayFeedback) {
  localStorage.setItem(feedbackKey(fb.date), JSON.stringify(fb));
}
function getLocale(): Locale {
  const raw = localStorage.getItem("app:locale");
  try {
    const v = raw ? JSON.parse(raw) : "es";
    return v === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}


function setLocale(l: Locale) {
  localStorage.setItem("app:locale", JSON.stringify(l));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getCatalog<T>(key: string): T {
  const raw = localStorage.getItem(key);
  if (!raw) throw new Error(`Missing catalog: ${key}`);
  return JSON.parse(raw) as T;
}

function getDayPlan(date: string) {
  const raw = localStorage.getItem(`app:dayplan:${date}`);
  return raw ? JSON.parse(raw) : null;
}

function removeDayPlan(date: string) {
  localStorage.removeItem(`app:dayplan:${date}`);
  // también sacarlo del índice si existe
  const idxKey = "app:index:dayplans";
  const idxRaw = localStorage.getItem(idxKey);
  if (idxRaw) {
    try {
      const idx: string[] = JSON.parse(idxRaw);
      const next = idx.filter((d) => d !== date);
      localStorage.setItem(idxKey, JSON.stringify(next));
    } catch {}
  }
}

function wipeAppStorage() {
  const keys = Object.keys(localStorage);
  for (const k of keys) {
    if (k.startsWith("app:")) localStorage.removeItem(k);
  }
}

function h(label: string, value: string) {
  return `<div class="row"><div class="k">${label}</div><div class="v">${value}</div></div>`;
}

function formatMacros(m: { protein: number; carbs: number; fat: number }) {
  return `P ${m.protein}g · C ${m.carbs}g · G ${m.fat}g`;
}

function titleFromI18n(i18n: any, locale: Locale, fallback: string) {
  if (!i18n) return fallback;
  const key = i18n.title ?? i18n.name;
  if (!key) return fallback;
  return key[locale] ?? key.es ?? key.en ?? fallback;
}

async function render() {
  await bootstrap();

  const locale = getLocale();
  const date = todayISO();

  // Genera si no existe
  generateDayPlanIfNeeded(date);

  const plan = getDayPlan(date);
  if (!plan) throw new Error("No DayPlan generated");
  const existingFb = getFeedback(date);
const feedback: DayFeedback = existingFb ?? {
  schema_version: 1,
  date,
  workout_completed: false,
  menu_adherence_pct: 0,
  notes: "",
  updated_at: new Date().toISOString()
};
  const workouts = getCatalog<any[]>("app:catalog:workouts");
  const menus = getCatalog<any[]>("app:catalog:menus");
  const foods = getCatalog<any[]>("app:catalog:foods");
  const workout = plan.workout_id ? workouts.find((w) => w.id === plan.workout_id) : null;
  const menu = menus.find((m) => m.id === plan.menu_id);

  const workoutName = workout ? titleFromI18n(workout.i18n, locale, workout.id) : (locale === "es" ? "Descanso" : "Rest day");
  const workoutNotes = workout ? (workout.i18n?.notes?.[locale] ?? workout.i18n?.notes?.es ?? "") : (plan.meta?.reason ?? "");
  const menuTitle = menu ? titleFromI18n(menu.i18n, locale, menu.id) : plan.menu_id;
  const slotLabel = (slot: string) => {
  const map: Record<string, { es: string; en: string }> = {
    breakfast: { es: "Desayuno", en: "Breakfast" },
    lunch: { es: "Almuerzo", en: "Lunch" },
    snack: { es: "Merienda", en: "Snack" },
    dinner: { es: "Cena", en: "Dinner" },
  };
  return (map[slot]?.[locale] ?? slot);
};

const foodNameById = (id: string) => {
  const f = foods.find((x) => x.id === id);
  if (!f) return id;
  // Soportamos i18n.title o i18n.name según cómo lo tengas en foods
  const t = f.i18n?.title ?? f.i18n?.name;
  return t?.[locale] ?? t?.es ?? t?.en ?? f.name ?? id;
};

const renderMealItems = (items: any[]) => {
  if (!items?.length) return `<div class="muted">${locale === "es" ? "Sin items" : "No items"}</div>`;
  return `
    <div class="meal-list">
      ${items.map((it) => {
        if (it.type === "food") {
          const name = foodNameById(it.id);
          const grams = it.grams != null ? `${it.grams} g` : "";
          return `<div class="meal-row"><div class="meal-name">${name}</div><div class="meal-qty">${grams}</div></div>`;
        }
        // Fallback por si luego metes recetas/suplementos
        return `<div class="meal-row"><div class="meal-name">${it.id ?? "item"}</div><div class="meal-qty">${it.grams ? `${it.grams} g` : ""}</div></div>`;
      }).join("")}
    </div>
  `;
};

const renderMeals = () => {
  if (!menu?.meals?.length) return "";
  return `
    <div class="meals">
      ${menu.meals.map((m: any) => `
        <details class="meal">
          <summary>
            <span>${slotLabel(m.slot)}</span>
            <span class="muted">${m.items?.length ?? 0} ${locale === "es" ? "items" : "items"}</span>
          </summary>
          ${renderMealItems(m.items)}
        </details>
      `).join("")}
    </div>
  `;
};
  const app = document.getElementById("app")!;
  app.innerHTML = `
<header class="top">
  <div>
    <div class="brand">Food & Train</div>
    <div class="sub">Plan de hoy · ${date} · vUI-1</div>
  </div>

  <div class="top-actions">
    <button class="btn ghost" id="btnProfile">👤</button>
    <button class="btn ghost" id="btnLocale">${locale.toUpperCase()}</button>
  </div>
</header>

    <section class="grid">
      <article class="card">
        <div class="card-h">
          <div class="emoji">🏋️</div>
          <div>
            <div class="card-t">${locale === "es" ? "Entrenamiento" : "Workout"}</div>
            <div class="card-s">${workoutName}</div>
          </div>
        </div>

        <div class="meta">
          ${h(locale === "es" ? "Día de entreno" : "Training day", plan.meta?.is_training_day ? (locale === "es" ? "Sí" : "Yes") : (locale === "es" ? "No" : "No"))}
          ${workout ? h(locale === "es" ? "Duración" : "Duration", `${workout.duration_min} min`) : ""}
          ${workout ? h(locale === "es" ? "Tipo" : "Type", String(workout.type)) : ""}
          ${workout ? h(locale === "es" ? "Carga" : "Load", String(plan.training_load_score)) : h(locale === "es" ? "Carga" : "Load", "0")}
        </div>
        ${renderMeals()}
        ${workoutNotes ? `<div class="note">${workoutNotes}</div>` : ``}
      </article>

      <article class="card">
        <div class="card-h">
          <div class="emoji">🍽️</div>
          <div>
            <div class="card-t">${locale === "es" ? "Menú" : "Menu"}</div>
            <div class="card-s">${menuTitle}</div>
          </div>
        </div>

        <div class="meta">
          ${h("Kcal", String(plan.targets?.kcal ?? "-"))}
          ${h(locale === "es" ? "Macros" : "Macros", formatMacros(plan.targets.macros_g))}
          ${h(locale === "es" ? "Carbos" : "Carbs label", String(plan.targets.carb_label))}
          ${menu ? h(locale === "es" ? "Bias menú" : "Menu bias", String(menu.carb_bias)) : ""}
          ${h(locale === "es" ? "Generado" : "Generated", String(plan.created_at ?? "-"))}
        </div>
      </article>
      <article class="card">
  <div class="card-h">
    <div class="emoji">✅</div>
    <div>
      <div class="card-t">SEGUIMIENTO</div>
      <div class="card-s">Hoy</div>
    </div>
  </div>

<div class="meta">
  <div class="row">
    <div class="k">Entreno completado</div>
    <div class="v">
      <input type="checkbox" id="fbTrainDone" ${feedback.workout_completed ? "checked" : ""} />
    </div>
  </div>

    <div class="row">
      <div class="k">Adherencia menú</div>
      <div class="v"><span id="fbPct">${feedback.menu_adherence_pct}</span>%</div>
    </div>

    <input id="fbAdh" type="range" min="0" max="100" step="5" value="${feedback.menu_adherence_pct}" />
<div class="row row-col">
  <div class="k">Notas</div>
  <textarea class="textarea" id="fbNotes" rows="3" placeholder="Cómo fue el día...">${feedback.notes ?? ""}</textarea>
</div>
    ${h("Actualizado", String(feedback.updated_at))}
  </div>

  <div class="mini-actions">
    <button class="btn" id="btnSaveFb">Guardar seguimiento</button>
  </div>
</article>
      <article class="card">
        <div class="card-h">
          <div class="emoji">🧪</div>
          <div>
            <div class="card-t">${locale === "es" ? "Debug" : "Debug"}</div>
            <div class="card-s">${locale === "es" ? "Plan (JSON)" : "Plan (JSON)"}</div>
          </div>
        </div>

        <pre class="code">${JSON.stringify(plan, null, 2)}</pre>
      </article>
    </section>

    <footer class="actions">
      <button class="btn" id="btnRegen">${locale === "es" ? "Regenerar hoy" : "Regenerate today"}</button>
      <button class="btn danger" id="btnWipe">${locale === "es" ? "Borrar datos" : "Wipe data"}</button>
    </footer>
  `;
const r = document.getElementById("fbAdh") as HTMLInputElement | null;
const p = document.getElementById("fbPct") as HTMLElement | null;
if (r && p) {
  const sync = () => { p.textContent = String(r.value); };
  r.addEventListener("input", sync);
  sync();
}
// Handlers (iPhone-friendly)
const onTap = (id: string, fn: () => void) => {
  const el = document.getElementById(id);
  if (!el) return;
  // pointerup suele ir fino en iOS; touchend es el plan B
  el.addEventListener("pointerup", (e) => { e.preventDefault(); fn(); });
  el.addEventListener("touchend", (e) => { e.preventDefault(); fn(); }, { passive: false });
};

const rerender = () => render().catch((err) => {
  const app = document.getElementById("app")!;
  app.innerHTML = `<h1 style="padding:16px">Error</h1><pre style="padding:16px;white-space:pre-wrap">${String(err?.stack ?? err)}</pre>`;
});
onTap("btnProfile", () => {
  const raw = localStorage.getItem("app:profile");
  const profile = raw ? JSON.parse(raw) : {
    schema_version: 1,
    sex: "male",
    age: 40,
    height_cm: 175,
    weight_kg: 80,
    activity_base: "moderate",
    goal: "recomp",
    training_experience: "intermediate",
    training_days_per_week: 4,
    training_time_pref: "morning",
    equipment: "gym",
    dietary_restrictions: [],
    injuries: [],
    updated_at: new Date().toISOString()
  };

  const weight = prompt(locale === "es" ? "Peso actual (kg)" : "Current weight (kg)", String(profile.weight_kg));
  if (weight === null) return;

  const goal = prompt(
    locale === "es" ? "Objetivo: fat_loss / muscle_gain / recomp" : "Goal: fat_loss / muscle_gain / recomp",
    String(profile.goal)
  );
  if (goal === null) return;

  const days = prompt(locale === "es" ? "Días de entreno por semana (1-7)" : "Training days per week (1-7)", String(profile.training_days_per_week));
  if (days === null) return;

  const w = Number(weight);
  const d = Number(days);

  if (!Number.isFinite(w) || w <= 0) {
    alert(locale === "es" ? "Peso inválido" : "Invalid weight");
    return;
  }
  if (!Number.isFinite(d) || d < 1 || d > 7) {
    alert(locale === "es" ? "Días inválidos (1-7)" : "Invalid days (1-7)");
    return;
  }
  if (!["fat_loss", "muscle_gain", "recomp"].includes(goal)) {
    alert(locale === "es" ? "Objetivo inválido" : "Invalid goal");
    return;
  }

  profile.weight_kg = w;
  profile.goal = goal;
  profile.training_days_per_week = d;
  profile.updated_at = new Date().toISOString();

  localStorage.setItem("app:profile", JSON.stringify(profile));

  // Compatibilidad con motor actual (usa app:user)
  const userRaw = localStorage.getItem("app:user");
  const u = userRaw ? JSON.parse(userRaw) : {};
  u.weight_kg = profile.weight_kg;
  u.primary_goal = profile.goal;
  u.days_available_per_week = profile.training_days_per_week;
  localStorage.setItem("app:user", JSON.stringify(u));

  // Para ver efecto inmediato, regeneramos el plan de hoy
  removeDayPlan(date);
  generateDayPlanIfNeeded(date);

  rerender();
});
  onTap("btnSaveFb", () => {
  const done =
    (document.getElementById("fbTrainDone") as HTMLInputElement | null)?.checked ?? false;

  const adh = Number(
    (document.getElementById("fbAdh") as HTMLInputElement | null)?.value ?? "0"
  );

  const notes =
    (document.getElementById("fbNotes") as HTMLTextAreaElement | null)?.value ?? "";

  const fb: DayFeedback = {
    schema_version: 1,
    date,
    workout_completed: done,
    menu_adherence_pct: Math.max(0, Math.min(100, adh)),
    notes,
    updated_at: new Date().toISOString()
  };

  saveFeedback(fb);
  rerender();
});
onTap("btnLocale", () => {
  const next: Locale = locale === "es" ? "en" : "es";
  setLocale(next);
  rerender();
});

onTap("btnRegen", () => {
  removeDayPlan(date);
  generateDayPlanIfNeeded(date);
  rerender();
});

onTap("btnWipe", () => {
  wipeAppStorage();
  rerender();
});
}

render().catch((err) => {
  const app = document.getElementById("app")!;
  app.innerHTML = `<h1 style="padding:16px">Error</h1><pre style="padding:16px;white-space:pre-wrap">${String(err?.stack ?? err)}</pre>`;
});
