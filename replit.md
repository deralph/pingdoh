# Pingdoh2 - AI-Powered Audition Platform

## Overview

Pingdoh2 is a full-stack web application that provides an AI-powered audition platform for voice recordings. The platform allows contestants to record and submit audio auditions, while administrators can manage submissions, close audition portals, and trigger AI-based scoring. The application features a clean, modern UI with real-time status updates and leaderboard functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Tooling**
- React with Vite as the build tool and development server
- TypeScript for type safety across the application
- Wouter for client-side routing (lightweight alternative to React Router)

**UI Component Library**
- Radix UI primitives for accessible, unstyled components
- shadcn/ui design system with "new-york" style variant
- TailwindCSS for styling with CSS variables for theming
- Custom color scheme supporting light/dark modes

**State Management**
- TanStack Query (React Query) for server state management and caching
- React Context API for authentication state (AuthContext)
- Local component state for UI interactions

**Key Features Implementation**
- Audio recording using browser's MediaRecorder API
- File upload handling with multipart/form-data
- Real-time status tracking and leaderboard updates
- Responsive design with mobile-first approach

### Backend Architecture

**Server Framework**
- Express.js as the HTTP server
- TypeScript with ESM module support
- Development mode uses tsx for hot reloading
- Production builds with esbuild for optimization

**Storage Strategy**
- In-memory storage implementation (MemStorage class)
- Interface-based design (IStorage) allowing easy migration to persistent databases
- File system storage for uploaded audio files in `/uploads` directory
- Session data stored in memory

**API Structure**
- RESTful endpoints under `/api` prefix
- Multer middleware for handling audio file uploads (10MB limit)
- CORS enabled for cross-origin requests
- Request/response logging middleware

**Key Endpoints**
- `POST /api/auth/login` - Email-based user identification
- `POST /api/recordings` - Audio file upload and submission
- `GET /api/recordings` - Admin-only endpoint for all submissions
- `GET /api/status` - User-specific audition status
- `GET /api/leaderboard` - Ranked list of scored submissions
- `GET /api/portal-status` - Current portal open/closed state
- `POST /api/close-portal` - Admin action to close portal and trigger AI scoring

### Data Schema

**User Model**
- Email-based identification (no passwords)
- Admin flag for role-based access
- UUID-based unique identifiers

**Recording Model**
- Links to user via email
- Audio file URL reference
- Status tracking: pending → under_review → scored → closed
- AI score (nullable, populated after portal closure)
- Timestamp for submission tracking

**Portal Status**
- Simple boolean flag controlling submission availability
- Triggers AI scoring simulation when closed

### Authentication & Authorization

**Simple Email-Based Auth**
- No password requirement - identification only
- User sessions managed via localStorage
- Admin user seeded on application startup (admin@pingdoh2.com)
- Role-based UI rendering (admin vs. user dashboards)

**Session Management**
- Client-side session persistence in localStorage
- No server-side session validation (simple demonstration app)
- Auth context provides login/logout functionality

### File Handling

**Audio Upload**
- Multer configured to accept audio MIME types only
- Files stored in `/uploads` directory
- File size limit: 10MB
- Served statically via Express middleware

**Recording Workflow**
1. Browser captures audio via MediaRecorder API
2. Audio blob converted to File object
3. Uploaded via multipart/form-data
4. Server stores file and creates recording record
5. File URL returned for playback

### AI Scoring Simulation

**Trigger Mechanism**
- Activated when admin closes the audition portal
- Automatically processes all pending recordings

**Scoring Logic**
- Currently generates random scores (0-100) for demonstration
- Updates all recording statuses to "scored"
- Scores stored in recording records for leaderboard ranking

**Extensibility**
- Designed to be replaced with actual AI/ML scoring service
- Interface allows easy integration with external APIs

### Development Workflow

**Vite Integration**
- Custom Vite setup with middleware mode
- HMR (Hot Module Replacement) connected to Express server
- Development plugins for error overlay and debugging
- Production builds output to `/dist/public`

**Build Process**
- Frontend: Vite builds React app to static files
- Backend: esbuild bundles Express server to `/dist`
- Separate entry points for dev and production modes

**Path Aliases**
- `@/*` → client/src/*
- `@shared/*` → shared/*
- `@assets/*` → attached_assets/*

## External Dependencies

### Database
- Currently using in-memory storage (MemStorage)
- Drizzle ORM configured for PostgreSQL migration path
- Neon serverless PostgreSQL adapter included
- Schema defined in `shared/schema.ts` using Zod validators

### UI Component Dependencies
- Radix UI component primitives for accessible interactions
- shadcn/ui configuration with custom theme
- Lucide React for iconography
- date-fns for date formatting

### Media Handling
- Browser MediaRecorder API for audio capture
- Multer for server-side file upload processing
- No external media processing services currently integrated

### Build & Development Tools
- Vite with React plugin
- Replit-specific plugins (cartographer, dev-banner, runtime-error-modal)
- PostCSS with Tailwind and Autoprefixer
- TypeScript for type checking

### Form & Validation
- React Hook Form with Zod resolvers
- Zod for schema validation (shared between client/server)
- drizzle-zod for database schema validation

### Potential Migration Path
The application is structured to easily migrate from in-memory storage to PostgreSQL using:
- Drizzle ORM already configured
- Neon serverless PostgreSQL connection ready
- Schema definitions prepared in Zod format
- IStorage interface allows swapping implementations without changing business logic