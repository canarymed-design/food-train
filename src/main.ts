import "./style.css";
import { bootstrap } from "./app/bootstrap";
import { generateDayPlanIfNeeded } from "./engine/generateDayPlanIfNeeded";

bootstrap();

const today = new Date().toISOString().slice(0, 10);

generateDayPlanIfNeeded(today);

const app = document.getElementById("app")!;
const plan = localStorage.getItem(`app:dayplan:${today}`);

app.innerHTML = `
  <h1>Food & Train</h1>
  <pre>${plan ?? "Plan no generado"}</pre>
`;
