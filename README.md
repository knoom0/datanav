# DataNav

<!-- markdownlint-disable MD033 MD001 -->
<div align="center">

  <img src="public/logo.png" alt="DataNav Logo" width="200" />



### Your Personal AI Data Analyst

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

https://github.com/user-attachments/assets/c448320a-b52b-4270-a4f8-660e7c5a91ed

</div>
<!-- markdownlint-enable MD033 MD001 -->

## Introduction

DataNav lets you host an AI data analyst that aggregates data from your everyday services such as Google Calendar, Gmail, or your financial service providers and generates data reports upon your requests. It empowers every user to have their own data lake and AI data analyst on which they have full control.

**Start by asking a data question** like:

- "How many meetings did I have last week?"
- "Show me my top email senders this month"
- "What's my spending trend over the past quarter?"

### Open Source & Privacy First

DataNav is an open-source project released under the **MIT license**. Each user gets their own dedicated database and has complete control over the data being connected to DataNav. Your data stays yours—no sharing, no third-party access unless you explicitly configure it.

**Key Features:**

- 🤖 AI-powered data analysis and report generation
- 🔌 Connect to multiple data sources (Google Calendar, Gmail, and more)
- 🗄️ Personal data lake—your own database for all your data
- 🔒 Complete data privacy and control
- 🎨 Interactive data visualizations
- 📊 Natural language querying

---

## Quickstart

### Prerequisites

Before running DataNav, you'll need to obtain Google OAuth credentials for data connection:

#### Get Google OAuth Client ID and Secret

DataNav uses Google OAuth to connect to services like Gmail and Google Calendar. You'll need to create OAuth credentials:

