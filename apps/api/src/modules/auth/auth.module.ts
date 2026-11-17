import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./session.guard";
import { SiteModule } from "../site/site.module";

@Module({
    imports: [SiteModule],
    controllers: [AuthController],
    providers: [AuthService, SessionGuard],
    exports: [AuthService, SessionGuard],
})
export class AuthModule {}
