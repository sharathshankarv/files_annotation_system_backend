import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateAnnotationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  comment?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9A-Fa-f]{6})$/)
  highlightColor?: string;
}
