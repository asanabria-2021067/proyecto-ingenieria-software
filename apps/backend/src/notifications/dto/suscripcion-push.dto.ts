import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class SuscripcionPushDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(1000)
  endpoint!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  p256dh!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  auth!: string;
}

export class BajaPushDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  endpoint!: string;
}
