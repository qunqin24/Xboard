import { ApiProperty } from "@nestjs/swagger";
import { BillingPeriod, OrderStatus } from "@prisma/client";
import { IsEnum, IsInt, IsUUID, Min } from "class-validator";

export class CreateOrderDto {
    @ApiProperty()
    @IsInt()
    @Min(1)
    planId!: number;

    @ApiProperty({ enum: BillingPeriod })
    @IsEnum(BillingPeriod)
    period!: BillingPeriod;

    @ApiProperty({
        format: "uuid",
        description: "Reuse this key when retrying the same purchase.",
    })
    @IsUUID("4")
    requestId!: string;
}

export class OrderDto {
    @ApiProperty() id!: string;
    @ApiProperty() planName!: string;
    @ApiProperty({ enum: BillingPeriod }) period!: BillingPeriod;
    @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
    @ApiProperty() amountMinor!: number;
    @ApiProperty() transferBytes!: string;
    @ApiProperty() durationDays!: number;
    @ApiProperty() createdAt!: string;
    @ApiProperty() expiresAt!: string;
}
