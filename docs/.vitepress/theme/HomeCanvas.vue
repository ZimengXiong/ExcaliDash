<script setup lang="ts">
import { useData, withBase } from "vitepress";
import marketingVersions from "../../public/images/marketing-versions.json";

const { frontmatter } = useData();
const imageUrl = (theme: "light" | "dark") =>
  `${withBase(frontmatter.value.canvasImage[theme])}?v=${marketingVersions[theme]}`;
</script>

<template>
  <section v-if="frontmatter.pageClass === 'canvas-home'" class="drawing-home">
    <header class="drawing-heading">
      <h1>
        {{ frontmatter.canvasHero.name }}
        <span class="drawing-headline">{{
          frontmatter.canvasHero.headline
        }}</span>
        <svg viewBox="0 0 600 20" aria-hidden="true">
          <path d="M8 12 Q235 3 591 8 M209 17 Q393 12 581 14" />
        </svg>
      </h1>
      <p class="drawing-tagline">{{ frontmatter.canvasHero.tagline }}</p>
      <div class="drawing-actions">
        <a
          v-for="action in frontmatter.canvasHero.actions"
          :key="action.link"
          :href="withBase(action.link)"
          :class="['drawing-action', action.theme]"
          :target="action.link.startsWith('https://') ? '_blank' : undefined"
          :rel="action.link.startsWith('https://') ? 'noreferrer' : undefined"
        >
          {{ action.text }}
          <svg viewBox="0 0 30 18" aria-hidden="true">
            <path d="M2 10 Q13 7 26 9 M19 2 L27 9 L20 16" />
          </svg>
        </a>
      </div>
    </header>

    <section class="drawing-board">
      <figure
        class="drawing-scene"
        role="img"
        :aria-label="frontmatter.canvasImage.alt"
      >
        <div class="scene-frame">
          <span class="drawing-corner top" aria-hidden="true" />
          <img
            class="scene-light"
            :src="imageUrl('light')"
            alt=""
            aria-hidden="true"
            width="3200"
            height="2100"
            fetchpriority="high"
          />
          <img
            class="scene-dark"
            :src="imageUrl('dark')"
            alt=""
            aria-hidden="true"
            width="3200"
            height="2100"
            fetchpriority="high"
          />
          <span class="drawing-corner bottom" aria-hidden="true" />
        </div>
      </figure>

      <article
        v-for="(feature, index) in frontmatter.canvasFeatures"
        :key="feature.title"
        :class="['drawing-note', `note-${index + 1}`]"
      >
        <span class="drawing-number" aria-hidden="true">{{
          feature.icon
        }}</span>
        <h2>{{ feature.title }}</h2>
        <p>{{ feature.details }}</p>
      </article>
    </section>
  </section>
</template>

<style scoped>
.drawing-home {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(16px, 3dvh, 32px);
  height: calc(var(--home-view-height, 100dvh) - var(--vp-nav-height));
  min-height: 620px;
  max-width: 1440px;
  margin: 0 auto;
  padding: clamp(16px, 3dvh, 32px) clamp(24px, 4cqi, 64px);
}

.drawing-heading {
  display: grid;
  gap: 12px;
  align-items: center;
  transform: translateY(clamp(20px, 5dvh, 56px));
}

h1 {
  position: relative;
  width: fit-content;
  max-width: 100%;
  font:
    400 clamp(42px, min(8cqi, 11dvh), 108px) / 1.15 "Excalifont",
    cursive;
  letter-spacing: -0.055em;
  transform: rotate(-2deg);
  color: var(--vp-c-text-1);
}

h1 svg {
  display: block;
  width: 90%;
  height: 20px;
  margin: -6px 0 0 8%;
  fill: none;
  stroke: var(--violet);
  stroke-width: 3;
  stroke-linecap: round;
}

.drawing-headline {
  display: block;
  margin-top: 12px;
  font-size: clamp(22px, 3cqi, 36px);
  line-height: 1.25;
  letter-spacing: -0.03em;
}

.drawing-tagline {
  max-width: 360px;
  color: var(--vp-c-text-2);
  font-size: clamp(14px, 2dvh, 18px);
  line-height: 1.5;
}

.drawing-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
}

.drawing-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 42px;
  padding: 10px 0;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 600;
  color: var(--vp-c-text-1);
  transition: color 150ms ease;
}

.drawing-action.brand {
  padding-inline: 20px;
  color: var(--vp-c-bg);
  background: var(--vp-c-text-1);
  border-radius: 3px 7px 4px 6px;
}

.drawing-action svg {
  width: 24px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  transition: transform 150ms ease;
}

