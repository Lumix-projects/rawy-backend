import { Injectable } from '@nestjs/common';
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
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter() {
    const host = this.configService.get('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get('SMTP_USER');
    const pass = this.configService.get('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.transporter = null;
    }
  }

  async send(options: SendMailOptions): Promise<boolean> {
    if (!this.transporter) {
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
      return true;
    } catch {
      return false;
    }
  }

  async sendVerificationEmail(to: string, token: string, baseUrl: string): Promise<boolean> {
    const link = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    return this.send({
      to,
      subject: 'Verify your email - Rawi',
      html: `<p>Please verify your email by clicking: <a href="${link}">${link}</a></p>`,
      text: `Please verify your email by visiting: ${link}`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string, baseUrl: string): Promise<boolean> {
    const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return this.send({
      to,
      subject: 'Reset your password - Rawi',
      html: `<p>Reset your password by clicking: <a href="${link}">${link}</a></p><p>This link expires in 1 hour.</p>`,
      text: `Reset your password by visiting: ${link}. This link expires in 1 hour.`,
    });
  }
}
