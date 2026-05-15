import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MiniCurationBuilder from "./MiniCurationBuilder.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MiniCurationBuilder />
  </StrictMode>
);