**Ask AI for help**: [How can I get Google OAuth client ID?](https://chat.openai.com/?q=How%20can%20I%20get%20Google%20OAuth%20client%20ID%3F)

You also need to enable the following Google APIs in your Google Cloud Console project for each data connector:

| Data Connector | Google API Required | API Identifier |
|----------------|---------------------|----------------|
| Gmail | Gmail API | `gmail.googleapis.com` |
| Google Calendar | Google Calendar API | `calendar-json.googleapis.com` |
| YouTube Activity | YouTube Data API v3 | `youtube.googleapis.com` |

To enable these APIs:

1. Go to the [Google Cloud Console API Library](https://console.cloud.google.com/apis/library)
2. Select your project
3. Search for each API listed above
4. Click "Enable" for the APIs you want to use

---

### Running Locally

Running DataNav locally is the fastest way to get started:

1. **Clone the repository**:

   ```bash
   git clone https://github.com/yourusername/datanav.git
   cd datanav
   ```

2. **Set up environment variables**:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your configuration (see [Configuration](#configuration--environment-variables) section below).

3. **Start the database and services**:

   ```bash
   docker compose up -d
   ```

   This will start a PostgreSQL database in Docker.

4. **Install dependencies**:

   ```bash
   npm install
   ```

5. **Start the development server**:

   ```bash
   npm run dev
   ```

6. **Open your browser**:

   Navigate to [http://localhost:3000](http://localhost:3000) and start using DataNav!

---

### Running a Hosted Version

To deploy DataNav for multiple users with authentication:

#### 1. Enable Hosting Mode

Set the hosting mode in your environment:

```bash
DATANAV_HOSTING_ENABLED=true
```

#### 2. Configure Supabase Authentication

DataNav uses Supabase for user authentication in hosted mode.

**Ask AI for help**: [How do I set up Supabase authentication and get API keys?](https://chat.openai.com/?q=How%20do%20I%20set%20up%20Supabase%20authentication%20and%20get%20API%20keys%3F)

**Add Supabase credentials to your environment**:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

#### 3. Set Up a Hosted PostgreSQL Database

For production, use a hosted PostgreSQL service like:

- [Supabase Database](https://supabase.com/)
- [AWS RDS](https://aws.amazon.com/rds/)
- [Google Cloud SQL](https://cloud.google.com/sql)
- [DigitalOcean Managed Databases](https://www.digitalocean.com/products/managed-databases)

Update your database environment variables:

```bash
DATANAV_DATABASE_HOST=your-database-host
DATANAV_DATABASE_PORT=5432
DATANAV_DATABASE_USERNAME=your-username
DATANAV_DATABASE_PASSWORD=your-password
DATANAV_DATABASE_DATABASE=your-database-name
DATANAV_DATABASE_SSL=true  # If your database requires SSL/TLS connection
```

#### 4. Deploy Your Application

Deploy to your preferred hosting platform:

- [Vercel](https://vercel.com) (recommended for Next.js)
- [Railway](https://railway.app)
- [Render](https://render.com)
- [AWS](https://aws.amazon.com/)
- [Google Cloud](https://cloud.google.com/)

Make sure to set all environment variables in your hosting platform's environment configuration.

---

## Configuration & Environment Variables

DataNav can be configured through the `datanav.config.ts` file and environment variables. Keep in mind that nvironment variables always supersede over `datanav.config.ts` values.

### Configuration File (`datanav.config.ts`)

The `datanav.config.ts` file contains the core configuration:

```typescript
export const config = {
  agent: {
    // AI agent configuration
    codeAgent: {
      model: "gpt-5",  // Model for code generation agent
    },
    gEval: {
      model: "gpt-4.1",  // Model for evaluation tasks
    },
    reportingAgent: {
      model: "gpt-5",  // Model for report generation
      providerOptions: {
        openai: {
          reasoningSummary: "auto",
        }
      }
    },
    model: "gpt-4.1",  // Default model for general agents
  },

  database: {
    type: "postgres",  // Database type (currently only postgres is supported)
    ssl: {
      rejectUnauthorized: false  // SSL configuration for database connections
    }
  },

  email: {
    sender: "noreply@datanav.app",  // Email address for sending Pulse reports
    senderName: "DataNav"  // Display name for email sender
  },

  hosting: {
    // Hosting configuration (enable multi-user mode)
  },

  packages: {
    // UI packages available for data visualization components
    // These are used by the code generation agent to create visualizations
  },
};
```

### Environment Variables

Create a `.env.local` file with the following variables:

#### AI Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key for AI-powered features | ✅ Yes | - |

#### Database Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATANAV_DATABASE_HOST` | PostgreSQL database host | ✅ Yes | `localhost` |
| `DATANAV_DATABASE_PORT` | PostgreSQL database port | No | `5432` |
| `DATANAV_DATABASE_USERNAME` | Database username | ✅ Yes | - |
| `DATANAV_DATABASE_PASSWORD` | Database password | ✅ Yes | - |
| `DATANAV_DATABASE_DATABASE` | Database name | ✅ Yes | - |
| `DATANAV_DATABASE_TYPE` | Database type (only `postgres` supported) | No | `postgres` |
| `DATANAV_DATABASE_SSL` | Enable SSL for database connection | No | `false` |

#### Data Connectors

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | ✅ Yes | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | ✅ Yes | - |

#### Email Configuration (for Pulse Reports)

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATANAV_EMAIL_SENDER` | Email address to send reports from | No | `noreply@datanav.app` |
| `DATANAV_EMAIL_SENDER_NAME` | Name to display as sender | No | `DataNav` |
| `AWS_ACCESS_KEY_ID` | AWS access key for SES email service | ✅ Yes (for Pulse) | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for SES email service | ✅ Yes (for Pulse) | - |
| `AWS_REGION` | AWS region for SES | No | `us-east-1` |

#### Hosting Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATANAV_HOSTING_ENABLED` | Enable multi-user hosting mode | No | `false` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ Yes (if hosting enabled) | - |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | ✅ Yes (if hosting enabled) | - |

### Example `.env.local`

```bash
# AI Configuration
OPENAI_API_KEY=sk-your-openai-api-key

# Database Configuration
DATANAV_DATABASE_HOST=localhost
DATANAV_DATABASE_PORT=5432
DATANAV_DATABASE_USERNAME=datanav_user
DATANAV_DATABASE_PASSWORD=your-secure-password
DATANAV_DATABASE_DATABASE=datanav

# Google OAuth (for data connectors)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Email Configuration (optional - for Pulse scheduled reports)
# DATANAV_EMAIL_SENDER=noreply@yourdomain.com
# DATANAV_EMAIL_SENDER_NAME=Your Company Name
# AWS_ACCESS_KEY_ID=your-aws-access-key
# AWS_SECRET_ACCESS_KEY=your-aws-secret-key
# AWS_REGION=us-east-1

# Hosting Mode (optional - set to true for multi-user mode)
DATANAV_HOSTING_ENABLED=false

# Supabase (only required if DATANAV_HOSTING_ENABLED=true)
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Project Structure

```text
datanav/
├── app/                    # Next.js App Router pages and API routes
│   ├── (console)/         # Console UI (chat, data, components)
│   ├── (system)/          # System pages (auth, preview)
│   └── api/               # API endpoints
├── components/            # React components
├── lib/                   # Core library code
│   ├── agent/            # AI agent implementations
│   ├── data/             # Data connectors and loaders
│   ├── hosting/          # Multi-user hosting utilities
│   ├── meta-agent/       # Meta-agent orchestration
│   ├── ui-catalog/       # UI component catalog
│   └── ui-kit/           # UI component generation
├── datanav.config.ts     # Main configuration file
└── docker-compose.yml    # Docker services configuration
```

---

## Contributing

**Interested in contributing?**

Please send an email to [moonk@datanav.app](mailto:moonk@datanav.app) to discuss how you can contribute. Whether it's:

- 🐛 Bug fixes
- ✨ New features
- 📝 Documentation improvements
- 🔌 New data connectors
- 🎨 UI/UX enhancements

I'd love to hear from you!

---

## License

DataNav is released under the [MIT License](LICENSE). You're free to use, modify, and distribute this software as you see fit.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/datanav/issues)
- **Email**: [moonk@datanav.app](mailto:moonk@datanav.app)

---

### Built with ❤️ for users who want control over their data
