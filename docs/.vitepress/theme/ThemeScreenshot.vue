<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";
import versions from "../../public/images/image-versions.json";

const props = defineProps<{
  light: string;
  dark: string;
  alt: string;
  width?: number;
  height?: number;
}>();
const { isDark } = useData();
const url = (path: string) =>
  `${withBase(path)}?v=${(versions as Record<string, string>)[path] || "1"}`;
const fullImage = computed(() => url(isDark.value ? props.dark : props.light));
</script>

<template>
  <a
    class="theme-screenshot"
    :href="fullImage"
    :aria-label="`Open full-size image: ${alt}`"
  >
    <img
      class="screenshot-light"
      :src="url(light)"
      :alt="alt"
      :width="width || 1600"
      :height="height || 1050"
      loading="lazy"
    />
    <img
      class="screenshot-dark"
      :src="url(dark)"
      :alt="alt"
      :width="width || 1600"
      :height="height || 1050"
      loading="lazy"
    />
  </a>
</template>

<style>
.theme-screenshot {
  display: block;
  margin: 24px auto;
  width: fit-content;
  max-width: 100%;
}
.theme-screenshot img {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
}
.theme-screenshot .screenshot-dark,
.dark .theme-screenshot .screenshot-light {
  display: none;
}
.dark .theme-screenshot .screenshot-dark {
  display: block;
}
</style>
