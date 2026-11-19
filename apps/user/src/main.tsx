import { initializeLocale } from "./i18n";
import "./styles/index.css";

void initializeLocale().then(() => import("./render"));
