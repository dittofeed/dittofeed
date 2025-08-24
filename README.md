<p align="center">
  <a href="https://dittofeed.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/dittofeed/dittofeed/main/packages/docs/logo/dark.png">
      <img alt="dittofeed logo" src="https://raw.githubusercontent.com/dittofeed/dittofeed/main/packages/docs/logo/light.png">
    </picture>
  </a>
</p>

---

<h2 align="center">Open-source customer engagement</h3>

[Dittofeed](https://dittofeed.com) is an omni-channel customer engagement platform. Send broadcasts or create automated user journeys to message users along any channel: email, mobile push notifications, SMS, WhatsApp, Slack, and more. We're an open source, dev-friendly alternative to platforms like OneSignal, Customer.io, and Segment Engage.

## 🔧 Development Build & Deployment (For Team Members)

This repository contains **custom modifications** to the Dittofeed open source codebase. If you need to run your changes locally or deploy them, follow these steps:

### Quick Start for Development

```bash
# Build the custom Dittofeed image
docker build -f packages/lite/Dockerfile -t my-dittofeed:latest .

# Run the application with docker-compose
docker compose -f docker-compose.lite.yaml up -d
```

### What's Different from Open Source

This fork includes the following **custom changes**:

#### 🐛 **Keyed Performed Segment Bug Fix**
- **Issue**: "Keyed performed" segments in event-triggered journeys were not evaluating correctly when subsequent events (e.g., `CHECKED_OUT`) occurred after journey entry (e.g., `ADDED_TO_CART`)
- **Root Cause**: Events with different names weren't being routed to existing keyed workflows for segment re-evaluation
- **Fix**: Enhanced event routing system to signal existing keyed workflows across different event types
- **Files Modified**:
  - `packages/backend-lib/src/journeys.ts` - Added `signalExistingKeyedWorkflows()` function
  - `packages/backend-lib/src/journeys/userWorkflow/lifecycle.ts` - Fixed workflow signaling when workflows already exist

#### 📂 **Files Changed**
```
packages/backend-lib/src/journeys.ts
packages/backend-lib/src/journeys/userWorkflow/lifecycle.ts
```

#### 🔄 **How This Fixes Our Use Case**

**Before (Broken):**
```
User: ADDED_TO_CART (cartId: "123") → Journey starts
Journey: Enters wait-for "checked out" segment
User: CHECKED_OUT (cartId: "123") → Event dropped (name mismatch)
Journey: Times out → Sends reminder ❌
```

**After (Fixed):**
```
User: ADDED_TO_CART (cartId: "123") → Journey starts
Journey: Enters wait-for "checked out" segment
User: CHECKED_OUT (cartId: "123") → Event signaled to existing workflow ✅
Workflow: Receives event → Updates segment → Journey proceeds ✅
```

### Development Workflow

1. **Make your changes** to the codebase
2. **Build the image** with your changes:
   ```bash
   docker build -f packages/lite/Dockerfile -t my-dittofeed:latest .
   ```
3. **Run the application**:
   ```bash
   docker compose -f docker-compose.lite.yaml up -d
   ```
4. **View logs** (if needed):
   ```bash
   docker compose -f docker-compose.lite.yaml logs -f
   ```
5. **Stop the application**:
   ```bash
   docker compose -f docker-compose.lite.yaml down
   ```

### Syncing with Upstream

To pull in updates from the original Dittofeed repository:

```bash
# Add upstream remote (one time setup)
git remote add upstream https://github.com/dittofeed/dittofeed.git

# Fetch upstream changes
git fetch upstream

# Merge upstream changes (be careful with conflicts)
git merge upstream/main
```

**⚠️ Important**: When merging upstream changes, be careful not to overwrite our custom bug fixes!