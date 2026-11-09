# ExcaliDash

Self-hosted Excalidraw workspaces with collections, real-time collaboration,
sharing, history, backups, and local or OpenID Connect authentication.

[![ExcaliDash dashboard](docs/public/images/workspace.png)](https://excalidash.xyz)

[Self-host Excalidraw with Docker Compose](https://excalidash.xyz/deploy/docker),
or read the documentation at [excalidash.xyz](https://excalidash.xyz).

## Quick start

```sh
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open <http://localhost:6767>. Configuration and deployment guidance live in
the [documentation](https://excalidash.xyz).

## MCP server

The `mcp/` directory contains an MCP server that lets AI agents create and
edit ExcaliDash drawings. It is based on
[excalidash-mcp](https://github.com/LatikDesu/excalidash-mcp) by
Evgeny Abrosimov ([@LatikDesu](https://github.com/LatikDesu)), used under the
MIT License. See [NOTICE](NOTICE) and [mcp/LICENSE](mcp/LICENSE).

ExcaliDash is licensed under the GNU Lesser General Public License v3.0.
