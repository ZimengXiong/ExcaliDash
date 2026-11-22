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
const copiedIndex = ref<number | null>(null);
const slide = computed(() => props.slides[current.value]);

function move(direction: number) {
  current.value = Math.max(
    0,
    Math.min(props.slides.length - 1, current.value + direction),
  );
}

async function copyCode(code: string, index: number) {
  try {
    await navigator.clipboard.writeText(code);
    copiedIndex.value = index;
    window.setTimeout(() => {
      if (copiedIndex.value === index) copiedIndex.value = null;
    }, 1600);
  } catch {
    /* Clipboard access is optional. */
  }
}
</script>

<template>
  <section
    v-if="slide"
    class="screenshot-carousel"
    role="region"
    aria-roledescription="carousel"
    :aria-label="label"
    tabindex="0"
    @keydown.left.prevent="move(-1)"
    @keydown.right.prevent="move(1)"
  >
    <header class="carousel-bar">
      <div class="carousel-step-heading" aria-live="polite" aria-atomic="true">
        <span class="carousel-step-index">
          {{ String(current + 1).padStart(2, "0") }}
          <span class="carousel-step-sep">/</span>
          {{ String(slides.length).padStart(2, "0") }}
        </span>
        <strong class="carousel-step-title">{{ slide.title }}</strong>
      </div>
      <div class="carousel-controls">
        <button
          type="button"
          class="carousel-nav-btn"
          aria-label="Previous step"
          :disabled="current === 0"
          @click="move(-1)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5L5.5 8L10 12.5" />
          </svg>
        </button>
        <button
          type="button"
          class="carousel-nav-btn"
          aria-label="Next step"
          :disabled="current === slides.length - 1"
          @click="move(1)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5L10.5 8L6 12.5" />
          </svg>
        </button>
      </div>
    </header>

    <div class="carousel-progress" role="tablist" aria-label="Choose a step">
      <button
        v-for="(item, index) in slides"
        :key="item.light"
        type="button"
        role="tab"
        class="carousel-segment"
        :class="{ active: current === index, passed: index < current }"
        :aria-selected="current === index"
        :aria-label="`Step ${index + 1}: ${item.title}`"
        @click="current = index"
      />
    </div>

    <div
      v-for="(item, index) in slides"
      :key="item.light"
      v-show="current === index"
      class="carousel-slide"
    >
      <div class="carousel-body">
        <p class="carousel-text">{{ item.text }}</p>
        <div v-if="item.code" class="carousel-code">
          <code>{{ item.code }}</code>
          <button
            type="button"
            class="carousel-copy-btn"
            :aria-label="
              copiedIndex === index ? 'Copied command' : 'Copy command'
            "
            @click="copyCode(item.code, index)"
          >
            {{ copiedIndex === index ? "Copied" : "Copy" }}
          </button>
        </div>
      </div>

      <div class="carousel-media">
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
  margin: 20px 0 28px;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: var(--vp-c-bg-elv);
  overflow: hidden;
}

.screenshot-carousel:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.carousel-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--vp-c-bg-soft);
}

.carousel-step-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.carousel-step-index {
  flex: none;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-brand-1);
}

.carousel-step-sep {
  color: var(--vp-c-text-3);
  margin-inline: 1px;
}

.carousel-step-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--vp-c-text-1);
}

.carousel-controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.carousel-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 5px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition:
    border-color 120ms ease,
    color 120ms ease,
    background-color 120ms ease;
}

.carousel-nav-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.carousel-nav-btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.carousel-nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.carousel-nav-btn:focus-visible,
.carousel-segment:focus-visible,
.carousel-copy-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.carousel-progress {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 0;
  background: var(--vp-c-divider);
  border-top: 1px solid var(--vp-c-divider);
  border-bottom: 1px solid var(--vp-c-divider);
}

.carousel-segment {
  height: 3px;
  padding: 0;
  border: 0;
  background: var(--vp-c-bg-alt);
  cursor: pointer;
  transition: background-color 140ms ease;
}

.carousel-segment.passed {
  background: color-mix(in srgb, var(--vp-c-brand-1) 42%, var(--vp-c-bg-alt));
}

.carousel-segment.active {
  background: var(--vp-c-brand-1);
}

.carousel-segment:hover:not(.active) {
  background: color-mix(in srgb, var(--vp-c-brand-1) 65%, var(--vp-c-bg-alt));
}

.carousel-body {
  padding: 12px 14px 14px;
}

.carousel-text {
  margin: 0 !important;
  font-size: 14px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.carousel-code {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 5px;
  background: var(--vp-c-bg);
}

.carousel-code code {
  overflow-x: auto;
  white-space: nowrap;
  padding: 0 !important;
  background: transparent !important;
  color: var(--vp-c-text-1) !important;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  scrollbar-width: none;
}

.carousel-code code::-webkit-scrollbar {
  display: none;
}

.carousel-copy-btn {
  flex: none;
  padding: 3px 9px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    color 120ms ease;
}

.carousel-copy-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.carousel-media {
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}

.carousel-media .theme-screenshot {
  margin: 0;
  width: 100%;
}

.carousel-media .theme-screenshot img {
  width: 100%;
  border: 0;
  border-radius: 0;
}

@media (max-width: 520px) {
  .carousel-bar {
    padding: 9px 12px;
  }

  .carousel-body {
    padding: 10px 12px 12px;
  }
}
</style>
