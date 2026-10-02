<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useData, useRouter } from "vitepress";

defineProps<{ open: boolean }>();
defineEmits<{ toggle: [] }>();

type Annotation = {
  id: string;
  quote: string;
  comment: string;
  resolved: boolean;
};
type Draft = {
  file: string;
  markdown: string;
  notes: string;
  annotations: Annotation[];
  baseSource: string;
  baseSourceHash: string;
  revision: number;
  updatedAt: string | null;
};
type PageInfo = { file: string; title: string; route: string };
type Session = PageInfo & {
  draft: Draft;
  sourceHash: string;
  changes: number;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  error: string;
  timer?: ReturnType<typeof setTimeout>;
};

const { page } = useData();
const router = useRouter();
const inventory = ref<PageInfo[]>([]);
const sessions = reactive(new Map<string, Session>());
const file = computed(() => page.value.relativePath);
const current = computed(() => sessions.get(file.value));
const loading = ref(false);
const loadError = ref("");
const editor = ref<HTMLTextAreaElement>();
const selection = ref("");
const retryTimer = ref<ReturnType<typeof setInterval>>();
const status = computed(() => {
  const session = current.value;
  if (!session) return "";
  if (session.conflict) return "Draft conflict";
  if (session.error) return "Saved locally · retry needed";
  if (session.saving || session.dirty) return "Saving…";
  return session.draft.updatedAt ? "Saved to server" : "Ready to edit";
});
const changedSource = computed(
  () =>
    current.value &&
    current.value.sourceHash !== current.value.draft.baseSourceHash,
);
const backupKey = (name: string) => `excalidash-docs-review:${name}`;
const endpoint = (name: string) =>
  `/__docs-review/page?file=${encodeURIComponent(name)}`;

function snapshot(session: Session): Draft {
  return JSON.parse(JSON.stringify(session.draft));
}
function backup(session: Session) {
  try {
    localStorage.setItem(
      backupKey(session.file),
      JSON.stringify({ draft: snapshot(session), dirty: session.dirty }),
    );
  } catch {
    // Server autosave remains available when local storage is full or disabled.
  }
}
function changed(session = current.value) {
  if (!session) return;
  session.changes += 1;
  session.dirty = true;
  backup(session);
  clearTimeout(session.timer);
  session.timer = setTimeout(() => void save(session), 600);
}
async function save(session: Session, keepalive = false) {
  if (!session.dirty || session.saving || session.conflict) return;
  clearTimeout(session.timer);
  session.saving = true;
  const version = session.changes;
  const payload = snapshot(session);
  try {
    const response = await fetch(endpoint(session.file), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Docs-Review": "1" },
      body: JSON.stringify(payload),
      keepalive,
    });
    const result = await response.json();
    if (!response.ok) {
      session.conflict = response.status === 409;
      throw new Error(result.error || "Couldn't save. Retry to save.");
    }
    session.draft.revision = result.revision;
    session.draft.updatedAt = result.updatedAt;
    session.dirty = version !== session.changes;
    session.error = "";
    backup(session);
  } catch (error) {
    session.error =
      error instanceof Error ? error.message : "Couldn't save. Retry to save.";
    backup(session);
  } finally {
    session.saving = false;
  }
  if (session.dirty && !session.error && !session.conflict) void save(session);
}

async function load(name: string) {
  selection.value = "";
  loadError.value = "";
  if (sessions.has(name)) return;
  loading.value = true;
  try {
    const response = await fetch(endpoint(name));
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Couldn't load this page.");
    const session: Session = {
      ...result,
      changes: 0,
      dirty: false,
      saving: false,
      conflict: false,
      error: "",
    };
    try {
      const cached = JSON.parse(
        localStorage.getItem(backupKey(name)) || "null",
      );
      if (cached?.dirty && cached.draft?.file === name) {
        session.draft = cached.draft;
        session.dirty = true;
        if (cached.draft.revision !== result.draft.revision) {
          session.conflict = true;
          session.error =
            "The server has another draft. Export your edits before loading the server copy.";
        }
      }
    } catch {
      /* Start with the server draft if the local backup is unavailable. */
    }
    sessions.set(name, session);
    if (session.dirty) void save(sessions.get(name)!);
  } catch (error) {
    if (file.value === name)
      loadError.value =
        error instanceof Error ? error.message : "Couldn't load this page.";
  } finally {
    if (file.value === name) loading.value = false;
  }
}

watch(
  file,
  (name, previous) => {
    if (previous && sessions.has(previous)) void save(sessions.get(previous)!);
    void load(name);
  },
  { immediate: true },
);

