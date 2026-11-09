# ExcaliDash MCP server

> Originally created by Evgeny Abrosimov ([@LatikDesu](https://github.com/LatikDesu))
> as [excalidash-mcp](https://github.com/LatikDesu/excalidash-mcp), MIT licensed.
> This copy is maintained inside ExcaliDash and has been adapted for it.

An MCP server for working with drawings in ExcaliDash. An AI agent can create a drawing, edit shapes and text, connect elements, add images, and organize drawings into collections. ExcaliDash stores the drawings; changes remain visible in its editor.

There are two ways to run it:

- **Built into ExcaliDash (recommended).** With `MCP_ENABLED=true`, the ExcaliDash backend serves this server at `/api/mcp` over Streamable HTTP (see `src/embedded.ts`). Each client authenticates with its own user API key, which ExcaliDash creates for you under **Settings → AI Agents (MCP)**. See [docs/guide/mcp.md](../docs/guide/mcp.md).
- **Standalone over stdio.** Your MCP client starts it as a child process and supplies an ExcaliDash user API key. You do not need to host another MCP endpoint, install a database, or give the server S3 credentials. The rest of this README describes this mode.

## Connect a client

You need a running ExcaliDash instance and an account API key. In ExcaliDash, create the key under **Profile → API keys** with `drawings:read`, `drawings:write`, `collections:read`, and `collections:write`. The drawing tools need only the two drawing scopes; collection tools need the collection scopes too.

Use the public **frontend URL** of your ExcaliDash instance. The API client appends `/api` itself; do not point it at a backend service address.

### Container image

For a client that launches Docker, use the image published by this repository's GHCR workflow:

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

The image uses stdio. Keep `-i`; do not add `-t` or publish a port. To build it locally, run `docker build -f mcp/Dockerfile -t excalidash-mcp .` from the repository root.

### From a checkout

```sh
npm --prefix mcp ci
npm --prefix mcp run build
```

Then configure the client with `"command": "node"` and `"args": ["/path/to/ExcaliDash/mcp/dist/index.js"]`, plus the same two environment variables.

Client configuration formats differ. If your client does not use `mcpServers`, supply the same command, arguments, and two environment variables in its server settings. Protect the config file if it contains the key, or use the client's secret store. The image does not contain your credentials.

## Tools

The server exposes 17 tools. Drawing selection belongs to one MCP session; another session will not inherit it.

| Tool                         | What it does                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_drawings`              | Lists accessible drawings. Supports `search`, `limit` (1–100), and `offset`.                                                                                        |
| `create_drawing`             | Creates an empty Excalidraw drawing. Selects it by default unless `select` is false.                                                                                |
| `select_drawing`             | Reads and selects a drawing for tools that accept an optional `drawingId`. A failed selection leaves the previous choice intact.                                    |
| `get_selected_drawing`       | Returns the drawing selected in this MCP session.                                                                                                                   |
| `get_drawing_summary`        | Reads a compact structural summary of a drawing.                                                                                                                    |
| `inspect_drawing_element`    | Returns one element's properties and its bound children.                                                                                                            |
| `apply_drawing_ops`          | Atomically applies up to 50 semantic operations in a single backend request.                                                                                        |
| `rename_drawing`             | Renames a drawing by its explicit ID.                                                                                                                               |
| `delete_drawing`             | Permanently deletes a drawing by its explicit ID. It does not move it to Trash.                                                                                     |
| `get_drawing`                | Returns the full stored scene, including `elements`, `appState`, `files`, and the current `version`.                                                                |
| `find_elements`              | Finds non-deleted elements by exact ID/type and a literal, case-sensitive text substring; filters are combined with AND. Results are paginated, up to 100 per page. |
| `list_collections`           | Lists owned and shared collections with the ownership metadata provided by ExcaliDash.                                                                              |
| `create_collection`          | Creates a collection owned by the key's user.                                                                                                                       |
| `rename_collection`          | Renames an owned collection. Trash cannot be renamed.                                                                                                               |
| `delete_collection`          | Deletes an owned collection and its shares. Its drawings are kept, without a collection. Trash cannot be deleted.                                                   |
| `move_drawing_to_collection` | Moves a drawing to an existing collection, or uses `collectionId: null` to leave it unorganized.                                                                    |
| `add_image`                  | Adds a PNG or JPEG image from base64 and places it at the supplied coordinates. Decoded input is limited to 5 MiB.                                                  |

### Drawing operations

`apply_drawing_ops` supports `add_shape`, `connect`, `set_text`, `set_style`, `move`, `delete`, `import_elements`, `layout`, and `revert_to_snapshot`. A `layout` operation accepts graph nodes and edges; supported directions are `TB`, `BT`, `LR`, and `RL`. A graph can have up to 200 nodes and 400 edges, with a batch limit of 300 nodes and 600 edges.

When adding shapes, you can give them short `ref` names. The response maps these names to element IDs. Use the names in a **second** `apply_drawing_ops` call to connect or edit those elements. ExcaliDash assigns IDs when it creates the shapes, so a request that creates a `ref` and refers to it later in the _same_ batch is rejected before writing. Each call is atomic on its own; the two calls are not one transaction. Aliases are scoped to the current drawing and MCP session and disappear on restart.

`revert_to_snapshot` restores elements from a version you already know. It is not a history browser or a full restoration of files and app state. Reverted elements may remain in the stored scene with `isDeleted: true`.

### Images and stored data

`add_image` accepts canonical base64 without a `data:` prefix, `mimeType` (`image/png` or `image/jpeg`), and `x`, `y`, `width`, `height`. The server checks the encoded data and image signature before sending it to ExcaliDash. A version conflict is returned as an error; the tool does not retry over another editor's changes.

`get_drawing` reads the stored scene. Its `files` entries may contain private ExcaliDash references rather than embedded image bytes. To make a portable `.excalidraw` file, use the export button in ExcaliDash itself.

## Development

```sh
npm --prefix mcp ci
npm run test:mcp
```

For a direct stdio run, copy [`.env.example`](.env.example) to `mcp/.env`, set `EXCALIDASH_URL` and `EXCALIDASH_API_KEY`, restrict the file to mode `0600`, and run `node --env-file=.env dist/index.js` from `mcp/` after building. Keep browser-login passwords out of this file.

Streamable HTTP is available for development and transport testing: `node --env-file=.env dist/http.js` serves `/mcp` on `127.0.0.1:8080` by default. `/health` checks the process; `/ready` makes a bounded, authenticated read request to ExcaliDash. The Host and Origin allowlists are configurable through the variables in `.env.example`. They are not a substitute for client authentication on an exposed network endpoint.

`npm test` does not change drawings on a running ExcaliDash instance. Run `npm audit` to check dependencies.

The original code is licensed under [MIT](LICENSE). Changes made in ExcaliDash are under the project's LGPL-3.0 license. See [NOTICE](../NOTICE).
