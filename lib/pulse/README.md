# Pulse - Scheduled Reports System

The Pulse system enables users to automatically generate and send pre-configured reports on scheduled intervals. Users can define multiple pulses, each with its own configuration, schedule, and delivery settings.

## Architecture

The Pulse system consists of:

1. **Database Entities** (`lib/entities.ts`):
   - `PulseConfigEntity`: Stores pulse configuration (name, prompt, schedule, recipient, etc.)
   - `PulseJobEntity`: Represents a single execution of a pulse

2. **PulseManager** (`lib/pulse/manager.ts`):
   - Manages pulse configurations (CRUD operations)
   - Handles config validation and lifecycle

3. **PulseJobScheduler** (`lib/pulse/job.ts`):
   - Handles pulse job execution
   - Integrates with Chatbot to generate reports
   - Manages email delivery
   - Job lifecycle management and cleanup

4. **API Endpoints**:
   - `/api/pulse` - List and create pulse configs
   - `/api/pulse/[configId]` - Get, update, delete specific pulse config
   - `/api/pulse/[configId]/publish` - Manually publish a pulse
   - `/api/pulse/tick` - Check all enabled pulses and publish ones that need to run
   - `/api/pulse/dispatch-ticks` - Dispatch tick calls to all users (multi-tenant)
   - `/api/pulse-job/[jobId]` - Get pulse job details
   - `/api/pulse-job/[jobId]/run` - Execute a pulse job
   - `/api/pulse-job/cleanup` - Clean up stale jobs

## Data Model

### PulseConfig

```typescript
{
  id: string;                    // Unique identifier
  name: string;                  // Display name
  description: string;           // Description of the pulse
  prompt: string;                // Prompt to send to chatbot
  cron: string;                  // Cron expression (e.g., "0 0 * * *" for daily at midnight)
  cronTimezone: string | null;   // IANA timezone for cron scheduling (e.g., "America/New_York")
  enabled: boolean;              // Whether pulse is active
  recipients: string[] | null;   // Email addresses to send report to
  lastRunAt: Date | null;        // Last execution time
  nextRunAt: Date | null;        // Next scheduled execution
  createdAt: Date;
  updatedAt: Date;
}
```

### PulseJob

```typescript
{
  id: string;                    // Unique identifier
  pulseConfigId: string;         // Reference to pulse config
  state: "created" | "running" | "finished";
  result: "success" | "error" | "canceled" | null;
  payload: {                     // Stored data from execution
    messages?: Array<{           // Chatbot conversation
      role: string;
      content: string;
    }>;
    report?: string;             // Generated report content
  } | null;
  error: string | null;          // Error message if failed
  emailSent: boolean;            // Whether email was sent
  emailSentAt: Date | null;      // When email was sent
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

## Usage

### Creating a Pulse Config

```typescript
import { PulseManager } from "@/lib/pulse/manager";
import { getUserDataSource } from "@/lib/entities";

const dataSource = await getUserDataSource();
const pulseManager = new PulseManager({ dataSource });

const config = await pulseManager.createConfig({
  name: "Daily Sales Report",
  description: "Automated daily sales summary",
  prompt: "Generate a sales report for today including total revenue, top products, and key metrics.",
  cron: "0 0 * * *",
  cronTimezone: "America/New_York",
  recipients: ["user@example.com", "manager@example.com"],
  enabled: true
});
```

### Publishing a Pulse Manually

Via API:
```bash
POST /api/pulse/{configId}/publish
```

Via code:
```typescript
import { PulseJobScheduler } from "@/lib/pulse/job";

