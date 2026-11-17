import { Controller, Get, Module } from "@nestjs/common";
import { ApiOkResponse, ApiProperty, ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";

class SiteDto {
    @ApiProperty()
    siteName!: string;

    @ApiProperty()
    registrationOpen!: boolean;

    @ApiProperty({ description: "Plain text shown next to the ticket form." })
    supportNote!: string;
}

@ApiTags("site")
@Controller("site")
class SiteController {
    constructor(private readonly settings: SettingsService) {}

    @Get()
    @ApiOkResponse({ type: SiteDto })
    site(): Promise<SiteDto> {
        return this.settings.read();
    }
}

@Module({
    controllers: [SiteController],
    providers: [SettingsService],
    exports: [SettingsService],
})
export class SiteModule {}
