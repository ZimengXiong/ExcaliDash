# MCP server

ExcaliDash includes an [MCP](https://modelcontextprotocol.io) server so AI
agents can list, create and edit drawings, connect shapes, add images and
organize collections. Changes show up in the editor like any other edit.

The server is based on
[excalidash-mcp](https://github.com/LatikDesu/excalidash-mcp) by Evgeny
Abrosimov ([@LatikDesu](https://github.com/LatikDesu)), used under the MIT
License. See `NOTICE` and `mcp/LICENSE` in the repository.

## Turn it on

The backend serves the MCP endpoint itself. Set `MCP_ENABLED=true` on the
backend and restart it:

```sh
MCP_ENABLED=true docker compose -f docker-compose.prod.yml up -d
```

The endpoint is then available at `https://your-host/api/mcp` through the
same frontend address as the rest of ExcaliDash. There is no extra container
and no server-wide API key to configure. See the
[environment reference](/reference/environment#mcp-server) for session limits.

## Connect an agent

Open **Settings → AI Agents (MCP)** and choose **Connect an AI agent**.
ExcaliDash creates an API key for you and shows a ready-to-paste
configuration, for example:

```json
{
  "mcpServers": {
    "excalidash": {
      "type": "http",
      "url": "https://your-host/api/mcp",
      "headers": { "Authorization": "Bearer exd_..." }
    }
  }
}
```

or, for Claude Code:

```sh
claude mcp add --transport http excalidash https://your-host/api/mcp --header "Authorization: Bearer exd_..."
```

Each agent acts as the user who owns the key and sees exactly what that user
can see. The key needs at least `drawings:read`; the collection tools also need
the collection scopes. To disconnect an agent, revoke its key under
**Settings → API Keys**.

## Run it locally over stdio

Clients that only support stdio can run the server as a child process
instead. Build the image with `docker build -f mcp/Dockerfile -t excalidash-mcp .`
or use the published `ghcr.io/brenovit/excalidash-mcp`, and pass the
frontend URL and an API key:

```json
{
  "mcpServers": {
    "excalidash": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--env",
        "EXCALIDASH_URL",
        "--env",
        "EXCALIDASH_API_KEY",
        "ghcr.io/brenovit/excalidash-mcp"
      ],
      "env": {
        "EXCALIDASH_URL": "https://your-host",
        "EXCALIDASH_API_KEY": "exd_..."
      }
    }
  }
}
```

See `mcp/README.md` for the full tool list.
