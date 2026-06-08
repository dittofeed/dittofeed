import { buildProviderPayload, EmailMessage } from './sendEmail';

describe('sendEmail - buildProviderPayload', () => {
  const baseMessage: EmailMessage = {
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Test Email',
    html: '<h1>Hello</h1>',
    text: 'Hello',
    headers: [
      { name: 'X-PM-Message-Stream', value: 'broadcast' },
      { name: 'X-Campaign-ID', value: 'camp-123' },
    ],
  };

  describe('postmark provider', () => {
    it('should include headers in Postmark format', () => {
      const result = buildProviderPayload(baseMessage, 'postmark');
      expect(result.Headers).toEqual([
        { Name: 'X-PM-Message-Stream', Value: 'broadcast' },
        { Name: 'X-Campaign-ID', Value: 'camp-123' },
      ]);
      expect(result.From).toBe('sender@example.com');
      expect(result.To).toBe('recipient@example.com');
    });
  });

  describe('sendgrid provider', () => {
    it('should include headers as object', () => {
      const result = buildProviderPayload(baseMessage, 'sendgrid');
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Campaign-ID': 'camp-123',
      });
    });
  });

  describe('smtp provider', () => {
    it('should include headers as object', () => {
      const result = buildProviderPayload(baseMessage, 'smtp');
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Campaign-ID': 'camp-123',
      });
    });
  });

  describe('ses provider', () => {
    it('should include headers as object', () => {
      const result = buildProviderPayload(baseMessage, 'ses');
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Campaign-ID': 'camp-123',
      });
    });
  });

  describe('resend provider', () => {
    it('should include headers as object', () => {
      const result = buildProviderPayload(baseMessage, 'resend');
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Campaign-ID': 'camp-123',
      });
    });
  });

  describe('without headers', () => {
    it('should work without custom headers', () => {
      const msg = { ...baseMessage, headers: undefined };
      const result = buildProviderPayload(msg, 'postmark');
      expect(result.Headers).toBeUndefined();
      expect(result.From).toBe('sender@example.com');
    });
  });

  describe('with invalid headers', () => {
    it('should filter out invalid headers', () => {
      const msg: EmailMessage = {
        ...baseMessage,
        headers: [
          { name: 'X-Valid', value: 'ok' },
          { name: '', value: 'invalid' },
        ],
      };
      const result = buildProviderPayload(msg, 'sendgrid');
      expect(result.headers).toEqual({ 'X-Valid': 'ok' });
    });
  });
});
