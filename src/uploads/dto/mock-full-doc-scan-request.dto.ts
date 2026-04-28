import { IsArray, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ParagraphDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsInt()
  @Min(1)
  pageNumber: number;
}

export class MockFullDocScanRequestDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParagraphDto)
  paragraphs?: ParagraphDto[];
}
