# Dittofeed v0.21.0 Release Notes

## Overview
This release includes several major architectural improvements and new features, including a reimplemented ORM layer, enhanced deliveries tracking and visualization, new user group functionality, improved template capabilities, and numerous bug fixes and performance enhancements.

## Major Features

### Groups Support
- Added a new Groups feature that provides a mechanism for describing collections of users
- APIs for assigning users to groups and retrieving users for a specific group
- APIs for retrieving all groups a user belongs to
- Group-based filtering in the Deliveries table
- Support for subscription group assignments

### New Deliveries Table
- Completely reimplemented deliveries table with enhanced filtering and sorting
- New component configurations table and controller for embedded product support
- Configurable columns in the deliveries table
- Order-dependent allowed columns
- Support for filtering deliveries by group ID
- Improved date range filter handling

### Drizzle ORM Migration
- Replaced Prisma with Drizzle to reduce memory footprint across all services
- Added default values to ID and updatedAt columns
- Improved database schema with better types
- Restructured workspace relations

### Global Computed Properties
- New workflow for scheduling workflows to be re-computed
- New workflow for processing scheduled workflows
- Semaphore for managing compute concurrency
- Added reset compute properties CLI command
- Support for file user properties
- Better handling of user properties validation errors

### Template Enhancements
- Added template mode to email, SMS, and webhook editors
- Improved name editor interface
- Support for SMS template variables
- Added image block support for email templates
- Abstracted template backend logic

## Additional Improvements

### Performance & Reliability
- Configurable API body limit for handling larger payloads
- Configurable read query concurrency
- Improved support for assignments from ClickHouse
- Handling of edge cases in delivery updates
- More defensive event processing for mail providers
- Improved webhook verification
- Enhanced resiliency checks and latency monitoring

### Documentation & Developer Experience
- Updated embedded component documentation
- Added documentation for Mailchimp integration
- Improved CSV upload instructions
- Documentation for subscription group assignment endpoints
- Added documentation for various node types (trait, performed segment, email, random bucket, etc.)

### CLI & Admin Tools
- Exposed CLI interfaces for various operations
- Refined admin CLI typing
- Added support for finding due workspaces
- Enhanced workspace management capabilities
- Added commands to pause workspaces and stop computed properties

### Security & Data Management
- Forbid common non-company domains for security
- Improved handling of empty workspaces
- Better management of workspace configuration

### Bug Fixes
- Fixed segment upsert logic
- Fixed user properties reset and read
- Fixed non-windowed performed segment handling
- Improved mailchimp webhook handling
- Fixed unique index on workspace name
- Fixed deliveries filter functionality
- Fixed regressions in upsert subscription group
- Fixed linting issues in API

## Breaking Changes
- Migration from Prisma to Drizzle ORM requires database migration
- See upgrade documentation for v0.20.0 to v0.21.0

For complete details, please review the commit history between v0.20.0 and v0.21.0. 