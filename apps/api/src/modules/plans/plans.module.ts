import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AuthModule } from "../auth/auth.module";
import { SessionGuard } from "../auth/session.guard";
import { PlanDto } from "./plan.dto";
import { PlansService } from "./plans.service";

@ApiTags("plans")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("plans")
class PlansController {
    constructor(private readonly plans: PlansService) {}

    @Get()
    @ApiOkResponse({ type: [PlanDto] })
    list() {
        return this.plans.list();
    }
}

@Module({
    imports: [AuthModule],
    providers: [PlansService],
    controllers: [PlansController],
})
export class PlansModule {}
