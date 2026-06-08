import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// MAIL_DRIVER=console のときは AWS SDK を初期化しない(認証情報不要)
let _ses: SESv2Client | null = null;
function getSes(): SESv2Client {
  if (_ses) return _ses;
  _ses = new SESv2Client({ region: process.env.AWS_REGION });
  return _ses;
}

function fromAddress(): string {
  const name = process.env.MAIL_FROM_NAME;
  const addr = process.env.MAIL_FROM;
  if (!addr) throw new Error('MAIL_FROM is not set');
  return name ? `${name} <${addr}>` : addr;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const driver = process.env.MAIL_DRIVER ?? 'console';

  if (driver === 'console') {
    console.log('───── MAIL ─────');
    console.log('TO:', opts.to);
    console.log('SUBJECT:', opts.subject);
    console.log(opts.text);
    console.log('────────────────');
    return;
  }

  if (driver !== 'ses') {
    throw new Error(`Unsupported MAIL_DRIVER: ${driver}`);
  }

  await getSes().send(
    new SendEmailCommand({
      FromEmailAddress: fromAddress(),
      Destination: { ToAddresses: [opts.to] },
      Content: {
        Simple: {
          Subject: { Data: opts.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: opts.text, Charset: 'UTF-8' },
            ...(opts.html ? { Html: { Data: opts.html, Charset: 'UTF-8' } } : {}),
          },
        },
      },
    }),
  );
}
