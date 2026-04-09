import {
  IsInt,
  Matches,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAnnotationDto {
  @IsString()
  @MinLength(1)
  comment: string;

  @IsString()
  @MinLength(1)
  quotedText: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9A-Fa-f]{6})$/)
  highlightColor?: string;

  @IsInt()
  @Min(1)
  page: number;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  normalizedX?: number;

  @IsOptional()
  @IsNumber()
  normalizedY?: number;

  @IsOptional()
  @IsNumber()
  normalizedWidth?: number;

  @IsOptional()
  @IsNumber()
  normalizedHeight?: number;
}