const jobScheduler = new PulseJobScheduler({ dataSource });
const jobId = await jobScheduler.create({ pulseConfigId: config.id });
const result = await jobScheduler.run({ id: jobId });
```

### Ticking All Scheduled Pulses

To check and publish all pulses that are due to run:

Via API:
```bash
POST /api/pulse/tick
```

Response:
```json
{
  "checked": 5,
  "triggered": 2,
  "skipped": 3,
  "triggeredConfigs": ["uuid-1", "uuid-2"]
}
```

This endpoint:
- Checks all enabled pulse configs
- Publishes pulses where `nextRunAt` is null or in the past
- Updates `nextRunAt` for published pulses based on their schedule
- Returns summary of checked, triggered, and skipped pulses

### Dispatching Ticks for All Users (Multi-Tenant)

For multi-tenant deployments, use the dispatch-ticks endpoint to tick pulses for all users:

Via API:
```bash
POST /api/pulse/dispatch-ticks
```

Response:
```json
{
  "total": 3,
  "successful": 2,
  "failed": 1,
  "hostingEnabled": true
}
```

This endpoint:
- **If hosting is enabled**: 
  - Gets all users from the hosting database
  - Mints a JWT token for each user using `SUPABASE_JWT_SECRET`
  - Calls `/api/pulse/tick` with each user's token in parallel
  - Returns summary statistics
- **If hosting is disabled**:
  - Simply calls `/api/pulse/tick` once
  - Returns summary statistics

### Getting Pulse Job Details

```typescript
const job = await jobScheduler.get({ id: jobId });
console.log(job.state);      // "finished"
console.log(job.result);     // "success"
console.log(job.payload);    // { messages: [...], report: "..." }
console.log(job.emailSent);  // true
```

### Listing All Pulse Configs

```typescript
const configs = await pulseManager.listConfigs();
```

### Updating a Pulse Config

```typescript
await pulseManager.updateConfig({
  id: config.id,
  enabled: false,
  cron: "0 0 * * 0"  // nextRunAt is automatically recalculated when cron properties change
});
```

### Updating Next Run Time

To manually update the next run time based on the current cron expression:

```typescript
await pulseManager.updateNextRunTime({
  id: config.id
});
```

### Deleting a Pulse Config

```typescript
await pulseManager.deleteConfig({ id: config.id });
```

## Job Lifecycle

1. **Creation**: 
   - Job is created with state "created"
   - Any existing unfinished jobs for the same config are canceled

2. **Execution**:
   - State changes to "running"
   - Chatbot is invoked with the configured prompt
   - Messages and report are collected
   - State changes to "finished" with result "success"

3. **Email Delivery**:
   - If `recipients` are configured, emails are sent
   - Report is converted to HTML and sent to all recipients
   - Job is updated with `emailSent: true`

4. **Error Handling**:
   - If execution fails, state is "finished" with result "error"
   - Error message is stored in `job.error`
   - No email is sent

## Email Integration

The `sendEmail` method in PulseManager is currently a placeholder. To integrate with an actual email service:

### Option 1: SendGrid

```typescript
import sgMail from '@sendgrid/mail';

private async sendEmail(params: SendEmailParams): Promise<void> {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  
  await sgMail.send({
    to: params.to,
    from: process.env.SENDGRID_FROM_EMAIL!,
    subject: params.subject,
    text: params.textContent,
    html: params.htmlContent,
  });
}
```

### Option 2: AWS SES

```typescript
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

private async sendEmail(params: SendEmailParams): Promise<void> {
  const client = new SESClient({ region: process.env.AWS_REGION });
  
  await client.send(new SendEmailCommand({
      Source: config.email.sender,
    Destination: { ToAddresses: [params.to] },
    Message: {
      Subject: { Data: params.subject },
      Body: {
        Text: { Data: params.textContent },
        Html: { Data: params.htmlContent },
      },
    },
  }));
}
```

### Option 3: Nodemailer (SMTP)

```typescript
import nodemailer from 'nodemailer';

private async sendEmail(params: SendEmailParams): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: params.to,
    subject: params.subject,
    text: params.textContent,
    html: params.htmlContent,
  });
}
```

## Scheduling

The system includes scheduling endpoints for both single-tenant and multi-tenant deployments:

- `/api/pulse/tick` - Check and publish pulses for the current user
- `/api/pulse/dispatch-ticks` - Dispatch ticks for all users (multi-tenant)

### Automatic Ticking

**Single-Tenant (Hosting Disabled):**

Use `/api/pulse/tick` to check all pulses in your single database.

**Multi-Tenant (Hosting Enabled):**

Use `/api/pulse/dispatch-ticks` to:
- Get all users from the hosting database
- Mint JWT tokens for each user using `SUPABASE_JWT_SECRET`
- Call `/api/pulse/tick` with each user's context
- Collect results from all users

To set up automatic scheduling, you can call the appropriate endpoint periodically:

### Option 1: Cron Job (Recommended)

Create a cron job that calls the appropriate endpoint regularly:

**Single-Tenant:**
```bash
# Check every hour
0 * * * * curl -X POST https://your-app.com/api/pulse/tick
```

**Multi-Tenant:**
```bash
# Dispatch to all users every hour
0 * * * * curl -X POST https://your-app.com/api/pulse/dispatch-ticks
```

### Option 2: Background Job Queue (Production)

Use a job queue like node-cron for robust scheduling:

**Single-Tenant:**
```typescript
import cron from "node-cron";

// Check every hour
cron.schedule("0 * * * *", async () => {
  await fetch("https://your-app.com/api/pulse/tick", {
    method: "POST"
  });
});
```

**Multi-Tenant:**
```typescript
import cron from "node-cron";

