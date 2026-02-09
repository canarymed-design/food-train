import "./style.css";
import { bootstrap } from "./app/bootstrap";
import { generateDayPlanIfNeeded } from "./engine/generateDayPlanIfNeeded";

type Locale = "es" | "en";

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

  const workouts = getCatalog<any[]>("app:catalog:workouts");
  const menus = getCatalog<any[]>("app:catalog:menus");

  const workout = plan.workout_id ? workouts.find((w) => w.id === plan.workout_id) : null;
  const menu = menus.find((m) => m.id === plan.menu_id);

  const workoutName = workout ? titleFromI18n(workout.i18n, locale, workout.id) : (locale === "es" ? "Descanso" : "Rest day");
  const workoutNotes = workout ? (workout.i18n?.notes?.[locale] ?? workout.i18n?.notes?.es ?? "") : (plan.meta?.reason ?? "");
  const menuTitle = menu ? titleFromI18n(menu.i18n, locale, menu.id) : plan.menu_id;

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
