import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CasesService } from "./cases.service";
import { CreateCaseDto, TransitionCaseDto, UpdateCaseDto } from "./dto/case.dto";

@ApiTags("cases")
@Controller("cases")
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  @ApiOperation({ summary: "Create a draft case (stub user)" })
  create(@Body() dto: CreateCaseDto) {
    return this.cases.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List cases for the stub authenticated user" })
  list() {
    return this.cases.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "Fetch a case and its audit log" })
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.cases.get(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update structured fields / user corrections" })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCaseDto) {
    return this.cases.update(id, dto);
  }

  @Post(":id/transition")
  @ApiOperation({ summary: "Drive the case status state machine" })
  transition(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TransitionCaseDto) {
    return this.cases.transition(id, dto);
  }
}
