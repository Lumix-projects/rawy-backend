import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { EmailService } from '../../common/email/email.service';

export const VERIFICATION_EMAIL_QUEUE = 'verification-emails';

export interface VerificationEmailJobData {
  to: string;
  token: string;
  baseUrl: string;
}

@Processor(VERIFICATION_EMAIL_QUEUE)
export class VerificationEmailProcessor {
  constructor(private readonly emailService: EmailService) {}

  @Process('send')
  async handleSendVerificationEmail(job: Job) {
    const { to, token, baseUrl } = job.data;
    await this.emailService.sendVerificationEmail(to, token, baseUrl);
    return { sent: true };
  }
}
