import {
    Body,
    Controller,
    Get,
    HttpCode,
    Module,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
} from "@nestjs/common";
import {
    ApiCookieAuth,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiTags,
} from "@nestjs/swagger";
import { User } from "@prisma/client";
import { AuthModule } from "../auth/auth.module";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { CreateOrderDto, OrderDto } from "./orders.dto";
import { OrdersService } from "./orders.service";

@Controller("orders")
@ApiTags("orders")
@ApiCookieAuth()
@UseGuards(SessionGuard)
class OrdersController {
    constructor(private readonly orders: OrdersService) {}

    @Get()
    @ApiOkResponse({ type: [OrderDto] })
    list(@CurrentUser() user: User) {
        return this.orders.list(user.id);
    }

    @Post()
    @ApiCreatedResponse({ type: OrderDto })
    create(@CurrentUser() user: User, @Body() body: CreateOrderDto) {
        return this.orders.create(user.id, body);
    }

    @Post(":id/pay")
    @HttpCode(200)
    @ApiOkResponse({ type: OrderDto })
    pay(
        @CurrentUser() user: User,
        @Param("id", new ParseUUIDPipe()) id: string,
    ) {
        return this.orders.change(user.id, id, "pay");
    }

    @Post(":id/cancel")
    @HttpCode(200)
    @ApiOkResponse({ type: OrderDto })
    cancel(
        @CurrentUser() user: User,
        @Param("id", new ParseUUIDPipe()) id: string,
    ) {
        return this.orders.change(user.id, id, "cancel");
    }
}

@Module({
    imports: [AuthModule],
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
export class OrdersModule {}
