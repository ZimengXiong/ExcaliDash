<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch } from "vue";
import DefaultTheme from "vitepress/theme";
import HomeCanvas from "./HomeCanvas.vue";

const ReviewPanel = import.meta.env.DEV
  ? defineAsyncComponent(() => import("./DocsReview.vue"))
  : null;
const open = ref(import.meta.env.DEV);

function applyLayout() {
  document.documentElement.classList.toggle("docs-review-open", open.value);
}
onMounted(() => {
  if (!import.meta.env.DEV) return;
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
    <ReviewPanel v-if="ReviewPanel" :open="open" @toggle="open = !open" />
  </ClientOnly>
</template>
