import { Injectable } from '@nestjs/common';

@Injectable()
export class SecureAnonymizerService {
  anonymize(text: string): string {
    let clean = text;

    // 1. Redact Corporate Tax IDs (US EIN: XX-XXXXXXX, UAE TRN: 100XXXXXXXXXXXX)
    const einRegex = /(?<![-+\d])\b\d{2}-\d{7}\b/g;
    clean = clean.replace(einRegex, '[REDACTED_TAX_ID]');

    const trnRegex = /(?<![-+\d])\b100\d{12}\b/g;
    clean = clean.replace(trnRegex, '[REDACTED_TAX_ID]');

    // 2. Redact Corporate Business Names (e.g. Acme LLC, Globex Corp)
    const companyRegex =
      /\b[A-Z0-9][A-Za-z0-9&\s.,'-]{0,30}\s+(LLC|LLP|Inc\.|Inc|Corp\.|Corp|Ltd\.|Ltd|Co\.|Co|PJSC|pjsc)\b/gi;
    clean = clean.replace(companyRegex, '[REDACTED_COMPANY]');

    // 3. Redact Emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    clean = clean.replace(emailRegex, '[REDACTED_EMAIL]');

    // 4. Redact Phone numbers (e.g. standard formats)
    const phoneRegex =
      /\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
    clean = clean.replace(phoneRegex, '[REDACTED_PHONE]');

    // 5. Redact common name disclosures (e.g. "I am John Doe", "Client: Jane Smith")
    const clientNameRegex =
      /(client|customer|user|owner):\s*[A-Z][a-z]+\s+[A-Z][a-z]+/gi;
    clean = clean.replace(clientNameRegex, '$1: [REDACTED_NAME]');

    return clean;
  }

  convertToTrainingFormat(logs: string[]): string {
    return logs
      .map((log) =>
        JSON.stringify({
          prompt: 'Execute real estate underwrite task',
          response: this.anonymize(log),
        }),
      )
      .join('\n');
  }
}
