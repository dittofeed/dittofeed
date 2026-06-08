import {
  mergeEmailHeaders,
  filterBlockedHeaders,
  processEmailHeaders,
} from '../emailHeaders';

describe('emailHeaders', () => {
  describe('mergeEmailHeaders', () => {
    it('should return empty object when no headers provided', () => {
      const result = mergeEmailHeaders(undefined, undefined);
      expect(result).toEqual({});
    });

    it('should return custom headers when no system headers', () => {
      const custom = { 'X-Custom': 'value1' };
      const result = mergeEmailHeaders(custom, undefined);
      expect(result).toEqual({ 'X-Custom': 'value1' });
    });

    it('should return system headers when no custom headers', () => {
      const system = { 'X-System': 'value2' };
      const result = mergeEmailHeaders(undefined, system);
      expect(result).toEqual({ 'X-System': 'value2' });
    });

    it('should merge both headers with system taking precedence', () => {
      const custom = { 'X-Custom': 'value1', 'X-Shared': 'custom' };
      const system = { 'X-System': 'value2', 'X-Shared': 'system' };
      const result = mergeEmailHeaders(custom, system);
      expect(result).toEqual({
        'X-Custom': 'value1',
        'X-System': 'value2',
        'X-Shared': 'system',
      });
    });
  });

  describe('filterBlockedHeaders', () => {
    it('should remove blocked headers', () => {
      const headers = {
        From: 'test@example.com',
        To: 'recipient@example.com',
        Subject: 'Test',
        'X-Custom': 'allowed',
        'X-PM-Message-Stream': 'broadcast',
      };
      const result = filterBlockedHeaders(headers);
      expect(result).toEqual({
        'X-Custom': 'allowed',
        'X-PM-Message-Stream': 'broadcast',
      });
    });

    it('should handle case-insensitive blocked headers', () => {
      const headers = {
        'content-type': 'text/html',
        'Content-Type': 'text/html',
        'CONTENT-TYPE': 'text/html',
        'X-Valid': 'yes',
      };
      const result = filterBlockedHeaders(headers);
      expect(result).toEqual({ 'X-Valid': 'yes' });
    });

    it('should return all headers when none are blocked', () => {
      const headers = {
        'X-PM-Message-Stream': 'broadcast',
        'X-Custom-Header': 'value',
        'List-Unsubscribe': '<mailto:unsubscribe@example.com>',
      };
      const result = filterBlockedHeaders(headers);
      expect(result).toEqual(headers);
    });
  });

  describe('processEmailHeaders', () => {
    it('should return undefined when no headers', () => {
      const result = processEmailHeaders(undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('should filter and merge headers', () => {
      const custom = {
        'X-PM-Message-Stream': 'broadcast',
        From: 'hacker@evil.com',
      };
      const result = processEmailHeaders(custom);
      expect(result).toEqual({ 'X-PM-Message-Stream': 'broadcast' });
    });

    it('should handle Postmark message stream header', () => {
      const custom = { 'X-PM-Message-Stream': 'broadcast' };
      const result = processEmailHeaders(custom);
      expect(result).toEqual({ 'X-PM-Message-Stream': 'broadcast' });
    });
  });
});
