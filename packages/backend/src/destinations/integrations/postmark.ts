/**
 * Postmark email provider integration with custom headers support.
 * 
 * This module handles sending emails through the Postmark API,
 * including support for custom headers like X-PM-Message-Stream
 * to select the appropriate message stream (transactional, broadcast, etc.).
 */

import { EmailHeaders } from 'isomorphic-lib/src/types/emailHeaders';
import { processEmailHeaders } from '../emailHeaders';

export interface PostmarkHeader {
  Name: string;
  Value: string;
}

export interface PostmarkSendRequest {
  From: string;
  To: string;
  Subject: string;
  HtmlBody: string;
  TextBody?: string;
  ReplyTo?: string;
  Headers?: PostmarkHeader[];
  MessageStream?: string;
  Tag?: string;
  TrackOpens?: boolean;
  TrackLinks?: string;
}

export interface PostmarkSendOptions {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  headers?: EmailHeaders;
  tag?: string;
  trackOpens?: boolean;
}

/**
 * Builds a Postmark send request with custom headers support.
 * 
 * Special handling for X-PM-Message-Stream:
 * If this header is present in custom headers, it's extracted and set
 * as the MessageStream field which is the proper Postmark API field.
 */
export function buildPostmarkRequest(options: PostmarkSendOptions): PostmarkSendRequest {
  const processedHeaders = processEmailHeaders(options.headers);
  
  const request: PostmarkSendRequest = {
    From: options.from,
    To: options.to,
    Subject: options.subject,
    HtmlBody: options.htmlBody,
    TextBody: options.textBody,
    ReplyTo: options.replyTo,
    Tag: options.tag,
    TrackOpens: options.trackOpens,
  };

  if (processedHeaders) {
    // Extract MessageStream from headers if present
    const messageStream = processedHeaders['X-PM-Message-Stream'];
    if (messageStream) {
      request.MessageStream = messageStream;
    }

    // Convert remaining headers to Postmark format
    const postmarkHeaders: PostmarkHeader[] = [];
    for (const [name, value] of Object.entries(processedHeaders)) {
      // X-PM-Message-Stream is handled via MessageStream field
      if (name !== 'X-PM-Message-Stream') {
        postmarkHeaders.push({ Name: name, Value: value });
      }
    }

    if (postmarkHeaders.length > 0) {
      request.Headers = postmarkHeaders;
    }
  }

  return request;
}

/**
 * Example usage demonstrating how to send a broadcast email via Postmark.
 * 
 * ```typescript
 * const request = buildPostmarkRequest({
 *   from: 'sender@example.com',
 *   to: 'recipient@example.com',
 *   subject: 'Newsletter',
 *   htmlBody: '<p>Hello!</p>',
 *   headers: {
 *     'X-PM-Message-Stream': 'broadcast',
 *   },
 * });
 * // request.MessageStream === 'broadcast'
 * ```
 */
