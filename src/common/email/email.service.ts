import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter() {
    const host = this.configService.get('SMTP_HOST') ?? process.env.SMTP_HOST;
    const port = Number(this.configService.get('SMTP_PORT') ?? process.env.SMTP_PORT ?? 587);
    const user = this.configService.get('SMTP_USER') ?? process.env.SMTP_USER;
    const pass = this.configService.get('SMTP_PASS') ?? process.env.SMTP_PASS;

    const isPlaceholder = !pass || pass === 'your-app-password' || !user || user === 'your-email@gmail.com';
    if (isPlaceholder) {
      this.logger.warn(
        'SMTP not configured. Set SMTP_USER and SMTP_PASS in .env with real credentials. Emails will not be sent.',
      );
      this.transporter = null;
      return;
    }

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`SMTP ready (${host}:${port})`);
    } else {
      this.transporter = null;
    }
  }

  async send(options: SendMailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP not configured. Email not sent. To: ${options.to}, Subject: ${options.subject}`,
      );
      return false;
    }

    const from = this.configService.get('EMAIL_FROM', 'noreply@raawy.app');

    try {
      await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(`Email sent to ${options.to}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send failed to ${options.to}: ${(err as Error).message}`);
      return false;
    }
  }

  async sendVerificationEmail(
    to: string,
    otp: string,
    _baseUrl: string,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured. Verification OTP for ${to}: ${otp}`);
    }
    return this.send({
      to,
      subject: 'Verify your email - Rawy',
      html: [
        '<p>Your email verification code is:</p>',
        `<p style="font-size:28px;font-weight:bold;letter-spacing:8px;margin:24px 0;">${otp}</p>`,
        '<p>Enter this 6-digit OTP in the app to verify your email.</p>',
        '<p>This code expires in 24 hours.</p>',
      ].join(''),
      text: `Your verification code: ${otp}\n\nEnter this 6-digit OTP in the app. This code expires in 24 hours.`,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    otp: string,
    _baseUrl: string,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured. Reset OTP for ${to}: ${otp}`);
    }
    return this.send({
      to,
      subject: 'Reset your password - Rawy',
      html: [
        '<p>Your password reset code is:</p>',
        `<p style="font-size:28px;font-weight:bold;letter-spacing:8px;margin:24px 0;">${otp}</p>`,
        '<p>Enter this 6-digit OTP in the app to reset your password.</p>',
        '<p>This code expires in 1 hour.</p>',
      ].join(''),
      text: `Your password reset code: ${otp}\n\nEnter this 6-digit OTP in the app. This code expires in 1 hour.`,
    });
  }
}
