# Football Booking System

A Next.js application for booking football (soccer) fields with Google Sheets as the backend database.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: CSS Modules / Global CSS
- **State Management**: React Server Components & Client Components
- **Data Storage**: Google Sheets (via Google Sheets API or Google Apps Script)
- **Authentication**: Custom token-based admin auth (cookie-based)
- **Real-time Notifications**: Telegram Bot integration
- **Validation**: Custom validation utilities
- **Rate Limiting**: IP-based rate limiting for public endpoints
- **Testing**: Vitest
- **Linting**: ESLint with Next.js config

## Key Directories & Files

```
/app - Next.js App Router
  /app/layout.tsx - Root layout with metadata and font setup
  /app/page.tsx - Home page (contains BookingForm)
  /app/admin/ - Admin dashboard routes
  /app/api/ - API routes (bookings, auth, telegram, etc.)
  /app/api/bookings/route.ts - Main booking API (GET list, POST create)
  /app/api/auth/ - Login/logout endpoints
  /app/api/telegram/ - Telegram webhook handler
  /app/api/settings/ - Settings endpoint
  /app/api/availability/ - Check availability endpoint
  /app/lib/ - Utility modules
    /auth.ts - Authentication token handling
    /sheets.ts - Google Sheets data access layer
    /validation.ts - Input validation schemas
    /rate-limit.ts - IP-based rate limiting
    /telegram.ts - Telegram bot notifications
    /settings.ts - Application settings from sheet
    /booking.ts - Booking domain logic
    /types.ts - TypeScript interfaces
    /constants.ts - Application constants
    /time.ts - Time utilities
  /components/ - React components
    /BookingPage.tsx - Main booking form
    /AdminDashboard.tsx - Admin dashboard
    /AdminLogin.tsx - Admin login
    /CalendarPicker.tsx - Date selection component
/lib/ - Utility modules (see above)
/public/ - Static assets
```

## Environment Variables

Required environment variables (create `.env.local` based on `.env.example`):

```
# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google Sheets Integration (either direct API or Apps Script)
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_SERVICE_ACCOUNT_email=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key_with_newlines

# OR Google Apps Script deployment
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
GOOGLE_APPS_SCRIPT_SECRET=your_apps_script_secret

# Authentication
ADMIN_LOGIN=admin_username
ADMIN_PASSWORD=admin_password
AUTH_SECRET=32+_character_random_string_for_token_signing

# Telegram Bot (for notifications)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=default_chat_id_for_notifications

# Rate limiting (requests per window per IP)
RATE_LIMIT_WINDOW_MS=600000  # 10 minutes
RATE_LIMIT_MAX_REQUESTS=10

# Optional: Mock data (when Google Sheets not configured)
# Set to "true" to use mock data instead of connecting to sheets
USE_MOCK_DATA=false
```

## Architecture Overview

### Data Flow
1. **Frontend** (React components in `/components`) -> **API Routes** (`/app/api/`)
2. **API Routes** -> **Service Layer** (`/lib/` modules)
3. **Service Layer** -> **Data Storage** (Google Sheets via direct API or Apps Script)

### Key Components
- **Authentication**: Admin login via `/app/api/auth/login` sets `football_admin` cookie
- **Booking Flow**: 
  - User fills form in `BookingPage` component
  - Form submits to `/app/api/bookings` (POST)
  - API validates input, checks availability, creates booking in Google Sheets
  - On success, sends Telegram notification to admins
- **Admin Dashboard**: 
  - Protected route `/app/admin` (checks auth cookie)
  - Fetches bookings from `/app/api/bookings` (GET)
  - Allows updating booking status, payment, etc.

### Data Model
Booking request stored in Google Sheets with columns matching `HEADERS` in `lib/sheets.ts`.
Key fields: ID, Date, Time, Duration, Format, Sector, Prices, Customer Info, Status, Payment Info.

