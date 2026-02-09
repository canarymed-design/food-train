import "./style.css";
import { bootstrap } from "./app/bootstrap";
import { generateDayPlanIfNeeded } from "./engine/generateDayPlanIfNeeded";

async function run() {
  await bootstrap();

  const today = new Date().toISOString().slice(0, 10);
  generateDayPlanIfNeeded(today);

  const plan = localStorage.getItem(`app:dayplan:${today}`);

  const app = document.getElementById("app")!;
  app.innerHTML = `
    <h1>Food & Train</h1>
    <p style="opacity:.8;margin-top:-6px;">Motor real v1 (rules + catálogos)</p>
    <pre>${plan ?? "Plan no generado"}</pre>
  `;
}

run().catch((err) => {
  const app = document.getElementById("app")!;
  app.innerHTML = `<h1>Error</h1><pre>${String(err?.stack ?? err)}</pre>`;
});
