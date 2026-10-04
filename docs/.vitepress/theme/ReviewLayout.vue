<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch } from "vue";
import DefaultTheme from "vitepress/theme";
import HomeCanvas from "./HomeCanvas.vue";

const feedbackEnabled = import.meta.env.VITE_DOCS_FEEDBACK === "1";
const FeedbackPanel = feedbackEnabled
  ? defineAsyncComponent(() => import("./PageFeedback.vue"))
  : null;
const ReviewPanel =
  import.meta.env.DEV && !feedbackEnabled
    ? defineAsyncComponent(() => import("./DocsReview.vue"))
    : null;
const open = ref(import.meta.env.DEV);

function applyLayout() {
  document.documentElement.classList.toggle("docs-review-open", open.value);
}
onMounted(() => {
  if (!import.meta.env.DEV || feedbackEnabled) return;
  try {
    open.value = localStorage.getItem("docs-review-open") !== "false";
  } catch {
    /* Use the default layout. */
  }
  applyLayout();
});
watch(open, () => {
  applyLayout();
  try {
    localStorage.setItem("docs-review-open", String(open.value));
  } catch {
    /* The review still works without preferences. */
  }
});
onUnmounted(() =>
  document.documentElement.classList.remove("docs-review-open"),
);
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-before><HomeCanvas /></template>
  </DefaultTheme.Layout>
  <ClientOnly>
    <FeedbackPanel v-if="FeedbackPanel" />
    <ReviewPanel v-else-if="ReviewPanel" :open="open" @toggle="open = !open" />
  </ClientOnly>
</template>
