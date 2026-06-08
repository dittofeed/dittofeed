import {
  formatHeadersForSmtp,
  formatHeadersForSendGrid,
  formatHeadersForPostmark,
  formatHeadersForSes,
} from './customHeaders';
import { EmailHeaders } from '@dittofeed/isomorphic-lib/src/types/emailHeaders';

describe('formatHeadersForSmtp', () => {
  it('returns undefined for empty headers', () => {
    expect(formatHeadersForSmtp(undefined)).toBeUndefined();
    expect(formatHeadersForSmtp([])).toBeUndefined();
  });

  it('formats headers as key-value record', () => {
    const headers: EmailHeaders = [
      { name: 'X-PM-Message-Stream', value: 'broadcast' },
      { name: 'X-Priority', value: '1' },
    ];

    const result = formatHeadersForSmtp(headers);
    expect(result).toEqual({
      'X-PM-Message-Stream': 'broadcast',
      'X-Priority': '1',
    });
  });
});

describe('formatHeadersForSendGrid', () => {
  it('returns undefined for empty headers', () => {
    expect(formatHeadersForSendGrid(undefined)).toBeUndefined();
    expect(formatHeadersForSendGrid([])).toBeUndefined();
  });

  it('formats headers as key-value record', () => {
    const headers: EmailHeaders = [
      { name: 'X-Custom', value: 'test-value' },
    ];

    const result = formatHeadersForSendGrid(headers);
    expect(result).toEqual({ 'X-Custom': 'test-value' });
  });
});

describe('formatHeadersForPostmark', () => {
  it('returns undefined for empty headers', () => {
    expect(formatHeadersForPostmark(undefined)).toBeUndefined();
    expect(formatHeadersForPostmark([])).toBeUndefined();
  });

  it('formats headers as Name/Value array for Postmark API', () => {
    const headers: EmailHeaders = [
      { name: 'X-PM-Message-Stream', value: 'broadcast' },
      { name: 'X-PM-Tag', value: 'welcome' },
    ];

    const result = formatHeadersForPostmark(headers);
    expect(result).toEqual([
      { Name: 'X-PM-Message-Stream', Value: 'broadcast' },
      { Name: 'X-PM-Tag', Value: 'welcome' },
    ]);
  });

  it('filters out empty-named headers', () => {
    const headers: EmailHeaders = [
      { name: '', value: 'empty' },
      { name: 'X-Valid', value: 'kept' },
    ];

    const result = formatHeadersForPostmark(headers);
    expect(result).toEqual([{ Name: 'X-Valid', Value: 'kept' }]);
  });
});

describe('formatHeadersForSes', () => {
  it('returns undefined for empty headers', () => {
    expect(formatHeadersForSes(undefined)).toBeUndefined();
    expect(formatHeadersForSes([])).toBeUndefined();
  });

  it('formats headers as Name/Value array', () => {
    const headers: EmailHeaders = [
      { name: 'X-SES-CONFIGURATION-SET', value: 'my-config' },
    ];

    const result = formatHeadersForSes(headers);
    expect(result).toEqual([
      { Name: 'X-SES-CONFIGURATION-SET', Value: 'my-config' },
    ]);
  });
});
