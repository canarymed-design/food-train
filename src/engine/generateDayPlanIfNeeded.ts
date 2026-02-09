export function generateDayPlanIfNeeded(date: string) {
  const key = `app:dayplan:${date}`;
  if (localStorage.getItem(key)) return;

  const plan = {
    date,
    workout_id: "wk_strength_upper_01",
    menu_id: "menu_medium_01",
    training_load_score: 8
  };

  localStorage.setItem(key, JSON.stringify(plan, null, 2));
}
