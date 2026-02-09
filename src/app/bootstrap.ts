export function bootstrap() {
  if (!localStorage.getItem("app:device")) {
    localStorage.setItem("app:device", crypto.randomUUID());
  }

  if (!localStorage.getItem("app:locale")) {
    localStorage.setItem("app:locale", "es");
  }
}
