import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { BrowserConnect } from "./features/connections/BrowserConnect";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  location.hash === "#connect" ? <BrowserConnect /> : <App />,
);
