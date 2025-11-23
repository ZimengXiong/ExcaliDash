<img src="logoExcaliDash.png" alt="ExcaliDash Logo" width="80" height="88">

# ExcaliDash v0.1.0

![License](https://img.shields.io/github/license/zimengxiong/excalidash)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)

A self-hosted dashboard and organizer for [Excalidraw](https://github.com/excalidraw/excalidraw) with live collaboration features.

## Screenshots

![](dashboard.png)

![](demo.gif)

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Upgrading](#upgrading)
- [Installation](#installation)
  - [Docker Hub (Recommended)](#dockerhub-recommended)
  - [Docker Build](#docker-build)
- [Development](#development)
  - [Clone the Repository](#clone-the-repository)
  - [Frontend](#frontend)
  - [Backend](#backend)
  - [Project Structure](#project-structure)
- [Credits](#credits)

## Features

<details>
<summary>Persistent storage for all your drawings</summary>

![](dashboardLight.png)

</details>

<details>
<summary>Real time collaboration</summary>

![](collabDemo.gif)

</details>

<details>
<summary>Search your drawings</summary>

![](searchPage.png)

</details>

<details>
<summary>Drag and drop drawings into collections</summary>

![](collectionsPage.png)

</details>

<details>
<summary>Export/import your drawings and databases for backup</summary>

![](settingsPage.png)

</details>

# Upgrading

See [release notes](https://github.com/ZimengXiong/ExcaliDash/releases) for a specific release.

</details>

# Installation

> [!CAUTION]
> NOT for production use. This is just a side project (and also the first release), and it likely contains some bugs. DO NOT open ports to the internet (e.g. CORS is set to allow all)

## Docker Hub (Recommended)

[Install Docker](https://docs.docker.com/desktop/)

```bash
# Download docker-compose.prod.yml
curl -OL https://raw.githubusercontent.com/ZimengXiong/ExcaliDash/refs/heads/main/docker-compose.prod.yml

# Pull images
docker compose -f docker-compose.prod.yml pull

# Run container
docker compose -f docker-compose.prod.yml up -d

# Access the frontend at localhost:6767
```

## Docker Build

[Install Docker](https://docs.docker.com/desktop/)

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git

docker compose build
docker compose up -d

# Access the frontend at localhost:6767
```

# Development

## Clone the Repository

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git
```

## Frontend

```bash
cd ExcaliDash/frontend
npm install

# Copy environment file and customize if needed
cp .env.example .env

npm run dev
```

## Backend

```bash
cd ExcaliDash/backend
npm install

# Copy environment file and customize if needed
cp .env.example .env

# Generate Prisma client and setup database
npx prisma generate
npx prisma db push

npm run dev
```

## Project Structure

```
ExcaliDash/
├── backend/                 # Node.js + Express + Prisma
│   ├── src/
│   │   └── index.ts        # Main server file
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── dev.db         # SQLite database
│   └── package.json
├── frontend/               # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom hooks
│   │   └── api/           # API client
│   └── package.json
└── README.md
```

# Credits

- Example designs from:
  - https://github.com/Prakash-sa/system-design-ultimatum/tree/main
  - https://github.com/kitsteam/excalidraw-examples/tree/main
- [The Amazing work of Excalidraw developers](https://www.npmjs.com/package/@excalidraw/excalidraw)
