import {
  emailHeadersToRecord,
  recordToEmailHeaderEntries,
  validateHeaderName,
  validateHeaderValue,
} from '../emailHeaders';

describe('emailHeaders utilities', () => {
  describe('emailHeadersToRecord', () => {
    it('should convert entries array to record', () => {
      const entries = [
        { name: 'X-Custom', value: 'value1' },
        { name: 'X-Another', value: 'value2' },
      ];
      const result = emailHeadersToRecord(entries);
      expect(result).toEqual({
        'X-Custom': 'value1',
        'X-Another': 'value2',
      });
    });

    it('should skip entries with empty names', () => {
      const entries = [
        { name: '', value: 'value1' },
        { name: 'X-Valid', value: 'value2' },
        { name: '  ', value: 'value3' },
      ];
      const result = emailHeadersToRecord(entries);
      expect(result).toEqual({ 'X-Valid': 'value2' });
    });

    it('should trim header names', () => {
      const entries = [{ name: '  X-Custom  ', value: 'value' }];
      const result = emailHeadersToRecord(entries);
      expect(result).toEqual({ 'X-Custom': 'value' });
    });
  });

  describe('recordToEmailHeaderEntries', () => {
    it('should convert record to entries array', () => {
      const record = { 'X-Custom': 'value1', 'X-Another': 'value2' };
      const result = recordToEmailHeaderEntries(record);
      expect(result).toEqual([
        { name: 'X-Custom', value: 'value1' },
        { name: 'X-Another', value: 'value2' },
      ]);
    });

    it('should handle empty record', () => {
      const result = recordToEmailHeaderEntries({});
      expect(result).toEqual([]);
    });
  });

  describe('validateHeaderName', () => {
    it('should accept valid header names', () => {
      expect(validateHeaderName('X-Custom')).toBe(true);
      expect(validateHeaderName('X-PM-Message-Stream')).toBe(true);
      expect(validateHeaderName('List-Unsubscribe')).toBe(true);
      expect(validateHeaderName('X-Mailer')).toBe(true);
    });

    it('should reject invalid header names', () => {
      expect(validateHeaderName('')).toBe(false);
      expect(validateHeaderName('  ')).toBe(false);
      expect(validateHeaderName('Header: Name')).toBe(false);
      expect(validateHeaderName('Header Name')).toBe(false);
    });
  });

  describe('validateHeaderValue', () => {
    it('should accept valid header values', () => {
      expect(validateHeaderValue('broadcast')).toBe(true);
      expect(validateHeaderValue('some value with spaces')).toBe(true);
      expect(validateHeaderValue('')).toBe(true);
      expect(validateHeaderValue('<mailto:unsub@example.com>')).toBe(true);
    });

    it('should reject invalid header values', () => {
      expect(validateHeaderValue('value\ninjection')).toBe(false);
      expect(validateHeaderValue('value\rinjection')).toBe(false);
    });
  });
});
