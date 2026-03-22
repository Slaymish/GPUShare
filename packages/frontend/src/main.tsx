import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { ThemeProvider } from "./theme-provider";
import "./app.css";

// Inject CSP meta tag dynamically based on API URL
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
const apiOrigin = new URL(apiUrl).origin;

const cspMeta = document.createElement("meta");
cspMeta.httpEquiv = "Content-Security-Policy";
cspMeta.content = `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://js.stripe.com https://hooks.stripe.com; connect-src 'self' ${apiOrigin} http://localhost:* https://api.stripe.com https://merchant-ui-api.stripe.com; img-src 'self' data: https:;`;
document.head.appendChild(cspMeta);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
