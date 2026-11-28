# Sanitizer benchmark

Compares two backend images: memory and save latency under a burst of drawing
saves, and whether `sanitizeSvg` returns the same bytes. Needs Docker, bash and
`openssl`.

## Previews

Both scripts take a JSON array of preview SVGs. The previews of your own
drawings are the most realistic input:

```sh
sqlite3 -json prisma/dev.db "select preview from Drawing where preview is not null" > previews.json
```

## Memory and save latency

Build the branch image, then run the benchmark once per image:

```sh
docker build -f backend/Dockerfile -t excalidash-backend:wasm .
backend/scripts/sanitizer-bench/bench.sh zimengxiong/excalidash-backend:0.7.0 previews.json
backend/scripts/sanitizer-bench/bench.sh excalidash-backend:wasm previews.json
```

Each run starts the backend on an empty database (`AUTH_MODE=disabled`, no
network), waits 20 s, saves one drawing 200 times cycling through the previews,
waits 30 s and prints:

```text
image: excalidash-backend:wasm
idle after start:  max 47 MB, last 47 MB
during saves:      max 54 MB, last 54 MB
after saves:       max 52 MB, last 52 MB
peak RSS:          136 MB (VmHWM, includes file-backed pages)
container peak:    62 MB (docker stats)
saves (ms):        median 27, p95 75, total 6784
```

The phase lines are `RssAnon` of the backend process, sampled about once a
second. Set `HEAP_MB=256 MEM_LIMIT=384m` to cap the heap and the container, and
`SAVES` to change the number of saves.

## Same output

Sanitize every preview in each image and compare:

```sh
mkdir -p out && chmod 777 out
for t in old:zimengxiong/excalidash-backend:0.7.0 new:excalidash-backend:wasm; do
  docker run --rm --network none -e DATABASE_URL=file:/tmp/bench.db \
    -v "$PWD/backend/scripts/sanitizer-bench":/bench:ro -v "$PWD/previews.json":/previews.json:ro \
    -v "$PWD/out":/out --entrypoint node "${t#*:}" /bench/outputs.cjs sanitize /previews.json "/out/${t%%:*}.json"
done
docker run --rm -v "$PWD/backend/scripts/sanitizer-bench":/bench:ro -v "$PWD/out":/out \
  --entrypoint node excalidash-backend:wasm /bench/outputs.cjs compare /out/old.json /out/new.json
```
