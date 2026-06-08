import {
  applyHeadersToPostmark,
  applyHeadersToSendGrid,
  applyHeadersToNodemailer,
  applyHeadersToResend,
  applyHeadersToSES,
  sanitizeHeaders,
} from './emailCustomHeaders';
import { EmailHeaders } from 'isomorphic-lib/src/types/emailHeaders';

describe('emailCustomHeaders', () => {
  const sampleHeaders: EmailHeaders = [
    { name: 'X-PM-Message-Stream', value: 'broadcast' },
    { name: 'X-Custom-Tag', value: 'campaign-123' },
  ];

  describe('applyHeadersToPostmark', () => {
    it('should add headers in Postmark format', () => {
      const message = { From: 'test@example.com' };
      const result = applyHeadersToPostmark(message, sampleHeaders);
      expect(result.Headers).toEqual([
        { Name: 'X-PM-Message-Stream', Value: 'broadcast' },
        { Name: 'X-Custom-Tag', Value: 'campaign-123' },
      ]);
    });

    it('should preserve existing headers', () => {
      const message = {
        From: 'test@example.com',
        Headers: [{ Name: 'X-Existing', Value: 'value' }],
      };
      const result = applyHeadersToPostmark(message, sampleHeaders);
      expect(result.Headers).toHaveLength(3);
      expect(result.Headers![0]).toEqual({ Name: 'X-Existing', Value: 'value' });
    });

    it('should return message unchanged if no custom headers', () => {
      const message = { From: 'test@example.com' };
      expect(applyHeadersToPostmark(message, undefined)).toBe(message);
      expect(applyHeadersToPostmark(message, [])).toBe(message);
    });
  });

  describe('applyHeadersToSendGrid', () => {
    it('should add headers as object', () => {
      const message = { from: { email: 'test@example.com' } };
      const result = applyHeadersToSendGrid(message, sampleHeaders);
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Custom-Tag': 'campaign-123',
      });
    });

    it('should merge with existing headers', () => {
      const message = {
        from: { email: 'test@example.com' },
        headers: { 'X-Existing': 'value' },
      };
      const result = applyHeadersToSendGrid(message, sampleHeaders);
      expect(result.headers!['X-Existing']).toBe('value');
      expect(result.headers!['X-PM-Message-Stream']).toBe('broadcast');
    });

    it('should return message unchanged if no custom headers', () => {
      const message = { from: { email: 'test@example.com' } };
      expect(applyHeadersToSendGrid(message, undefined)).toBe(message);
    });
  });

  describe('applyHeadersToNodemailer', () => {
    it('should add headers as object', () => {
      const message = { from: 'test@example.com' };
      const result = applyHeadersToNodemailer(message, sampleHeaders);
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Custom-Tag': 'campaign-123',
      });
    });
  });

  describe('applyHeadersToResend', () => {
    it('should add headers as object', () => {
      const message = { from: 'test@example.com' };
      const result = applyHeadersToResend(message, sampleHeaders);
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Custom-Tag': 'campaign-123',
      });
    });
  });

  describe('applyHeadersToSES', () => {
    it('should add headers as object', () => {
      const message = { from: 'test@example.com' };
      const result = applyHeadersToSES(message, sampleHeaders);
      expect(result.headers).toEqual({
        'X-PM-Message-Stream': 'broadcast',
        'X-Custom-Tag': 'campaign-123',
      });
    });
  });

  describe('sanitizeHeaders', () => {
    it('should filter out invalid headers', () => {
      const headers: EmailHeaders = [
        { name: 'X-Valid', value: 'ok' },
        { name: '', value: 'invalid' },
        { name: 'X-Also-Valid', value: 'fine' },
      ];
      const result = sanitizeHeaders(headers);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('X-Valid');
      expect(result[1].name).toBe('X-Also-Valid');
    });

    it('should return empty array for undefined', () => {
      expect(sanitizeHeaders(undefined)).toEqual([]);
    });
  });
});
