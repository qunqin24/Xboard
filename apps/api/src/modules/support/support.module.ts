import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Module,
    NotFoundException,
    Param,
    ParseIntPipe,
    Post,
    UseGuards,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { IsBoolean, IsString, MaxLength, MinLength } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { CurrentUser, SessionGuard } from "../auth/session.guard";

class MessageInput {
    @IsString() @MinLength(1) @MaxLength(5000) content!: string;
}
class TicketInput extends MessageInput {
    @IsString() @MinLength(1) @MaxLength(120) subject!: string;
}
class CloseInput {
    @IsBoolean() closed!: boolean;
}

@Controller()
@UseGuards(SessionGuard)
class SupportController {
    constructor(private readonly db: PrismaService) {}
    @Get("notices") notices() {
        return this.db.notice.findMany({
            where: { published: true },
            take: 50,
            orderBy: { id: "desc" },
        });
    }
    @Get("tickets") tickets(@CurrentUser() user: User) {
        return this.db.ticket.findMany({
            where: user.role === "admin" ? {} : { userId: user.id },
            take: 100,
            orderBy: { updatedAt: "desc" },
            include: {
                messages: { orderBy: { id: "asc" } },
                user: { select: { email: true } },
            },
        });
    }
    @Post("tickets") create(
        @CurrentUser() user: User,
        @Body() data: TicketInput,
    ) {
        return this.db.ticket.create({
            data: {
                subject: data.subject,
                userId: user.id,
                messages: {
                    create: {
                        content: data.content,
                        authorId: user.id,
                        isStaff: user.role === "admin",
                    },
                },
            },
        });
    }
    @Post("tickets/:id/reply")
    async reply(
        @CurrentUser() user: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() data: MessageInput,
    ) {
        return this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
            const ticket = await tx.ticket.findFirst({
                where: {
                    id,
                    ...(user.role === "admin" ? {} : { userId: user.id }),
                },
            });
            if (!ticket) throw new NotFoundException();
            if (ticket.closed)
                throw new BadRequestException("工单已关闭，请先重新打开。");
            return tx.ticket.update({
                where: { id },
                data: {
                    updatedAt: new Date(),
                    messages: {
                        create: {
                            content: data.content,
                            authorId: user.id,
                            isStaff: user.role === "admin",
                        },
                    },
                },
            });
        });
    }
    @Post("tickets/:id/status")
    async close(
        @CurrentUser() user: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() data: CloseInput,
    ) {
        const result = await this.db.ticket.updateMany({
            where: {
                id,
                ...(user.role === "admin" ? {} : { userId: user.id }),
            },
            data,
        });
        if (!result.count) throw new NotFoundException();
        return { ok: true };
    }
}

@Module({ imports: [AuthModule], controllers: [SupportController] })
export class SupportModule {}
