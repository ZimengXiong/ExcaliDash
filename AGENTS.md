# ExcaliDash Developer Guide

## What is ExcaliDash?

ExcaliDash is a full-stack dashboard application for managing and organizing [Excalidraw](https://excalidraw.com) drawings. It provides a interface for creating, organizing, and collaborating on diagrams with features like collections, real-time collaboration, file import/export, and bulk operations.

## Project Overview

### Core Features

- **Drawing Management**: Create, edit, and organize Excalidraw drawings
- **Collections**: Organize drawings into folders/categories
- **Real-time Collaboration**: Multiple users can edit drawings simultaneously
- **Import/Export**: Support for .excalidraw and .json file formats
- **Bulk Operations**: Multi-select drawings for delete, duplicate, and move operations
- **Search & Sort**: Find drawings by name with sorting by name, created date, or modified date
- **Trash System**: Soft delete with permanent delete option
- **Drag & Drop**: Intuitive file dragging and drawing reordering
- **Dark/Light Theme**: Automatic theme detection with manual toggle

### Tech Stack

**Frontend:**

- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Excalidraw (drawing canvas)
- Socket.io Client (real-time features)
- React Router (navigation)
- Lucide React (icons)

**Backend:**

- Node.js + Express
- TypeScript
- Prisma ORM
- SQLite database
- Socket.io (real-time server)

**Infrastructure:**

- Docker (containerization)
- Docker Compose (multi-container orchestration)

## Project Structure

```
ExcaliDash/
├── README.md                 # Project overview
├── AGENTS.md                 # This file - developer guide
├── DOCKER.md                 # Docker documentation
├── .gitignore               # Git ignore rules
├── .dockerignore            # Docker ignore rules
├── docker-compose.yml       # Production Docker setup
├── docker-compose.prod.yml  # Additional production config
├── publish-docker.sh        # Docker deployment script
│
├── backend/                 # Node.js/Express backend
│   ├── src/
│   │   ├── index.ts         # Main server file
│   │   └── generated/       # Prisma generated client
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   ├── migrations/      # Database migrations
│   │   └── dev.db          # SQLite database (development)
│   ├── package.json         # Backend dependencies
│   ├── Dockerfile          # Backend container config
│   ├── .env.example        # Environment variables template
│   └── docker-entrypoint.sh # Container startup script
│
└── frontend/               # React frontend application
    ├── src/
    │   ├── components/     # Reusable UI components
    │   ├── pages/         # Route components
    │   ├── hooks/         # Custom React hooks
    │   ├── context/       # React context providers
    │   ├── types/         # TypeScript type definitions
    │   ├── utils/         # Utility functions
    │   ├── api/           # API client functions
    │   └── assets/        # Static assets
    ├── public/            # Public assets
    ├── package.json       # Frontend dependencies
    ├── Dockerfile         # Frontend container config
    ├── vite.config.ts     # Vite configuration
    ├── tailwind.config.js # Tailwind CSS configuration
    └── nginx.conf         # Nginx configuration for production
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for containerized development)
- Git

### Development Setup

#### Option 1: Local Development (Recommended)

1. **Install Backend Dependencies**

   ```bash
   cd backend
   npm install
   ```

2. **Install Frontend Dependencies**

   ```bash
   cd ../frontend
   npm install
   ```

3. **Setup Environment Variables**

   ```bash
   cd ../backend
   cp .env.example .env
   # Edit .env if needed
   ```

4. **Initialize Database**

   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Start Backend Development Server**

   ```bash
   cd backend
   npm run dev
   # Server runs on http://localhost:8000
   ```

6. **Start Frontend Development Server** (in a new terminal)
   ```bash
   cd frontend
   npm run dev
   # Frontend runs on http://localhost:5173
   ```

### Environment Variables

**Backend (.env):**

```bash
DATABASE_URL="file:./dev.db"
PORT=8000
NODE_ENV=development
```

**Frontend (.env.example):**

```bash
VITE_API_URL=http://localhost:8000
```

## Making Changes

### Development Workflow

1. **Create a Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**

   - Follow the existing code style and patterns
   - Add TypeScript types for new features
   - Update database schema if needed (see Database section)

3. **Test Your Changes**

   - Test both locally and with Docker
   - Check that existing functionality still works

4. **Commit and Push**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   git push origin feature/your-feature-name
   ```

### Code Style and Standards

- **TypeScript**: Use strict TypeScript typing
- **Component Structure**: Follow the existing component patterns in `frontend/src/components/`
- **API Design**: RESTful endpoints in `backend/src/index.ts`
- **Database**: Use Prisma migrations for schema changes
- **Styling**: Tailwind CSS classes with the existing design system

### File Organization Guidelines

- **Frontend Components**: Keep related components together
- **Custom Hooks**: Place in `frontend/src/hooks/`
- **Utilities**: Place in `frontend/src/utils/`
- **API Routes**: Add to `backend/src/index.ts`
- **Database Models**: Update `backend/prisma/schema.prisma`

## Database

### Schema Overview

The application uses two main models:

**Collection:**

- `id` (String, UUID) - Primary key
- `name` (String) - Collection name
- `drawings` (Relation) - Related drawings
- `createdAt`, `updatedAt` (DateTime) - Timestamps

**Drawing:**

- `id` (String, UUID) - Primary key
- `name` (String) - Drawing name
- `elements` (String, JSON) - Excalidraw elements
- `appState` (String, JSON) - Excalidraw application state
- `files` (String, JSON) - Associated files
- `preview` (String, SVG) - Thumbnail preview
- `version` (Int) - Version number for conflict detection
- `collectionId` (String, nullable) - Foreign key to Collection
- `createdAt`, `updatedAt` (DateTime) - Timestamps

### Making Database Changes

1. **Modify the Schema**
   Edit `backend/prisma/schema.prisma`

2. **Create a Migration**

   ```bash
   cd backend
   npx prisma migrate dev --name your_migration_name
   ```

3. **Update TypeScript Types**

   ```bash
   npx prisma generate
   ```

4. **Test the Changes**
   ```bash
   npx prisma db push  # Apply to development database
   ```

### Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name migration_name

# Reset database (development only)
npx prisma migrate reset

# View database in Prisma Studio
npx prisma studio

# Deploy migrations to production
npx prisma migrate deploy
```

## API Documentation

### Base URL

- Development: `http://localhost:8000`
- Production: Configured via environment variables

### Endpoints

#### Drawings

- `GET /drawings` - List drawings (supports search and collection filtering)
- `GET /drawings/:id` - Get single drawing
- `POST /drawings` - Create new drawing
- `PUT /drawings/:id` - Update drawing
- `DELETE /drawings/:id` - Delete drawing permanently
- `POST /drawings/:id/duplicate` - Duplicate drawing

#### Collections

- `GET /collections` - List all collections
- `POST /collections` - Create new collection
- `PUT /collections/:id` - Update collection
- `DELETE /collections/:id` - Delete collection (moves drawings to unorganized)

#### System

- `GET /health` - Health check endpoint

### Real-time Events (Socket.io)

#### Client → Server

- `join-room` - Join drawing room for collaboration
- `cursor-move` - Broadcast cursor position
- `element-update` - Broadcast drawing changes
- `user-activity` - Update user active status

#### Server → Client

- `presence-update` - User presence in room
- `cursor-move` - Other user's cursor position
- `element-update` - Other user's drawing changes

### Environment Setup

**Production Environment Variables:**

- `DATABASE_URL` - SQLite database path
- `PORT` - Backend server port
- `NODE_ENV` - Set to "production"

## Troubleshooting

### Common Issues

1. **Database Connection Error**

   - Check that the database file exists in `backend/prisma/dev.db`
   - Ensure proper permissions on the database file
   - Verify DATABASE_URL in .env

2. **Prisma Client Issues**

   - Run `npx prisma generate` to regenerate client
   - Clear `node_modules` and reinstall dependencies

3. **Port Already in Use**

   - Change PORT in backend/.env
   - Update frontend API URL accordingly

4. **Docker Build Failures**

   - Check Dockerfile syntax
   - Ensure all dependencies are listed in package.json
   - Verify build context in docker-compose.yml

5. **Frontend Not Loading**
   - Check browser console for errors
   - Verify API_URL in frontend environment
   - Check network connectivity to backend

## Architecture Details

### Frontend Architecture

The frontend follows a component-based architecture with:

- **Pages**: Route-level components (`src/pages/`)
- **Components**: Reusable UI components (`src/components/`)
- **Hooks**: Custom React hooks for state management (`src/hooks/`)
- **Context**: Global state providers (`src/context/`)
- **Utils**: Utility functions (`src/utils/`)

Key patterns:

- State management using React hooks and context
- API calls centralized in `src/api/`
- TypeScript for type safety throughout
- Tailwind CSS for styling with custom design tokens

### Backend Architecture

The backend follows a traditional MVC pattern:

- **Routes**: API endpoints in `src/index.ts`
- **Models**: Prisma schema definitions
- **Services**: Business logic (can be extracted to separate files)
- **Middleware**: CORS, JSON parsing, etc.

Real-time features:

- Socket.io for WebSocket connections
- Room-based collaboration
- Presence tracking
- Cursor position broadcasting

### Data Flow

1. **Drawing Creation**: Frontend → API → Database
2. **Real-time Updates**: Frontend → Socket.io → Other Frontends
3. **Data Persistence**: Regular API calls for saving state
4. **File Management**: Frontend → API → Database (as JSON)

## Contributing

### Pull Request Process

1. **Ensure all tests pass**
2. **Update documentation** if needed
3. **Add commit messages** following conventional commits
4. **Request review** from maintainers

### Commit Message Format

```
type(scope): description

feat(auth): add user authentication
fix(editor): resolve drawing save issue
docs(api): update endpoint documentation
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Resources

- [Excalidraw Documentation](https://docs.excalidraw.com/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [React Documentation](https://react.dev/)
- [Socket.io Documentation](https://socket.io/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vite Documentation](https://vitejs.dev/guide/)

_This documentation is maintained alongside the codebase. Please update it when making significant architectural changes._
