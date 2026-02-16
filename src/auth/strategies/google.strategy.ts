import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:3000/api/v1/auth/google/callback',
      ),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const displayName =
        profile.displayName ??
        (profile as { name?: { givenName?: string; familyName?: string } }).name
          ?.givenName ??
        (profile as { name?: { familyName?: string } }).name?.familyName;
      const user = await this.authService.validateOrCreateUserFromGoogle(
        profile.id,
        profile.emails?.[0]?.value,
        displayName,
      );
      done(null, user);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
