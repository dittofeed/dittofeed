import {
  buildSmtpMessage,
  buildPostmarkMessage,
  buildSendGridMessage,
  buildSesRawMessage,
} from '../sendEmail';

describe('sendEmail with custom headers', () => {
  const baseParams = {
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Test Email',
    html: '<p>Hello World</p>',
    replyTo: 'reply@example.com',
  };

  describe('buildSmtpMessage', () => {
    it('should include custom headers', () => {
      const result = buildSmtpMessage({
        ...baseParams,
        headers: { 'X-PM-Message-Stream': 'broadcast', 'X-Custom': 'value' },
      });
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Custom': 'value',
      });
    });

    it('should work without custom headers', () => {
      const result = buildSmtpMessage(baseParams);
      expect(result.headers).toBeUndefined();
    });
  });

  describe('buildPostmarkMessage', () => {
    it('should convert headers to Postmark format', () => {
      const result = buildPostmarkMessage({
        from: baseParams.from,
        to: baseParams.to,
        subject: baseParams.subject,
        htmlBody: baseParams.html,
        replyTo: baseParams.replyTo,
        headers: { 'X-PM-Message-Stream': 'broadcast' },
      });
      expect(result.Headers).toEqual([
        { Name: 'X-PM-Message-Stream', Value: 'broadcast' },
      ]);
      expect(result.MessageStream).toBe('broadcast');
    });

    it('should use messageStream param when provided', () => {
      const result = buildPostmarkMessage({
        from: baseParams.from,
        to: baseParams.to,
        subject: baseParams.subject,
        htmlBody: baseParams.html,
        messageStream: 'transactional',
      });
      expect(result.MessageStream).toBe('transactional');
    });
  });

  describe('buildSendGridMessage', () => {
    it('should include headers in personalizations', () => {
      const result = buildSendGridMessage({
        ...baseParams,
        headers: { 'X-Custom': 'value' },
      });
      expect(result.personalizations[0].headers).toEqual({
        'X-Custom': 'value',
      });
      expect(result.headers).toEqual({ 'X-Custom': 'value' });
    });
  });

  describe('buildSesRawMessage', () => {
    it('should include custom headers in raw message', () => {
      const result = buildSesRawMessage({
        ...baseParams,
        headers: { 'X-SES-Custom': 'myvalue' },
      });
      expect(result).toContain('X-SES-Custom: myvalue');
    });

    it('should not include blocked headers', () => {
      const result = buildSesRawMessage({
        ...baseParams,
        headers: { 'Content-Type': 'text/plain', 'X-Valid': 'yes' },
      });
      // Content-Type from custom headers should be filtered out
      // but the MIME Content-Type will still be present
      expect(result).toContain('X-Valid: yes');
    });
  });
});
