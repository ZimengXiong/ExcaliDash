import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles";
import App from "./App.tsx";
import { configureDisplayFont } from "./utils/displayFont";

configureDisplayFont();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