function captureSelection() {
  const input = editor.value;
  selection.value = input
    ? input.value.slice(input.selectionStart, input.selectionEnd).trim()
    : "";
}
async function annotate() {
  const session = current.value;
  if (!session) return;
  const id = crypto.randomUUID();
  session.draft.annotations.push({
    id,
    quote: selection.value,
    comment: "",
    resolved: false,
  });
  selection.value = "";
  changed(session);
  await nextTick();
  document.getElementById(`comment-${id}`)?.focus();
}
function downloadDraft() {
  if (!current.value) return;
  const blob = new Blob([JSON.stringify(snapshot(current.value), null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${file.value.replace(/\//g, "-")}.review.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
async function loadServerCopy() {
  if (
    !current.value ||
    !confirm(
      "Replace this editor with the server draft? Export your edits first to keep a copy.",
    )
  )
    return;
  clearTimeout(current.value.timer);
  sessions.delete(file.value);
  try {
    localStorage.removeItem(backupKey(file.value));
  } catch {
    /* Continue with the server copy. */
  }
  await load(file.value);
}
function flush() {
  for (const session of sessions.values())
    if (session.dirty) void save(session, true);
}
function onVisibility() {
  if (document.visibilityState === "hidden") flush();
}
function capturePageSelection() {
  const selected = window.getSelection();
  const anchor = selected?.anchorNode?.parentElement;
  if (anchor?.closest(".Layout") && selected?.toString().trim()) {
    selection.value = selected.toString().trim();
  }
}

onMounted(async () => {
  try {
    const response = await fetch("/__docs-review/pages");
    if (!response.ok) throw new Error("Couldn't load the page list.");
    inventory.value = (await response.json()).pages;
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : "Couldn't load the page list.";
  }
  window.addEventListener("pagehide", flush);
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("selectionchange", capturePageSelection);
  retryTimer.value = setInterval(() => {
    for (const session of sessions.values())
      if (session.dirty && !session.conflict) void save(session);
  }, 10000);
});
onBeforeUnmount(() => {
  flush();
  for (const session of sessions.values()) clearTimeout(session.timer);
  clearInterval(retryTimer.value);
  window.removeEventListener("pagehide", flush);
  window.removeEventListener("online", flush);
  document.removeEventListener("visibilitychange", onVisibility);
  document.removeEventListener("selectionchange", capturePageSelection);
});
</script>

<template>
  <button
    v-if="!open"
    class="review-reopen"
    type="button"
    @click="$emit('toggle')"
  >
    Edit & comment
  </button>
  <aside v-else class="review-panel" aria-label="Documentation review">
    <header class="review-header">
      <div>
        <strong>Edit & comment</strong>
        <span
          class="review-status"
          :class="{ warning: current?.error }"
          role="status"
          >{{ status }}</span
        >
      </div>
      <button
        type="button"
        class="review-button"
        @click="$emit('toggle')"
        aria-label="Hide review panel"
      >
        Hide
      </button>
    </header>
    <div class="review-page-picker">
      <label for="review-page">Page</label>
      <select
        id="review-page"
        :value="file"
        @change="
          router.go(
            inventory.find(
              (item) =>
                item.file === ($event.target as HTMLSelectElement).value,
            )?.route || '/',
          )
        "
      >
        <option v-for="item in inventory" :key="item.file" :value="item.file">
          {{ item.title }}
        </option>
      </select>
    </div>
    <div class="review-body">
      <p class="review-hint">
        Edit the draft or select text and add a comment. Changes autosave.
      </p>
      <p v-if="loading && !current" role="status">Loading draft…</p>
      <div v-if="loadError" class="review-alert" role="alert">
        {{ loadError }} <button type="button" @click="load(file)">Retry</button>
      </div>
      <template v-if="current">
        <div v-if="current.error" class="review-alert" role="alert">
          <p>{{ current.error }}</p>
          <button
            v-if="!current.conflict"
            class="review-button"
            type="button"
            @click="save(current)"
          >
            Retry save
          </button>
          <button
            v-else
            class="review-button"
            type="button"
            @click="loadServerCopy"
          >
            Load server copy
          </button>
          <button class="review-button" type="button" @click="downloadDraft">
            Export my draft
          </button>
        </div>
        <p v-if="changedSource" class="review-alert">
          The published page changed since this draft started. Your draft and
          comments are preserved.
        </p>
        <div class="review-field-heading">
          <label for="review-markdown">Draft · Markdown</label>
          <button
            class="review-button"
            type="button"
            @mousedown.prevent
            @click="annotate"
          >
            {{ selection ? "Comment on selection" : "Add comment" }}
          </button>
        </div>
        <textarea
          id="review-markdown"
          ref="editor"
          v-model="current.draft.markdown"
          class="review-markdown"
          spellcheck="false"
          @input="changed()"
          @select="captureSelection"
          @keyup="captureSelection"
          @mouseup="captureSelection"
          @keydown.ctrl.s.prevent="save(current)"
          @keydown.meta.s.prevent="save(current)"
        />
        <label for="review-notes">Page notes</label>
        <textarea
          id="review-notes"
          v-model="current.draft.notes"
          class="review-notes"
          placeholder="What should change on this page?"
          @input="changed()"
        />
        <div class="review-field-heading">
          <h2>
            Comments <span>{{ current.draft.annotations.length }}</span>
          </h2>
        </div>
        <p v-if="!current.draft.annotations.length" class="review-hint">
          Select draft text to attach a comment, or add a page comment.
        </p>
        <article
          v-for="annotation in current.draft.annotations"
          :key="annotation.id"
          class="review-comment"
          :class="{ resolved: annotation.resolved }"
        >
          <blockquote v-if="annotation.quote">
            {{ annotation.quote }}
          </blockquote>
          <label :for="`comment-${annotation.id}`">{{
            annotation.quote ? "Comment on selected text" : "Page comment"
          }}</label>
          <textarea
            :id="`comment-${annotation.id}`"
            v-model="annotation.comment"
            rows="3"
            placeholder="Leave feedback…"
            @input="changed()"
          />
          <label class="review-resolved"
            ><input
              v-model="annotation.resolved"
              type="checkbox"
              @change="changed()"
            />
            Resolved</label
          >
        </article>
      </template>
    </div>
    <footer class="review-footer">
      Drafts stay separate from published docs.
      <a href="/__docs-review/export" target="_blank" rel="noopener"
        >Export all reviews</a
      >
    </footer>
  </aside>
</template>
