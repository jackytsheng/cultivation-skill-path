import React from "react";
import { createRoot } from "react-dom/client";
import "../../app/globals.css";
import { CultivationApp } from "../../app/CultivationApp";

const baseUrl = import.meta.env.BASE_URL || "/";
document.documentElement.style.setProperty(
  "--scroll-emblem-image",
  `url("${baseUrl}scroll-emblem-v2.png")`,
);

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CultivationApp />
  </React.StrictMode>,
);
