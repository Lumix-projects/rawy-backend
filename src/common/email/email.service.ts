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
    const host = this.configService.get('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get('SMTP_USER');
    const pass = this.configService.get('SMTP_PASS');

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
    token: string,
    baseUrl: string,
  ): Promise<boolean> {
    const link = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured. Verification token for ${to}: ${token}`);
    }
    const tokenLine = `Your verification token: ${token}`;
    return this.send({
      to,
      subject: 'Verify your email - Rawi',
      html: [
        `<p>Please verify your email by clicking: <a href="${link}">Verify my email</a></p>`,
        `<p><strong>${tokenLine}</strong></p>`,
        '<p>Or copy the token above and paste it in the app.</p>',
      ].join(''),
      text: `Please verify your email by visiting: ${link}\n\n${tokenLine}\n\nOr copy the token and paste it in the app.`,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    token: string,
    baseUrl: string,
  ): Promise<boolean> {
    const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured. Reset token for ${to}: ${token}`);
    }
    return this.send({
      to,
      subject: 'Reset your password - Rawi',
      html: `<p>Reset your password by clicking: <a href="${link}">${link}</a></p><p>This link expires in 1 hour.</p>`,
      text: `Reset your password by visiting: ${link}. This link expires in 1 hour.`,
    });
  }
}
