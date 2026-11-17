import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { normalizeEmail } from "./password";

export class LoginDto {
    @ApiProperty({ example: "developer@example.test", maxLength: 64 })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? normalizeEmail(value) : value,
    )
    // The seeded development identity uses the reserved .test TLD.
    @IsEmail({ require_tld: false })
    @MaxLength(64)
    email!: string;

    @ApiProperty({
        minLength: 1,
        maxLength: 256,
        format: "password",
        writeOnly: true,
    })
    @IsString()
    @MinLength(1)
    @MaxLength(256)
    password!: string;
}

export class LoginResultDto {
    @ApiProperty()
    email!: string;
}

export class RegisterDto {
    @ApiProperty({ example: "user@example.com", maxLength: 64 })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? normalizeEmail(value) : value,
    )
    @IsEmail()
    @MaxLength(64)
    email!: string;

    @ApiProperty({
        minLength: 12,
        maxLength: 128,
        format: "password",
        writeOnly: true,
    })
    @IsString()
    @MinLength(12)
    @MaxLength(128)
    password!: string;
}
