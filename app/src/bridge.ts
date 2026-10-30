import { createApp } from "vue";
import Popup from "./views/onhold/Popup.vue";
import "./plugins/assets";
import "./styles/onhold-vue.css";
import "./styles/popup.css";
if (location.protocol === "chrome-extension:") {
  document.documentElement.classList.add("extension-popup");
}
createApp(Popup).mount("#app");
