import { closeDb, db as prisma } from "../src/db";
import { hashPassword, normalizeEmail } from "../src/modules/auth/password";

async function main() {
    const email = normalizeEmail(
        process.env.DEMO_EMAIL ?? "developer@example.test",
    );
    const password = process.env.DEMO_PASSWORD;
    if (
        !password ||
        Buffer.byteLength(password) < 12 ||
        Buffer.byteLength(password) > 72
    ) {
        throw new Error(
            "Set DEMO_PASSWORD to 12–72 UTF-8 bytes in the .env file at the repository root before seeding.",
        );
    }
    try {
        if (await prisma.user.findUnique({ where: { email } })) {
            console.log(
                "Development user already exists; its password and data were not changed.",
            );
            return;
        }
        await prisma.$transaction(async (tx) => {
            const plan = await tx.plan.create({
                data: {
                    name: "轻量连接",
                    content:
                        "适合日常浏览与跨设备使用。此套餐是本地开发数据，不提供实际代理服务。",
                    transferEnable: 128n * 1024n ** 3n,
                    speedLimit: 200,
                    deviceLimit: 3,
                    published: true,
                    prices: {
                        create: [
                            { period: "monthly", amountMinor: 1990 },
                            { period: "quarterly", amountMinor: 5490 },
                            { period: "yearly", amountMinor: 19900 },
                        ],
                    },
                },
            });
            await tx.plan.create({
                data: {
                    name: "进阶连接",
                    content:
                        "更高流量额度与设备数量。仅用于验证套餐展示，不支持购买。",
                    transferEnable: 512n * 1024n ** 3n,
                    speedLimit: 1000,
                    deviceLimit: 6,
                    published: true,
                    prices: {
                        create: [
                            { period: "monthly", amountMinor: 3990 },
                            { period: "yearly", amountMinor: 39900 },
                        ],
                    },
                    sort: 1,
                },
            });
            await tx.user.create({
                data: {
                    email,
                    password: await hashPassword(password),
                    planId: plan.id,
                    transferEnable: plan.transferEnable,
                    upload: 412_316_860n,
                    download: 24_856_789_012n,
                    balance: 1280,
                    expiredAt: new Date(Date.now() + 26 * 86_400_000),
                },
            });
        });
        console.log(
            `Created isolated development account: ${email}. No production data was imported.`,
        );
    } finally {
        await closeDb();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
