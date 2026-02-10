import "./style.css";
import { bootstrap } from "./app/bootstrap";
import { generateDayPlanIfNeeded } from "./engine/generateDayPlanIfNeeded";

type Locale = "es" | "en";
type TabKey = "coach" | "menu" | "workout" | "progress";

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
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
      const idx = JSON.parse(idxRaw) as string[];
      localStorage.setItem(idxKey, JSON.stringify(idx.filter((d) => d !== date)));
    } catch {
      /* noop */
    }
  }
}

function wipeAppStorage() {
  const keep = new Set(["app:device"]);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  keys.forEach((k) => {
    if (!keep.has(k)) localStorage.removeItem(k);
  });
}

function titleFromI18n(i18n: any, locale: Locale, fallback: string) {
  const t = i18n?.title ?? i18n?.name;
  return t?.[locale] ?? t?.es ?? t?.en ?? fallback;
}

function formatMacros(m: { protein: number; carbs: number; fat: number }) {
  return `${m.protein}P / ${m.carbs}C / ${m.fat}G`;
}

function h(k: string, v: string) {
  return `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

// ---- UI state ----
function uiTabKey() {
  return "app:ui:tab";
}
function getTab(): TabKey {
  const raw = localStorage.getItem(uiTabKey());
  return raw === "menu" || raw === "workout" || raw === "progress" ? raw : "coach";
}
function setTab(t: TabKey) {
  localStorage.setItem(uiTabKey(), t);
}

function acceptedKey(date: string) {
  return `app:accepted:${date}`;
}
function isAccepted(date: string): boolean {
  return localStorage.getItem(acceptedKey(date)) === "1";
}
function setAccepted(date: string, v: boolean) {
  localStorage.setItem(acceptedKey(date), v ? "1" : "0");
}

function computeAdjustment(plan: any, menu: any) {
  if (!plan?.targets || !menu) return null;

  const tK = Number(plan.targets.kcal ?? 0);
  const mK = Number(menu.kcal_total ?? 0);

  const tM = plan.targets.macros_g ?? { protein: 0, carbs: 0, fat: 0 };
  const mM = menu.macros_g ?? { protein: 0, carbs: 0, fat: 0 };

  const dk = mK - tK;
  const dp = (mM.protein ?? 0) - (tM.protein ?? 0);
  const dc = (mM.carbs ?? 0) - (tM.carbs ?? 0);
  const df = (mM.fat ?? 0) - (tM.fat ?? 0);

  const show =
    Math.abs(dk) >= 150 || Math.abs(dp) >= 20 || Math.abs(dc) >= 30 || Math.abs(df) >= 15;

  if (!show) return null;
  return { dk, dp, dc, df };
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
    updated_at: new Date().toISOString(),
  };

  const tab = getTab();
  const accepted = isAccepted(date);

  const workouts = getCatalog<any[]>("app:catalog:workouts");
  const menus = getCatalog<any[]>("app:catalog:menus");
  const foods = getCatalog<any[]>("app:catalog:foods");
  const exercises = getCatalog<any[]>("app:catalog:exercises");

  const workout = plan.workout_id ? workouts.find((w) => w.id === plan.workout_id) : null;
  const menu = menus.find((m) => m.id === plan.menu_id);

  const workoutName = workout
    ? titleFromI18n(workout.i18n, locale, workout.id)
    : locale === "es"
      ? "Descanso"
      : "Rest day";

  const workoutNotes = workout
    ? workout.i18n?.notes?.[locale] ?? workout.i18n?.notes?.es ?? ""
    : plan.meta?.reason ?? "";

  const menuTitle = menu ? titleFromI18n(menu.i18n, locale, menu.id) : plan.menu_id;

  const slotLabel = (slot: string) => {
    const map: Record<string, { es: string; en: string }> = {
      breakfast: { es: "Desayuno", en: "Breakfast" },
      lunch: { es: "Almuerzo", en: "Lunch" },
      snack: { es: "Merienda", en: "Snack" },
      dinner: { es: "Cena", en: "Dinner" },
    };
    return map[slot]?.[locale] ?? slot;
  };

  const foodNameById = (id: string) => {
    const f = foods.find((x) => x.id === id);
    if (!f) return id;
    const t = f.i18n?.title ?? f.i18n?.name;
    return t?.[locale] ?? t?.es ?? t?.en ?? f.name ?? id;
  };

  const exNameById = (id: string) => {
    const e = exercises.find((x) => x.id === id);
    if (!e) return id;
    const t = e.i18n?.title ?? e.i18n?.name;
    return t?.[locale] ?? t?.es ?? t?.en ?? e.name ?? id;
  };

  const renderMealItems = (items: any[]) => {
    if (!items?.length) return `<div class="muted">${locale === "es" ? "Sin items" : "No items"}</div>`;
    return `
      <div class="meal-list">
        ${items
          .map((it) => {
            if (it.type === "food") {
              const name = foodNameById(it.id);
              const grams = it.grams != null ? `${it.grams} g` : "";
              return `<div class="meal-row"><div class="meal-name">${name}</div><div class="meal-qty">${grams}</div></div>`;
            }
            return `<div class="meal-row"><div class="meal-name">${it.id ?? "item"}</div><div class="meal-qty">${it.grams ? `${it.grams} g` : ""}</div></div>`;
          })
          .join("")}
      </div>
    `;
  };

  const renderMeals = () => {
    if (!menu?.meals?.length) return "";
    return `
      <div class="meals">
        ${menu.meals
          .map(
            (m: any) => `
          <details class="meal">
            <summary>
              <span>${slotLabel(m.slot)}</span>
              <span class="muted">${m.items?.length ?? 0} ${locale === "es" ? "items" : "items"}</span>
            </summary>
            ${renderMealItems(m.items)}
          </details>
        `
          )
          .join("")}
      </div>
    `;
  };

  const renderWorkoutStructure = () => {
    if (!workout?.structure) return `<div class="muted">${locale === "es" ? "Sin rutina" : "No routine"}</div>`;
    const w = workout.structure;

    const line = (label: string, html: string) => `
      <div class="wk-block">
        <div class="wk-block-h">${label}</div>
        ${html}
      </div>
    `;

    const renderList = (arr: any[]) => `
      <div class="wk-list">
        ${arr
          .map((it) => {
            const name = exNameById(it.exercise_id);
            const reps = it.reps ? `${it.reps} reps` : "";
            const sets = it.sets ? `${it.sets} sets` : "";
            const rest = it.rest_sec ? `${it.rest_sec}s rest` : "";
            const rpe = it.rpe ? `RPE ${it.rpe}` : "";
            return `
            <div class="wk-row">
              <div class="wk-name">${name}</div>
              <div class="wk-meta">${[sets, reps, rest, rpe].filter(Boolean).join(" · ")}</div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;

    const warm = Array.isArray(w.warmup) ? w.warmup : [];
    const exs = Array.isArray(w.exercises) ? w.exercises : [];
    const cool = Array.isArray(w.cooldown) ? w.cooldown : [];

    return `
      ${warm.length ? line(locale === "es" ? "Calentamiento" : "Warm-up", renderList(warm)) : ""}
      ${exs.length ? line(locale === "es" ? "Trabajo" : "Work", renderList(exs)) : ""}
      ${cool.length ? line(locale === "es" ? "Vuelta a la calma" : "Cool-down", renderList(cool)) : ""}
    `;
  };

  const adjustment = computeAdjustment(plan, menu);

  const coachView = `
    <section class="coach-head">
      <div class="coach-title">${locale === "es" ? "Tu plan de hoy" : "Your plan today"}</div>
      <div class="coach-sub">
        ${locale === "es" ? "Recomendación personalizada" : "Personalized recommendation"} · ${date}
      </div>

      <div class="chips">
        <div class="chip">${plan.targets?.kcal ?? "-"} kcal</div>
        <div class="chip">${plan.targets?.macros_g ? formatMacros(plan.targets.macros_g) : "-"}</div>
        <div class="chip">${locale === "es" ? "Carga" : "Load"}: ${plan.training_load_score ?? 0}</div>
      </div>
    </section>

    <section class="grid">
      <article class="card coach-card">
  <div class="coach-card-hero">
    <div class="coach-card-hero-text">
      <div class="coach-kicker">${locale === "es" ? "Tu entreno de hoy" : "Your workout today"}</div>
      <div class="coach-title-hero">${workoutName}</div>

      <div class="coach-subline">
        ${
          workout
            ? `${workout.duration_min} min · ${String(workout.type)}`
            : (locale === "es" ? "Día de descanso" : "Rest day")
        }
      </div>

      ${workoutNotes ? `<div class="coach-note">${workoutNotes}</div>` : ``}

      <div class="coach-cta-row">
        <button class="btn coach-primary" id="btnStartWorkout">
          ${locale === "es" ? "Empezar entreno" : "Start workout"}
        </button>
        <button class="btn coach-link" id="btnViewWorkout">
          ${locale === "es" ? "Ver detalles" : "View details"} →
        </button>
      </div>
    </div>

    <div class="coach-card-hero-media">
      <img
        class="coach-img"
        src="/food-train/assets/mock/workout.jpg"
        alt="Workout"
        loading="lazy"
      />
    </div>
  </div>

  <div class="coach-card-mini">
    <div class="mini-pill">
      <span class="mini-label">${locale === "es" ? "Día de entreno" : "Training day"}</span>
      <span class="mini-value">${
        plan.meta?.is_training_day
          ? (locale === "es" ? "Sí" : "Yes")
          : (locale === "es" ? "No" : "No")
      }</span>
    </div>

    <div class="mini-pill">
      <span class="mini-label">${locale === "es" ? "Carga" : "Load"}</span>
      <span class="mini-value">${plan.training_load_score ?? 0}</span>
    </div>
  </div>
</article>

      <article class="card">
        <div class="card-h">
          <div class="emoji">🍽️</div>
          <div>
            <div class="card-t">${locale === "es" ? "Menú sugerido" : "Suggested menu"}</div>
            <div class="card-s">${menuTitle}</div>
          </div>
        </div>

        <div class="meta">
          ${menu ? h("Kcal", String(menu.kcal_total ?? "-")) : ""}
          ${menu?.macros_g ? h(locale === "es" ? "Macros" : "Macros", formatMacros(menu.macros_g)) : ""}
          ${h(locale === "es" ? "Carbos" : "Carb label", String(plan.targets?.carb_label ?? "-"))}
          ${menu ? h(locale === "es" ? "Bias menú" : "Menu bias", String(menu.carb_bias)) : ""}
        </div>

        <div class="mini-actions">
          <button class="btn ghost" id="btnViewMenu">${locale === "es" ? "Ver menú" : "View menu"}</button>
          <button class="btn" id="btnChangePlan">${locale === "es" ? "Cambiar" : "Change"}</button>
        </div>

        <div class="muted tiny">
          ${locale === "es" ? "“Cambiar” regenera el plan de hoy (MVP)." : "“Change” regenerates today's plan (MVP)."}
        </div>
      </article>

      ${
        adjustment
          ? `
        <article class="card">
          <div class="card-h">
            <div class="emoji">🧠</div>
            <div>
              <div class="card-t">${locale === "es" ? "Ajuste del día" : "Daily adjustment"}</div>
              <div class="card-s">${locale === "es" ? "Comparado con tu objetivo" : "Compared to your target"}</div>
            </div>
          </div>

          <div class="meta">
            ${h(locale === "es" ? "Kcal (menú - objetivo)" : "Kcal (menu - target)", `${adjustment.dk > 0 ? "+" : ""}${Math.round(adjustment.dk)} kcal`)}
            ${h("P", `${adjustment.dp > 0 ? "+" : ""}${Math.round(adjustment.dp)} g`)}
            ${h("C", `${adjustment.dc > 0 ? "+" : ""}${Math.round(adjustment.dc)} g`)}
            ${h("G", `${adjustment.df > 0 ? "+" : ""}${Math.round(adjustment.df)} g`)}
          </div>

          <div class="muted tiny">
            ${locale === "es" ? "Informativo por ahora. Próximo paso: aplicar ajustes automáticamente." : "Informational for now. Next: auto-apply adjustments."}
          </div>
        </article>
      `
          : ``
      }
    </section>

    <div class="sticky-cta">
      <button class="btn primary" id="btnAcceptDay" ${accepted ? "disabled" : ""}>
        ${
          accepted
            ? locale === "es"
              ? "Plan aceptado ✅"
              : "Plan accepted ✅"
            : locale === "es"
              ? "Aceptar plan de hoy"
              : "Accept today's plan"
        }
      </button>
      <div class="muted tiny">
        ${accepted ? (locale === "es" ? "Bloqueado para evitar cambios accidentales." : "Locked to avoid accidental changes.") : ""}
      </div>
    </div>
  `;

  const menuView = `
    <section class="grid">
      <article class="card">
        <div class="card-h">
          <div class="emoji">🍽️</div>
          <div>
            <div class="card-t">${locale === "es" ? "Menú" : "Menu"}</div>
            <div class="card-s">${menuTitle}</div>
          </div>
        </div>

        <div class="meta">
          ${h("Kcal", String(menu?.kcal_total ?? "-"))}
          ${h(locale === "es" ? "Objetivo" : "Target", String(plan.targets?.kcal ?? "-"))}
          ${menu?.macros_g ? h(locale === "es" ? "Macros" : "Macros", formatMacros(menu.macros_g)) : ""}
        </div>

        ${renderMeals()}
      </article>
    </section>
  `;

  const workoutView = `
    <section class="grid">
      <article class="card">
        <div class="card-h">
          <div class="emoji">🏋️</div>
          <div>
            <div class="card-t">${locale === "es" ? "Entreno" : "Workout"}</div>
            <div class="card-s">${workoutName}</div>
          </div>
        </div>

        <div class="meta">
          ${h(locale === "es" ? "Carga" : "Load", String(plan.training_load_score ?? 0))}
          ${workout ? h(locale === "es" ? "Duración" : "Duration", `${workout.duration_min} min`) : ""}
          ${workout ? h(locale === "es" ? "Nivel" : "Level", String(workout.level ?? "-")) : ""}
        </div>

        ${workoutNotes ? `<div class="note">${workoutNotes}</div>` : ``}

        ${renderWorkoutStructure()}

        <div class="muted tiny">
          ${locale === "es" ? "Modo sesión (paso a paso) lo metemos en la siguiente iteración." : "Session mode (step-by-step) comes next iteration."}
        </div>
      </article>
    </section>
  `;

  const progressView = `
    <section class="grid">
      <article class="card">
        <div class="card-h">
          <div class="emoji">✅</div>
          <div>
            <div class="card-t">${locale === "es" ? "Seguimiento" : "Progress"}</div>
            <div class="card-s">${locale === "es" ? "Hoy" : "Today"}</div>
          </div>
        </div>

        <div class="meta">
          <div class="row">
            <div class="k">${locale === "es" ? "Entreno completado" : "Workout completed"}</div>
            <div class="v">
              <input type="checkbox" id="fbTrainDone" ${feedback.workout_completed ? "checked" : ""} />
            </div>
          </div>

          <div class="row">
            <div class="k">${locale === "es" ? "Adherencia menú" : "Menu adherence"}</div>
            <div class="v"><span id="fbPct">${feedback.menu_adherence_pct}</span>%</div>
          </div>

          <input id="fbAdh" type="range" min="0" max="100" step="5" value="${feedback.menu_adherence_pct}" />

          <div class="row row-col">
            <div class="k">${locale === "es" ? "Notas" : "Notes"}</div>
            <textarea class="textarea" id="fbNotes" rows="3" placeholder="${locale === "es" ? "Cómo fue el día..." : "How was your day..."}">${feedback.notes ?? ""}</textarea>
          </div>

          ${h(locale === "es" ? "Actualizado" : "Updated", String(feedback.updated_at))}
        </div>

        <div class="mini-actions">
          <button class="btn" id="btnSaveFb">${locale === "es" ? "Guardar" : "Save"}</button>
          <button class="btn ghost" id="btnRegen">${locale === "es" ? "Regenerar hoy" : "Regenerate today"}</button>
          <button class="btn danger" id="btnWipe">${locale === "es" ? "Borrar datos" : "Wipe data"}</button>
        </div>
      </article>

      <article class="card">
        <div class="card-h">
          <div class="emoji">🧪</div>
          <div>
            <div class="card-t">Debug</div>
            <div class="card-s">${locale === "es" ? "Plan (JSON)" : "Plan (JSON)"}</div>
          </div>
        </div>

        <pre class="code">${JSON.stringify(plan, null, 2)}</pre>
      </article>
    </section>
  `;

  const tabBar = `
    <nav class="tabbar">
      <button class="tab ${tab === "coach" ? "active" : ""}" id="tabCoach">
        <div class="t-ico">🧠</div><div class="t-lbl">${locale === "es" ? "Hoy" : "Today"}</div>
      </button>
      <button class="tab ${tab === "menu" ? "active" : ""}" id="tabMenu">
        <div class="t-ico">🍽️</div><div class="t-lbl">${locale === "es" ? "Menú" : "Menu"}</div>
      </button>
      <button class="tab ${tab === "workout" ? "active" : ""}" id="tabWorkout">
        <div class="t-ico">🏋️</div><div class="t-lbl">${locale === "es" ? "Entreno" : "Workout"}</div>
      </button>
      <button class="tab ${tab === "progress" ? "active" : ""}" id="tabProgress">
        <div class="t-ico">✅</div><div class="t-lbl">${locale === "es" ? "Progreso" : "Progress"}</div>
      </button>
    </nav>
  `;

  const view =
    tab === "coach"
      ? coachView
      : tab === "menu"
        ? menuView
        : tab === "workout"
          ? workoutView
          : progressView;

  const app = document.getElementById("app")!;
  app.innerHTML = `
    <header class="top">
      <div>
        <div class="brand">Food & Train</div>
        <div class="sub">${locale === "es" ? "Coach + recomendación" : "Coach + recommendation"} · ${date}</div>
      </div>

      <div class="top-actions">
        <button class="btn ghost" id="btnProfile">👤</button>
        <button class="btn ghost" id="btnLocale">${locale.toUpperCase()}</button>
      </div>
    </header>

    ${view}
    ${tabBar}
  `;

  const rerender = () => render();

  const onTap = (id: string, fn: () => void) => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = (e: Event) => {
      e.preventDefault();
      fn();
    };
    el.addEventListener("pointerup", handler);
    el.addEventListener("click", handler);
  };

  // Range sync (progress tab)
  const r = document.getElementById("fbAdh") as HTMLInputElement | null;
  const p = document.getElementById("fbPct") as HTMLElement | null;
  if (r && p) {
    const sync = () => {
      p.textContent = String(r.value);
    };
    r.addEventListener("input", sync);
    sync();
  }

  // Tabs
  onTap("tabCoach", () => {
    setTab("coach");
    rerender();
  });
  onTap("tabMenu", () => {
    setTab("menu");
    rerender();
  });
  onTap("tabWorkout", () => {
    setTab("workout");
    rerender();
  });
  onTap("tabProgress", () => {
    setTab("progress");
    rerender();
  });

  // Top actions
  onTap("btnLocale", () => {
    const next: Locale = locale === "es" ? "en" : "es";
    setLocale(next);
    rerender();
  });

  // Coach actions
  onTap("btnViewMenu", () => {
    setTab("menu");
    rerender();
  });
  onTap("btnViewWorkout", () => {
    setTab("workout");
    rerender();
  });
  onTap("btnStartWorkout", () => {
    setTab("workout");
    rerender();
  });
  onTap("btnAcceptDay", () => {
    setAccepted(date, true);
    rerender();
  });
  onTap("btnChangePlan", () => {
    // MVP: replanifica todo el día
    removeDayPlan(date);
    generateDayPlanIfNeeded(date);
    setAccepted(date, false);
    rerender();
  });

  // Progress actions
  onTap("btnSaveFb", () => {
    const done = (document.getElementById("fbTrainDone") as HTMLInputElement | null)?.checked ?? false;
    const adh = Number((document.getElementById("fbAdh") as HTMLInputElement | null)?.value ?? 0);
    const notes = (document.getElementById("fbNotes") as HTMLTextAreaElement | null)?.value ?? "";

    const fb: DayFeedback = {
      schema_version: 1,
      date,
      workout_completed: done,
      menu_adherence_pct: Math.max(0, Math.min(100, adh)),
      notes,
      updated_at: new Date().toISOString(),
    };

    saveFeedback(fb);
    rerender();
  });

  onTap("btnRegen", () => {
    removeDayPlan(date);
    generateDayPlanIfNeeded(date);
    setAccepted(date, false);
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
