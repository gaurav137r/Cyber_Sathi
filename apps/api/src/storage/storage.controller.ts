import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";
import { randomUUID } from "node:crypto";
import { StorageService } from "./storage.service";

class PresignUploadDto {
  @IsString()
  @MinLength(1)
  filename!: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

@ApiTags("smoke")
@Controller("smoke/storage")
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post("presign-upload")
  @ApiOperation({ summary: "Presigned PUT URL for a test object in MinIO" })
  presignUpload(@Body() dto: PresignUploadDto) {
    const key = `smoke/${randomUUID()}/${dto.filename}`;
    return this.storage.presignUpload(key, dto.contentType ?? "application/octet-stream");
  }

  @Get("presign-download")
  @ApiOperation({ summary: "Presigned GET URL for an object key" })
  presignDownload(@Query("key") key: string) {
    return this.storage.presignDownload(key);
  }
}
