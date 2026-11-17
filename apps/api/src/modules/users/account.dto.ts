import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PlanDto } from "../plans/plan.dto";

export class AccountDto {
    @ApiProperty()
    email!: string;

    @ApiProperty({ enum: ["user", "admin"] })
    role!: "user" | "admin";

    @ApiProperty()
    emailVerified!: boolean;

    @ApiProperty({ description: "Integer CNY fen.", type: "integer" })
    balanceMinor!: number;

    @ApiProperty({ type: Number, nullable: true })
    speedLimitMbps!: number | null;

    @ApiProperty({ type: Number, nullable: true })
    deviceLimit!: number | null;

    @ApiProperty({ description: "Decimal byte string." })
    uploadBytes!: string;

    @ApiProperty({ description: "Decimal byte string." })
    downloadBytes!: string;

    @ApiProperty({ description: "Decimal byte string." })
    transferBytes!: string;

    @ApiPropertyOptional({
        type: Number,
        nullable: true,
        description: "Unix seconds; null means no expiry.",
    })
    expiredAt!: number | null;

    @ApiPropertyOptional({ type: () => PlanDto, nullable: true })
    plan!: PlanDto | null;
}