.drawing-action:hover svg {
  transform: translateX(3px);
}

.drawing-action.alt:hover {
  color: var(--vp-c-brand-1);
}

.drawing-action:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 5px;
}

.drawing-board {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr) repeat(3, auto);
  min-height: 0;
  gap: clamp(12px, 2dvh, 24px);
}

.drawing-scene {
  position: relative;
  display: grid;
  place-items: center;
  container-type: size;
  grid-column: 1 / -1;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  margin: 0 4px 8px;
}

.scene-frame {
  position: relative;
  width: min(100%, calc(100cqh * 32 / 21));
  aspect-ratio: 32 / 21;
  border: 1px solid var(--vp-c-border);
  border-radius: 5px;
  box-shadow: 0 16px 40px rgb(0 0 0 / 12%);
}

.scene-frame img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: inherit;
  transition: opacity 350ms ease-in-out;
}

.drawing-scene img.scene-dark {
  opacity: 0;
}

.drawing-scene img.scene-light {
  opacity: 1;
}

/* Follow the root theme class, including before Vue hydrates on refresh. */
.dark .drawing-scene img.scene-light {
  opacity: 0;
}

.dark .drawing-scene img.scene-dark {
  opacity: 1;
}

.drawing-corner {
  position: absolute;
  width: 26px;
  height: 26px;
  border-color: var(--violet);
  opacity: 0.7;
}

.drawing-corner.top {
  top: -8px;
  left: -8px;
  border-top: 2px solid;
  border-left: 2px solid;
  transform: rotate(-4deg);
}

.drawing-corner.bottom {
  bottom: -8px;
  right: -8px;
  border-bottom: 2px solid;
  border-right: 2px solid;
  transform: rotate(3deg);
}

.drawing-note {
  position: relative;
  min-width: 0;
  padding-left: 28px;
}

.drawing-number {
  position: absolute;
  top: 4px;
  left: 0;
  color: var(--vp-c-text-3);
  font:
    14px "Excalifont",
    cursive;
}

.drawing-note h2 {
  width: fit-content;
  margin-bottom: 6px;
  font:
    400 clamp(20px, 3dvh, 28px) / 1.2 "Excalifont",
    cursive;
  color: var(--vp-c-text-1);
}

.drawing-note p {
  max-width: 260px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
}

@container (min-width: 640px) {
  .drawing-heading {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    column-gap: 32px;
    row-gap: 12px;
  }

  h1 {
    grid-row: 1 / 3;
  }

  .drawing-scene {
    grid-column: 1 / -1;
    max-width: 820px;
    justify-self: center;
  }
}

@container (min-width: 1100px) {
  .drawing-board {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) auto;
    column-gap: 16px;
    row-gap: clamp(12px, 2dvh, 24px);
    align-items: center;
  }

  .drawing-scene {
    grid-column: 4 / 10;
    grid-row: 1 / 3;
    align-self: center;
    margin: 0;
  }

  .drawing-note {
    z-index: 1;
  }

  .note-1 {
    grid-column: 1 / 3;
    grid-row: 1;
    transform: rotate(-3deg);
  }

  .note-2 {
    grid-column: 11 / 13;
    grid-row: 1;
    transform: rotate(2deg);
  }

  .note-3 {
    grid-column: 1 / 3;
    grid-row: 2;
    transform: rotate(1deg);
  }

  .note-4 {
    grid-column: 11 / 13;
    grid-row: 2;
    transform: rotate(-2deg);
  }

  .note-5 {
    grid-column: 3 / 6;
    grid-row: 3;
    transform: rotate(-2deg);
  }

  .note-6 {
    grid-column: 8 / 11;
    grid-row: 3;
    transform: rotate(1deg);
  }
}

@container (max-width: 639px) {
  .drawing-note p {
    display: none;
  }
}

@media (max-height: 740px) {
  .drawing-note p {
    display: none;
  }
}

@media (max-width: 959px) {
  .docs-review-open .drawing-heading {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }

  .docs-review-open .drawing-heading h1 {
    grid-row: 1 / 3;
    font-size: clamp(28px, 5cqi, 48px);
  }

  .docs-review-open .drawing-headline {
    display: block;
    margin-top: 12px;
    font-size: clamp(22px, 3cqi, 36px);
    line-height: 1.25;
    letter-spacing: -0.03em;
  }

  .drawing-tagline {
    display: none;
  }

  .docs-review-open .drawing-note p {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawing-action,
  .drawing-action svg,
  .drawing-scene img {
    transition: none;
  }
}
</style>
