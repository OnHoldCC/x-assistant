import { createApp } from "vue";
import { setupDayjs } from "./plugins/dayjs";
import { setupNProgress } from "./plugins/nprogress";
import "./plugins/assets";
import "./plugins/onhold-icons";
import "./styles/onhold-vue.css";
import { setupI18n } from "./locales";
import { setupStore } from "./store";
import { setupRouter } from "./router";
import App from "./App.vue";
// Existing extension and desktop links use #overview rather than #/overview.
function normalizeHash() {
  if (/^#[a-z]/.test(location.hash))
    location.replace(location.href.replace(/#(.*)$/, "#/$1"));
}
normalizeHash();
window.addEventListener("hashchange", normalizeHash);
async function start() {
  setupDayjs();
  setupNProgress();
  const app = createApp(App);
  setupStore(app);
  setupI18n(app);
  await setupRouter(app);
  app.mount("#app");
}
void start();
