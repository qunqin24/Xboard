import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ApiOkResponse, ApiProperty } from "@nestjs/swagger";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { DatabaseModule } from "./database/database.module";
import { PrismaService } from "./database/prisma.service";
import { AuthModule } from "./modules/auth/auth.module";
import { PlansModule } from "./modules/plans/plans.module";
import { UsersModule } from "./modules/users/users.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AccountModule } from "./modules/account/account.module";
import { NodesModule } from "./modules/nodes/nodes.module";
import { SupportModule } from "./modules/support/support.module";
import { DatabaseRateLimit } from "./common/rate-limit";
import { Maintenance } from "./common/maintenance";
import { getConfig } from "./config";

class HealthDto {
    @ApiProperty({ enum: ["ok"] })
    status!: "ok";

    @ApiProperty({ enum: ["development", "production"] })
    mode!: "development" | "production";
}

@Controller("health")
class HealthController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    @ApiOkResponse({ type: HealthDto })
    async health(): Promise<HealthDto> {
        await this.prisma.$queryRaw`SELECT 1`;
        return {
            status: "ok",
            mode: getConfig().production ? "production" : "development",
        };
    }
}

@Module({
    imports: [
        DatabaseModule,
        ThrottlerModule.forRootAsync({
            imports: [DatabaseModule],
            inject: [PrismaService],
            useFactory: (db: PrismaService) => ({
                throttlers: [{ ttl: 60_000, limit: 120 }],
                storage: new DatabaseRateLimit(db),
            }),
        }),
        AuthModule,
        UsersModule,
        PlansModule,
        OrdersModule,
        AdminModule,
        AccountModule,
        NodesModule,
        SupportModule,
    ],
    controllers: [HealthController],
    providers: [Maintenance, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
