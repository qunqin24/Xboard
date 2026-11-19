import { describe, expect, it } from "vitest";
import { translate, translateMessage } from "@xboard/contracts";
import { localizeSource } from "../i18n-transform";
import english from "../../../packages/contracts/src/messages.en.json";

describe("interface language", () => {
    it("keeps Chinese text and interpolates as expected in English", () => {
        expect(translate("zh-CN", "系统设置")).toBe("系统设置");
        expect(translate("en-US", "系统设置")).toBe("System settings");
        expect(translate("en-US", "近 {0} 天共 {1} GB", [7, "10.2"])).toBe(
            "10.2 GB over the past 7 days",
        );
        expect(
            translateMessage(
                "en-US",
                "email：请输入邮箱；password：请输入密码",
            ),
        ).toBe("email: Enter an email address; password: Enter your password");
    });

    it("translates TSX labels and interpolation while preserving server-provided text", () => {
        const source =
            'function Page({name, description}: Props) {return <p aria-label="订单">{`订单 ${name}`}{description}</p>;}';
        const result = localizeSource(source, "page.tsx");
        expect(result).toContain('aria-label={__xboardText("订单")}');
        expect(result).toContain('__xboardText("订单 {0}", [name])');
        expect(result).toContain("{description}");
    });

    it("keeps every placeholder and contains no machine-translation debris", () => {
        const placeholders = (text: string) =>
            [...text.matchAll(/\{\{\w+\}\}|\{\d+\}/g)]
                .map(([match]) => match)
                .sort();
        // Language names stay in their own script.
        const native = new Set(["简体中文"]);
        for (const [source, target] of Object.entries(english)) {
            expect(placeholders(target), source).toEqual(placeholders(source));
            if (!source.includes("%"))
                expect(target, source).not.toMatch(/%(?:[sSdD]|\d)/);
            expect(target, source).not.toMatch(/folder/i);
            if (!native.has(source))
                expect(target, source).not.toMatch(/[\u4e00-\u9fff]/);
        }
    });
});
