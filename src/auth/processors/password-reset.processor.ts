import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { EmailService } from '../../common/email/email.service';

export const PASSWORD_RESET_EMAIL_QUEUE = 'password-reset-emails';

export interface PasswordResetEmailJobData {
  to: string;
  token: string;
  baseUrl: string;
}

@Processor(PASSWORD_RESET_EMAIL_QUEUE)
export class PasswordResetEmailProcessor {
  constructor(private readonly emailService: EmailService) {}

  @Process('send')
  async handleSendPasswordResetEmail(job: Job) {
    const { to, token, baseUrl } = job.data;
    await this.emailService.sendPasswordResetEmail(to, token, baseUrl);
    return { sent: true };
  }
}
