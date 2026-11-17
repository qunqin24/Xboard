import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmProvider, ToastProvider } from "./components/overlays";
import { queryClient } from "./query-client";
import { router } from "./router";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element.");

createRoot(container).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <ConfirmProvider>
                    <RouterProvider router={router} context={{ queryClient }} />
                </ConfirmProvider>
            </ToastProvider>
        </QueryClientProvider>
    </StrictMode>,
);