// Dispatch to all users every hour
cron.schedule("0 * * * *", async () => {
  await fetch("https://your-app.com/api/pulse/dispatch-ticks", {
    method: "POST"
  });
});
```

### Option 3: External Service

Use an external service like:
- Vercel Cron (for Vercel deployments)
- AWS EventBridge
- Google Cloud Scheduler
- EasyCron or similar services

Configure them to POST to the appropriate endpoint at your desired frequency (e.g., hourly):
- Single-Tenant: `/api/pulse/tick`
- Multi-Tenant: `/api/pulse/dispatch-ticks`

### Cron Expression Format

The system uses the `cron-parser` library to handle scheduling with standard cron expressions.

**Cron Format:** `minute hour day-of-month month day-of-week`

**Common Examples:**
- `"0 * * * *"` - Every hour at minute 0
- `"0 0 * * *"` - Daily at midnight
- `"0 0 * * 0"` - Weekly on Sunday at midnight
- `"0 0 1 * *"` - Monthly on the 1st at midnight
- `"0 9 * * 1-5"` - At 9:00 AM on weekdays
- `"*/15 * * * *"` - Every 15 minutes
- `"0 0,12 * * *"` - At midnight and noon every day
- `"0 8 1 * *"` - At 8:00 AM on the 1st of every month
- `"30 2 * * *"` - Daily at 2:30 AM

**Timezone Support:**

The `cronTimezone` field allows you to specify an IANA timezone (e.g., "America/New_York") for proper scheduling across timezones. The cron expression will be evaluated in the specified timezone, and `cron-parser` will handle the conversion to UTC for execution.

## Cleanup

The system includes a cleanup endpoint to cancel stale jobs:

```bash
POST /api/pulse-job/cleanup
```

This should be called periodically (e.g., daily) to clean up jobs that have been stuck in "created" or "running" state for too long.

## Testing

Example test for creating and running a pulse:

```typescript
import { describe, it, expect } from 'vitest';
import { PulseManager } from '@/lib/pulse/manager';
import { PulseJobScheduler } from '@/lib/pulse/job';
import { getUserDataSource } from '@/lib/entities';

describe('Pulse System', () => {
  it('should create and run a pulse job', async () => {
    const dataSource = await getUserDataSource();
    const pulseManager = new PulseManager({ dataSource });
    const jobScheduler = new PulseJobScheduler({ dataSource });
    
    // Create config
    const config = await pulseManager.createConfig({
      name: 'Test Pulse',
      description: 'Test description',
      prompt: 'Generate a test report',
      cron: '0 0 * * *',
      recipients: ['test@example.com']
    });
    
    // Create job
    const jobId = await jobScheduler.create({ pulseConfigId: config.id });
    
    // Run job
    const result = await jobScheduler.run({ id: jobId });
    
    expect(result.job.state).toBe('finished');
    expect(result.job.result).toBe('success');
    expect(result.job.payload?.report).toBeTruthy();
  });
});
```

## API Examples

### Create a Pulse Config

```bash
POST /api/pulse
Content-Type: application/json

{
  "name": "Weekly Revenue Report",
  "description": "Weekly summary of revenue metrics",
  "prompt": "Generate a weekly revenue report with trends and insights",
  "cron": "0 0 * * 0",
  "cronTimezone": "America/New_York",
  "recipients": ["ceo@company.com", "reports@company.com"],
  "enabled": true
}
```

### List All Pulse Configs

```bash
GET /api/pulse
```

### Get a Specific Config

```bash
GET /api/pulse/{configId}
```

### Update a Config

```bash
PUT /api/pulse/{configId}
Content-Type: application/json

{
  "enabled": false
}
```

### Delete a Config

```bash
DELETE /api/pulse/{configId}
```

### Publish a Pulse

```bash
POST /api/pulse/{configId}/publish
```

### Dispatch Ticks (Multi-Tenant)

```bash
POST /api/pulse/dispatch-ticks
```

Dispatches pulse ticks to all users in a multi-tenant setup. Mints JWT tokens for each user to make authenticated calls. If hosting is disabled, calls tick once.

Response includes:
- `total`: Total number of tick operations
- `successful`: Number of successful ticks
- `failed`: Number of failed ticks
- `hostingEnabled`: Whether hosting is enabled
- `results`: Array of results per user (if hosting enabled) or single result

**Environment Variables Required (for multi-tenant):**
- `SUPABASE_JWT_SECRET` - Supabase JWT secret (used to mint JWT tokens for each user)

### Get Job Status

```bash
GET /api/pulse-job/{jobId}
```

### Cleanup Stale Jobs

```bash
POST /api/pulse-job/cleanup
```

## Future Enhancements

- **Built-in Scheduler**: Add automatic scheduling based on cron expressions
- **Multiple Recipients**: Support sending to multiple email addresses
- **Report Templates**: Add customizable report templates
- **Attachments**: Support adding charts/visualizations as attachments
- **Delivery Channels**: Add Slack, Teams, SMS delivery options
- **Retry Logic**: Implement retry mechanism for failed jobs
- **Job History**: Add UI for viewing job history and reports
- **Schedule Visualization**: Show upcoming pulse executions
- **Test Mode**: Preview reports without sending emails

