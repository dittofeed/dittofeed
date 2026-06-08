import { buildPostmarkRequest } from '../postmark';

describe('Postmark integration', () => {
  describe('buildPostmarkRequest', () => {
    it('should extract X-PM-Message-Stream to MessageStream field', () => {
      const result = buildPostmarkRequest({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Broadcast Email',
        htmlBody: '<p>Hello</p>',
        headers: {
          'X-PM-Message-Stream': 'broadcast',
        },
      });

      expect(result.MessageStream).toBe('broadcast');
      // Should not appear in Headers array
      expect(result.Headers).toBeUndefined();
    });

    it('should include other custom headers in Headers array', () => {
      const result = buildPostmarkRequest({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        htmlBody: '<p>Hello</p>',
        headers: {
          'X-PM-Message-Stream': 'broadcast',
          'X-Custom-Header': 'custom-value',
          'List-Unsubscribe': '<mailto:unsub@example.com>',
        },
      });

      expect(result.MessageStream).toBe('broadcast');
      expect(result.Headers).toEqual([
        { Name: 'X-Custom-Header', Value: 'custom-value' },
        { Name: 'List-Unsubscribe', Value: '<mailto:unsub@example.com>' },
      ]);
    });

    it('should work without custom headers', () => {
      const result = buildPostmarkRequest({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        htmlBody: '<p>Hello</p>',
      });

      expect(result.MessageStream).toBeUndefined();
      expect(result.Headers).toBeUndefined();
    });

    it('should include all basic email fields', () => {
      const result = buildPostmarkRequest({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        htmlBody: '<p>Body</p>',
        textBody: 'Body',
        replyTo: 'reply@example.com',
        tag: 'newsletter',
        trackOpens: true,
      });

      expect(result.From).toBe('sender@example.com');
      expect(result.To).toBe('recipient@example.com');
      expect(result.Subject).toBe('Test Subject');
      expect(result.HtmlBody).toBe('<p>Body</p>');
      expect(result.TextBody).toBe('Body');
      expect(result.ReplyTo).toBe('reply@example.com');
      expect(result.Tag).toBe('newsletter');
      expect(result.TrackOpens).toBe(true);
    });

    it('should handle transactional message stream', () => {
      const result = buildPostmarkRequest({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Order Confirmation',
        htmlBody: '<p>Your order is confirmed</p>',
        headers: {
          'X-PM-Message-Stream': 'outbound',
        },
      });

      expect(result.MessageStream).toBe('outbound');
    });
  });
});
