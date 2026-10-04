<script setup lang="ts">
import { computed, ref } from "vue";
import ThemeScreenshot from "./ThemeScreenshot.vue";

const props = defineProps<{
  label: string;
  slides: {
    title: string;
    text: string;
    light: string;
    dark: string;
    alt: string;
    code?: string;
  }[];
}>();
const current = ref(0);
const slide = computed(() => props.slides[current.value]);
function move(direction: number) {
  current.value = Math.max(
    0,
    Math.min(props.slides.length - 1, current.value + direction),
  );
}
</script>

<template>
  <section
    v-if="slide"
    class="screenshot-carousel"
    role="region"
    aria-roledescription="carousel"
    :aria-label="label"
    @keydown.left.prevent="move(-1)"
    @keydown.right.prevent="move(1)"
  >
    <div class="carousel-controls">
      <button
        type="button"
        aria-label="Previous step"
        :disabled="current === 0"
        @click="move(-1)"
      >
        ←
      </button>
      <span aria-live="polite" aria-atomic="true"
        >Step {{ current + 1 }} of {{ slides.length }}</span
      >
      <button
        type="button"
        aria-label="Next step"
        :disabled="current === slides.length - 1"
        @click="move(1)"
      >
        →
      </button>
    </div>
    <div
      v-for="(item, index) in slides"
      :key="item.light"
      v-show="current === index"
    >
      <div class="carousel-caption" aria-live="polite" aria-atomic="true">
        <strong>{{ item.title }}</strong>
        <p>{{ item.text }}</p>
        <pre v-if="item.code"><code>{{ item.code }}</code></pre>
      </div>
      <div class="carousel-image">
        <ThemeScreenshot
          :light="item.light"
          :dark="item.dark"
          :alt="item.alt"
        />
      </div>
    </div>
  </section>
</template>

<style>
.screenshot-carousel {
  margin: 24px 0;
  padding: 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.carousel-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  font-size: 14px;
}
.carousel-controls button {
  width: 40px;
  height: 40px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  font-size: 22px;
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  cursor: pointer;
}
.carousel-controls button:disabled {
  opacity: 0.35;
  cursor: default;
}
.carousel-controls button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
.carousel-caption {
  margin: 12px 0 16px;
  min-height: 140px;
}
.carousel-caption p {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.6;
}
.carousel-caption pre {
  margin: 10px 0 0;
  padding: 8px 12px;
  overflow-x: auto;
  border-radius: 6px;
  background: var(--vp-c-bg-alt);
  font-size: 12px;
}
.carousel-image .theme-screenshot {
  width: min(100%, 640px);
  margin: 0 auto;
}
.carousel-image .theme-screenshot img {
  width: 100%;
}
</style>
