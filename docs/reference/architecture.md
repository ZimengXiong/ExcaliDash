# Architecture

ExcaliDash serves a React frontend and an Express API from one origin.

## Request path

```text
Browser
  └─ Frontend (React + Vite build, served by nginx)
       ├─ Static application assets
       └─ /api and realtime traffic
            └─ Backend (Express + Socket.IO)
                 ├─ Prisma database
                 └─ Drawing file storage
```

## Frontend

React renders the dashboard and Excalidraw editor. Socket.IO handles live collaboration.

## Backend

Express handles authentication, access control, storage, sharing, and history. Environment configuration lives in `backend/src/config/`.

## Storage

Prisma supports SQLite (default) and PostgreSQL. Image bytes are stored in database records by default. Setting `S3_BUCKET` moves new image storage to S3 or an S3-compatible service.

## Deployment boundary

The frontend image includes the backend proxy configuration. Use the same ExcaliDash version for both images.
