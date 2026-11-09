# MCP server

ExcaliDash ships an [MCP](https://modelcontextprotocol.io) server in the
`mcp/` directory. It lets an AI agent list, create and edit drawings, connect
shapes, add images and organize collections through the ExcaliDash API. Changes
show up in the editor like any other edit.

The server is based on
[excalidash-mcp](https://github.com/LatikDesu/excalidash-mcp) by Evgeny
Abrosimov ([@LatikDesu](https://github.com/LatikDesu)), used under the MIT
License. See `NOTICE` and `mcp/LICENSE` in the repository.

## Create an API key

In ExcaliDash, open **Profile → API keys** and create a key with
`drawings:read`, `drawings:write`, `collections:read` and `collections:write`.
The drawing tools need only the two drawing scopes.

## Connect a client (stdio)

Most MCP clients start the server as a child process. Point it at the public
**frontend URL** of your instance; the client appends `/api` itself.

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
        "EXCALIDASH_URL": "https://draw.example.com",
        "EXCALIDASH_API_KEY": "YOUR_ACCOUNT_KEY"
      }
    }
  }
}
```

Keep `-i`; do not add `-t` or publish a port. To run from a checkout instead,
build it with `npm --prefix mcp ci && npm --prefix mcp run build` and use
`"command": "node", "args": ["/path/to/ExcaliDash/mcp/dist/index.js"]`.

## Run over HTTP with Docker Compose

The development `docker-compose.yml` has an optional `mcp` service that serves
Streamable HTTP on `127.0.0.1:${MCP_PORT:-6768}/mcp`. It is off by default:

```sh
EXCALIDASH_API_KEY=your-key docker compose --profile mcp up -d
```

`/health` checks the process and `/ready` makes an authenticated read request
to ExcaliDash. The Host and Origin allowlists (`MCP_ALLOWED_HOSTS`,
`MCP_ALLOWED_ORIGINS`) are not a substitute for client authentication, so do
not expose this port beyond loopback.

See `mcp/README.md` for the full tool list and environment variables.
