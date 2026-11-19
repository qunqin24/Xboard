import { describe, expect, it } from "vitest";
import { translate, translateMessage } from "@xboard/contracts";
import { localizeSource } from "../i18n-transform";

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
});
