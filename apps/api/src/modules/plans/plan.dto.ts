import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PriceDto {
    @ApiProperty()
    period!: string;

    @ApiProperty({
        description: "Integer minor units (CNY fen).",
        type: "integer",
    })
    amountMinor!: number;
}

export class PlanDto {
    @ApiProperty()
    id!: number;

    @ApiProperty()
    name!: string;

    @ApiProperty({ description: "Plain text description." })
    description!: string;

    @ApiProperty({
        description: "Bytes as a decimal string to preserve BigInt precision.",
    })
    transferBytes!: string;

    @ApiPropertyOptional({ type: Number, nullable: true })
    speedLimitMbps!: number | null;

    @ApiPropertyOptional({ type: Number, nullable: true })
    deviceLimit!: number | null;

    @ApiProperty({ type: [PriceDto] })
    prices!: PriceDto[];
}
