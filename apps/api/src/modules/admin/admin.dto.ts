import { Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";
import { BillingPeriod, NodeProtocol } from "@prisma/client";

export class PriceInput {
    @IsEnum(BillingPeriod) period!: BillingPeriod;
    @IsInt() @Min(0) @Max(100000000) amountMinor!: number;
}
export class PlanInput {
    @IsString() @MinLength(1) @MaxLength(80) name!: string;
    @IsString() @MaxLength(4000) content!: string;
    @IsString() @Matches(/^[1-9]\d{0,14}$/) transferBytes!: string;
    @IsOptional() @IsInt() @Min(1) @Max(100000) speedLimit?: number | null;
    @IsOptional() @IsInt() @Min(1) @Max(1000) deviceLimit?: number | null;
    @IsBoolean() published!: boolean;
    @IsInt() @Min(0) sort!: number;
    @IsArray()
    @ArrayMaxSize(3)
    @ValidateNested({ each: true })
    @Type(() => PriceInput)
    prices!: PriceInput[];
}
export class CreditInput {
    @IsInt() @Min(1) @Max(100000000) amountMinor!: number;
    @IsUUID("4") requestId!: string;
    @IsString() @MinLength(3) @MaxLength(200) reason!: string;
}
export class BanInput {
    @IsBoolean() banned!: boolean;
}
export class ResetTrafficInput {
    @IsString() @MinLength(3) @MaxLength(200) reason!: string;
}
export class NodeInput {
    @IsString() @MinLength(1) @MaxLength(80) name!: string;
    @IsEnum(NodeProtocol) protocol!: NodeProtocol;
    @IsString() @Matches(/^[a-zA-Z0-9.:[\]-]{1,253}$/) host!: string;
    @IsInt() @Min(1) @Max(65535) port!: number;
    @IsString() @Matches(/^[a-zA-Z0-9.-]{0,253}$/) serverName!: string;
    @IsString()
    @Matches(/^(aes-128-gcm|aes-256-gcm|chacha20-ietf-poly1305)$/)
    cipher!: string;
    @IsBoolean() enabled!: boolean;
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(100)
    @IsInt({ each: true })
    @Min(1, { each: true })
    planIds!: number[];
}
export class NoticeInput {
    @IsString() @MinLength(1) @MaxLength(120) title!: string;
    @IsString() @MinLength(1) @MaxLength(10000) content!: string;
    @IsBoolean() published!: boolean;
}
