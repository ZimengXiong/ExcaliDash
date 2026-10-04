<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useData, useRouter } from "vitepress";

const { page, theme } = useData();
const router = useRouter();
const open = ref(true);
const editing = ref(false);
const text = ref("");
const notes = ref("");
const status = ref("");
const drafts = ref<Record<string, Feedback>>({});
const storageKey = "excalidash-page-feedback-v1";
let content: HTMLElement | null = null;
let mounted = false;

type Feedback = {
  page: string;
  title: string;
  originalText: string;
  editedText: string;
  comments: string;
  savedAt: string;
};

const pages = computed(() => [
  { text: "Homepage", link: "/" },
  ...(Array.isArray(theme.value.sidebar)
    ? theme.value.sidebar.flatMap(
        (group: { items?: { text: string; link: string }[] }) =>
          group.items || [],
      )
    : []),
]);
const path = computed(() => {
  const file = page.value.relativePath;
  return `/${file.replace(/index\.md$/, "").replace(/\.md$/, "")}`;
});
const count = computed(() => Object.keys(drafts.value).length);
let originalText = "";
let activePath = "";
let activeTitle = "";

function persist() {
  if (!activePath) return;
  drafts.value[activePath] = {
    page: activePath,
    title: activeTitle,
    originalText,
    editedText: text.value,
    comments: notes.value,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey, JSON.stringify(drafts.value));
    status.value = "Saved in this browser";
  } catch {
    status.value = "Browser storage unavailable. Download feedback to keep it.";
  }
}

function captureEdit() {
  if (!content) return;
  text.value = content.innerText;
  persist();
}

function preventNavigation(event: MouseEvent) {
  if ((event.target as Element).closest("a, button")) event.preventDefault();
}

function pasteText(event: ClipboardEvent) {
  event.preventDefault();
  // Plain text prevents pasted formatting or markup from altering the page.
  const selection = window.getSelection();
  if (!selection?.rangeCount || !content?.contains(selection.anchorNode))
    return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(
    event.clipboardData?.getData("text/plain") || "",
  );
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  captureEdit();
}

function stopEditing() {
  if (!content || !editing.value) return;
  content.removeAttribute("contenteditable");
  content.classList.remove("feedback-editable");
  content.removeEventListener("input", captureEdit);
  content.removeEventListener("click", preventNavigation, true);
  content.removeEventListener("paste", pasteText);
  editing.value = false;
}

function toggleEditing() {
  if (editing.value) {
    stopEditing();
    return;
  }
  if (!content) return;
  content.setAttribute("contenteditable", "true");
  content.classList.add("feedback-editable");
  content.addEventListener("input", captureEdit);
  content.addEventListener("click", preventNavigation, true);
  content.addEventListener("paste", pasteText);
  editing.value = true;
  content.focus();
}

async function loadPage() {
  stopEditing();
  await nextTick();
  content = document.querySelector<HTMLElement>(".VPHome, .VPDoc .vp-doc");
  activePath = path.value;
  activeTitle = page.value.title || "Homepage";
  const saved = drafts.value[activePath];
  originalText = saved?.originalText ?? content?.innerText ?? "";
  text.value = saved?.editedText ?? originalText;
  notes.value = saved?.comments ?? "";
  status.value = saved ? "Saved feedback loaded" : "Ready for feedback";
}

function togglePanel() {
  if (open.value) stopEditing();
  open.value = !open.value;
  document.documentElement.classList.toggle("docs-review-open", open.value);
}

function exportFeedback() {
  persist();
  const blob = new Blob(
    [
      JSON.stringify(
        {
          site: "excalidash.xyz",
          exportedAt: new Date().toISOString(),
          pages: Object.values(drafts.value),
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "excalidash-feedback.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

watch(
  () => page.value.relativePath,
  () => {
    if (mounted) void loadPage();
  },
);

onMounted(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      drafts.value = Object.fromEntries(
        Object.entries(saved).filter(
          ([, value]) =>
            value &&
            typeof value === "object" &&
            typeof (value as Feedback).originalText === "string" &&
            typeof (value as Feedback).editedText === "string" &&
            typeof (value as Feedback).comments === "string",
        ),
      ) as Record<string, Feedback>;
    }
  } catch {
    status.value = "Could not load saved feedback";
  }
  mounted = true;
  document.documentElement.classList.add("docs-review-open");
  await loadPage();
});

onUnmounted(() => {
  stopEditing();
  document.documentElement.classList.remove("docs-review-open");
});
</script>

<template>
  <button v-if="!open" class="review-reopen" type="button" @click="togglePanel">
    Edit & comment
  </button>
  <aside v-else class="review-panel" aria-label="Page feedback">
    <header class="review-header">
      <div>
        <strong>Edit & comment</strong>
        <span class="review-status" role="status">{{ status }}</span>
      </div>
      <button class="review-button" type="button" @click="togglePanel">
        Hide
      </button>
    </header>
    <div class="review-page-picker">
      <label for="feedback-page">Page</label>
      <select
        id="feedback-page"
        :value="path"
        @change="router.go(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="item in pages" :key="item.link" :value="item.link">
          {{ item.text }}
        </option>
      </select>
    </div>
    <div class="review-body">
      <p class="review-hint">
        Leave comments or edit the text. Feedback saves in this browser;
        download it to send back to me.
      </p>
      <label for="feedback-notes">Comments</label>
      <textarea
        id="feedback-notes"
        v-model="notes"
        class="review-notes"
        rows="5"
        placeholder="What should change on this page?"
        @input="persist"
      />
      <div class="review-field-heading">
        <label for="feedback-text">Suggested page text</label>
        <button
          class="review-button"
          type="button"
          :aria-pressed="editing"
          @click="toggleEditing"
        >
          {{ editing ? "Finish editing page" : "Edit text on page" }}
        </button>
      </div>
      <p class="review-hint">
        Edit here, or use “Edit text on page” to type directly on the preview.
        Direct edits appear here as feedback. Saved suggestions reload in this
        field.
      </p>
      <textarea
        id="feedback-text"
        v-model="text"
        class="review-markdown"
        spellcheck="true"
        :readonly="editing"
        @input="persist"
      />
      <button class="review-button" type="button" @click="persist">
        Save feedback
      </button>
    </div>
    <footer class="review-footer feedback-footer">
      <span
        >{{ count }} {{ count === 1 ? "page" : "pages" }} with saved
        feedback</span
      >
      <button class="review-button" type="button" @click="exportFeedback">
        Download all feedback
      </button>
    </footer>
  </aside>
</template>

<style>
.feedback-editable {
  outline: 2px dashed var(--vp-c-brand-1);
  outline-offset: -2px;
  cursor: text;
}
.feedback-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
</style>
