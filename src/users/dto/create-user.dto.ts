import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MaxLength(50)
  @MinLength(3)
  name!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @MaxLength(18)
  password!: string;
}
