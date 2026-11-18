import { Router } from "express";
import { notFound } from "../../http/errors";
import { AI_VENDORS } from "./defaults";

/**
 * Supplementary AI domains as Quantumult X filter lists. Quantumult X's
 * import can add remote rule lists but no local rules, so the domains that
 * the referenced lists miss are served here (policy comes from force-policy).
 */
export const ruleListRoutes = Router();

ruleListRoutes.get("/rules/quantumultx/:file", (req, res) => {
    const vendor = AI_VENDORS.find(
        (item) => `ai-${item.slug}.list` === req.params.file,
    );
    if (!vendor) throw notFound("规则不存在。");
    res.setHeader("cache-control", "public, max-age=3600");
    res.type("text/plain").send(
        `# ${vendor.group}：补充域名\n${vendor.extra.map((domain) => `host-suffix, ${domain}, proxy`).join("\n")}\n`,
    );
});
