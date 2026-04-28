import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class MockAnnotationRequestDto {
  @IsString()
  @MinLength(1)
  selectedText: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  documentRef?: string;

  @IsOptional()
  @IsArray()
  mockResponses?: Array<{
    text: string;
    pageNumber: number;
    color: 'RED' | 'BLUE' | 'GREEN';
    documentRef: string;
  }>;
}
