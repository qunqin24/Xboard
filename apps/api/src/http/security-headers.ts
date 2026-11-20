import type { RequestHandler } from "express";
import helmet from "helmet";

// Human verification providers the browser loads scripts, frames and
// requests from (Turnstile, reCAPTCHA, hCaptcha).
const TURNSTILE = "https://challenges.cloudflare.com";
const HCAPTCHA = ["https://hcaptcha.com", "https://*.hcaptcha.com"];

/**
 * Security headers for every response, API and web app alike. The app is
 * deployed as one container behind the operator's own HTTPS reverse proxy,
 * so these are set here rather than in the proxy.
 *
 * img-src allows any https: image because payment gateway icons are URLs
 * entered by the administrator. Scripts, frames and connections stay limited
 * to this site and the human verification providers.
 */
export function securityHeaders(): RequestHandler {
    const policy = helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'none'"],
                scriptSrc: [
                    "'self'",
                    TURNSTILE,
                    "https://www.google.com/recaptcha/",
                    "https://www.gstatic.com/recaptcha/",
                    ...HCAPTCHA,
                ],
                frameSrc: [
                    TURNSTILE,
                    "https://www.google.com/recaptcha/",
                    "https://recaptcha.google.com/recaptcha/",
                    ...HCAPTCHA,
                ],
                styleSrc: ["'self'", "'unsafe-inline'", ...HCAPTCHA],
                imgSrc: ["'self'", "data:", "https:"],
                fontSrc: ["'self'", "data:"],
                connectSrc: [
                    "'self'",
                    TURNSTILE,
                    "https://www.google.com/recaptcha/",
                    ...HCAPTCHA,
                ],
                baseUri: ["'none'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                objectSrc: ["'none'"],
            },
        },
        strictTransportSecurity: {
            maxAge: 31_536_000,
            includeSubDomains: false,
        },
        xFrameOptions: { action: "deny" },
        referrerPolicy: { policy: "no-referrer" },
    });
    return (req, res, next) => {
        res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        );
        policy(req, res, next);
    };
}
