-- Migration to add custom headers support to email message templates
-- This adds a JSONB column to store custom email headers

-- For PostgreSQL (Dittofeed's default database)
ALTER TABLE message_template
  ADD COLUMN IF NOT EXISTS email_headers JSONB DEFAULT '[]'::jsonb;

-- Add a comment for documentation
COMMENT ON COLUMN message_template.email_headers IS
  'Custom email headers as JSON array of {name, value} objects. Example: [{"name": "X-PM-Message-Stream", "value": "broadcast"}]';

-- Create an index for any lookups by header values if needed
CREATE INDEX IF NOT EXISTS idx_message_template_email_headers
  ON message_template USING GIN (email_headers);