### Security
- Admin routes protected by cookie verification (`verifyAuthToken`)
- Public booking endpoint has IP-based rate limiting
- Input validation via Zod-like schema in `lib/validation.ts`
- Environment variables validated at runtime

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` with required variables (see above)

3. Run development server:
   ```bash
   npm run dev
   ```

4. Run tests:
   ```bash
   npm test
   ```

5. Run tests in watch mode:
   ```bash
   npm run test:watch
   ```

6. Run E2E tests:
   ```bash
   npm run test:e2e
   ```

## Available Scripts

- `npm dev` - Start development server
- `npm build` - Build for production
- `npm start` - Start production server
- `npm lint` - Run ESLint
- `npm test` - Run Vitest tests
- `npm run test:watch` - Run Vitest in watch mode
- `npm run test:e2e` - Run end-to-end tests

## Claude Code Specific Usage

### Common Commands for Claude Code
When working with this codebase using Claude Code, these commands are particularly useful:

- **Development**: Use `/run dev` to start the development server
- **Testing**: 
  - `/run test` - Run all tests
  - `/run test:watch` - Run tests in watch mode (useful during development)
  - To run a specific test: `npx vitest run test/file.test.ts -t "test name"`
- **Linting**: `/run lint` to check code quality
- **Building**: `/run build` for production build
- **Database Operations**: The application automatically handles Google Sheets initialization via `ensureSheet()` in `lib/sheets.ts`

### Using Claude Code Skills
This project benefits from several Claude Code skills:

- **`/skill init`**: If you need to create or update CLAUDE.md guidance
- **`/skill loop`**: For repetitive tasks like running tests multiple times or batch processing
- **`/skill update-config`**: To modify Claude Code settings if needed (e.g., adjust permission prompts)
- **`/skill dataviz`**: If you need to create visualizations of booking data or analytics

### Agent Usage
For complex tasks, consider using specialized agents:
- **`/agent Plan`**: For architectural planning before implementing features
- **`/agent Explore`**: For broad code searches when you need to understand patterns
- **`/agent general-purpose`**: For most implementation tasks

### File Operation Tips
- When creating new components, place them in `/components` and follow the existing patterns
- API routes should be added to `/app/api/` following the Route Handler pattern (`route.ts` files)
- Utility functions belong in `/lib/` with appropriate separation of concerns
- Always run tests after making changes to ensure functionality is preserved

### Testing Best Practices
- Unit tests go alongside the files they test or in `__tests__` directories
- Use Vitest's `describe`, `it`, `expect` patterns
- Mock external dependencies (Google APIs, etc.) using Vitest's mocking capabilities
- Test both success and error cases for API endpoints

## Important Notes

1. **Google Sheets Setup**:
   - Create a Google Sheet with a worksheet named "Брони" (Bookings)
   - The first row must contain headers exactly as defined in `HEADERS` constant in `lib/sheets.ts`
   - Share the sheet with the service account email (if using direct API) or deploy as Apps Script webapp

2. **Authentication**:
   - Admin login credentials are set via `ADMIN_LOGIN` and `ADMIN_PASSWORD`
   - Authentication uses HMAC-signed tokens with expiration (12 hours)
   - The `AUTH_SECRET` must be at least 32 characters for security

3. **Rate Limiting**:
   - Public endpoints (booking creation) are limited by IP address
   - Default: 10 requests per 10 minutes per IP

4. **Telegram Notifications**:
   - Requires a Telegram bot token and at least one chat ID
   - Notifications sent for new bookings and status changes

5. **Mock Data Mode**:
   - Set `USE_MOCK_DATA=true` to use local mock data instead of Google Sheets
   - Useful for development without Google API setup

6. **Database Migrations**:
   - The `ensureSheet()` function in `lib/sheets.ts` creates the "Брони" sheet with headers if missing
   - Runs automatically on startup in production

## Code Style

- Follows ESLint rules from `eslint-config-next`
- Uses TypeScript strict mode
- Components are in `/components` directory
- API routes use Next.js Route Handlers (`app/api/*/route.ts`)
- Server components by default, client components marked with `'use client'`

## Troubleshooting

- **Google Sheets Authentication Errors**: Verify service account has access to the sheet and API is enabled
- **Telegram Notifications Failing**: Check bot token and chat ID validity
- **Rate Limiting Issues**: Clear browser cookies or wait for window to reset
- **Authentication Problems**: Ensure `AUTH_SECRET` is at least 32 characters

## Folder Structure Summary

```
football-booking/
├── app/                     # Next.js App Router
│   ├── api/                 # API endpoints
│   ├── admin/               # Admin dashboard
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
├── components/              # Reusable React components
├── lib/                     # Utility modules (auth, sheets, validation, etc.)
├── public/                  # Static assets
├── .env.local               # Environment variables (not in repo)
├── .eslintrc.json           # ESLint configuration
├── next.config.js           # Next.js configuration
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## Claude Code Optimization Tips

1. **Context Management**: This codebase is well-organized, making it easy for Claude to understand the context. When asking for changes, specify the exact file path.

2. **Incremental Development**: Use the `/loop` skill for iterative development processes like:
   - Fixing linting errors across multiple files
   - Adding tests for a series of similar components
   - Refactoring similar utility functions

3. **Progress Tracking**: For larger features, consider using the TodoWrite tool to track implementation progress, especially when working across multiple files (e.g., adding a new feature that requires UI, API, and database changes).

4. **Error Diagnosis**: When debugging, use the Explore agent to search for error messages or related code patterns across the codebase.

5. **Type Safety**: Leverage TypeScript's strict mode - when making changes, pay attention to type errors as they often indicate incomplete implementations.