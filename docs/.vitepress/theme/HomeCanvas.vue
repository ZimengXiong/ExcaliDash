<script setup lang="ts">
import { useData, withBase } from "vitepress";
import { ref } from "vue";
import imageVersions from "../../public/images/image-versions.json";

const { frontmatter, isDark } = useData();
const activeImage = ref(0);

const imageUrl = (
  image: { light: string; dark: string },
  theme: "light" | "dark",
) =>
  `${withBase(image[theme])}?v=${(imageVersions as Record<string, string>)[image[theme]] || "1"}`;

function cycleImage() {
  const images = frontmatter.value.canvasImages || [];
  if (images.length < 2) return;
  activeImage.value = (activeImage.value + 1) % images.length;
}

function toggleTheme() {
  isDark.value = !isDark.value;
}
</script>

<template>
  <section v-if="frontmatter.pageClass === 'canvas-home'" class="drawing-home">
    <header class="hero">
      <h1>
        <span>{{ frontmatter.canvasHero.name }}</span>
        <svg class="hero-underline" viewBox="0 0 360 18" aria-hidden="true">
          <path pathLength="1" d="M6 11 Q150 3 352 8" />
          <path pathLength="1" d="M96 15 Q230 10 342 13" />
        </svg>
      </h1>
      <p class="hero-tagline">{{ frontmatter.canvasHero.tagline }}</p>
      <div class="hero-actions">
        <a
          v-for="action in frontmatter.canvasHero.actions"
          :key="action.link"
          :href="withBase(action.link)"
          :class="['hero-action', action.theme]"
        >
          <span>{{ action.text }}</span>
          <svg viewBox="0 0 24 14" aria-hidden="true">
            <path d="M1 7 Q10 6 21 7 M15 2 L22 7 L15 12" />
          </svg>
        </a>
      </div>
    </header>

    <section class="stage" aria-label="ExcaliDash workspace preview">
      <button
        type="button"
        class="stack"
        :aria-label="`Showing ${frontmatter.canvasImages[activeImage]?.label}. Click to view next screenshot.`"
        @click="cycleImage"
      >
        <div
          v-for="(image, index) in frontmatter.canvasImages"
          :key="image.label"
          class="sheet"
          :class="activeImage === index ? 'front' : 'back'"
          :aria-hidden="activeImage !== index"
        >
          <img
            class="scene-light"
            :src="imageUrl(image, 'light')"
            :alt="image.alt"
            width="3200"
            height="2100"
            :fetchpriority="index === 0 ? 'high' : 'auto'"
            draggable="false"
          />
          <img
            class="scene-dark"
            :src="imageUrl(image, 'dark')"
            alt=""
            aria-hidden="true"
            width="3200"
            height="2100"
            draggable="false"
          />
        </div>
      </button>

      <div class="stage-foot">
        <span class="stage-label" aria-hidden="true">
          <svg viewBox="0 0 30 22">
            <path d="M27 19 Q10 18 5 4 M2 10 L5 3 L11 7" />
          </svg>
          {{ frontmatter.canvasImages[activeImage]?.label }}
        </span>
        <button
          type="button"
          class="theme-doodle"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path
              class="moon"
              d="M19.5 5.5 C13 6.5 9.5 11.5 10.2 17 C11 22.6 16.5 26.6 22.3 25.4 C24.3 25 26 24 27.2 22.6 C20.5 23.6 15.2 18.6 15.6 12.4 C15.8 9.6 17.2 7.2 19.5 5.5 Z"
            />
            <g class="sun">
              <circle cx="16" cy="16" r="5.2" />
              <path
                d="M16 3.5 V7 M16 25 V28.5 M3.5 16 H7 M25 16 H28.5 M7.2 7.2 L9.6 9.6 M22.4 22.4 L24.8 24.8 M24.8 7.2 L22.4 9.6 M9.6 22.4 L7.2 24.8"
              />
            </g>
          </svg>
        </button>
      </div>
    </section>

    <section class="notes" aria-label="Core capabilities">
      <a
        v-for="feature in frontmatter.canvasFeatures"
        :key="feature.title"
        :href="withBase(feature.link)"
        class="note"
      >
        <h2>
          {{ feature.title }}
          <svg
            viewBox="0 0 120 8"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path pathLength="1" d="M2 5 Q40 1 70 4 T118 3" />
          </svg>
        </h2>
        <p>{{ feature.details }}</p>
      </a>
    </section>
  </section>
</template>

<style scoped>
.drawing-home {
  display: grid;
  gap: clamp(36px, 6cqi, 64px);
  max-width: 1040px;
  margin: 0 auto;
  padding: clamp(36px, 6cqi, 72px) clamp(20px, 4cqi, 40px) 24px;
}

/* Hero */
.hero {
  display: grid;
  justify-items: center;
  text-align: center;
}

.hero h1 {
  margin: 0;
  font:
    400 clamp(54px, 9cqi, 96px) / 1 "Excalifont",
    cursive;
  letter-spacing: -0.04em;
  color: var(--vp-c-text-1);
  transform: rotate(-1.5deg);
  transition: transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.hero h1:hover {
  transform: rotate(1deg) scale(1.02);
}

.hero-underline {
  display: block;
  width: 100%;
  height: 16px;
  margin-top: 2px;
  fill: none;
  stroke: var(--violet);
  stroke-width: 3;
  stroke-linecap: round;
}

.hero-underline path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 700ms 200ms ease-out forwards;
}

.hero-underline path + path {
  animation-delay: 650ms;
  animation-duration: 450ms;
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

.hero-tagline {
  max-width: 46ch;
  margin: 22px 0 0;
  color: var(--vp-c-text-2);
  font-size: clamp(16px, 1.7cqi, 18px);
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 10px 24px;
  margin-top: 28px;
}

.hero-action {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  color: var(--vp-c-text-1);
  transition:
    transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 140ms ease,
    color 140ms ease;
}

.hero-action.brand {
  padding: 10px 20px;
  border-radius: 9px 6px 10px 5px;
  background: var(--violet);
  color: #ffffff;
}

.hero-action.brand:hover {
  background: var(--vp-c-brand-2);
  transform: rotate(-1.5deg);
}

.hero-action.alt:hover {
  color: var(--vp-c-brand-1);
}

.hero-action svg {
  width: 20px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 200ms ease;
}

.hero-action:hover svg {
  transform: translateX(4px);
}

.hero-action:focus-visible,
.stack:focus-visible,
.theme-doodle:focus-visible,
.note:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

/* Shuffleable sheet stack */
.stage {
  display: grid;
  gap: 18px;
  width: min(100%, 940px);
  justify-self: center;
}

.stack {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 32 / 21;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.sheet {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: var(--vp-c-bg-elv);
  transform-origin: 50% 60%;
  transition:
    transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 260ms ease,
    border-color 220ms ease;
  will-change: transform, opacity;
}

.sheet.front {
  z-index: 2;
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1) rotate(-0.6deg);
}

.sheet.back {
  z-index: 1;
  opacity: 0.45;
  transform: translate3d(1.6%, 2.2%, 0) scale(0.975) rotate(1.8deg);
}

.stack:hover .sheet.front {
  transform: translate3d(0, -3px, 0) scale(1.005) rotate(-0.9deg);
}

.stack:hover .sheet.back {
  opacity: 0.58;
  transform: translate3d(2.3%, 3%, 0) scale(0.975) rotate(2.5deg);
}

.stack:active .sheet.front {
  transform: translate3d(0, -1px, 0) scale(0.992) rotate(-0.5deg);
  transition-duration: 120ms;
}

.sheet img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 320ms ease;
}

.sheet img.scene-dark,
.dark .sheet img.scene-light {
  opacity: 0;
}

.sheet img.scene-light,
.dark .sheet img.scene-dark {
  opacity: 1;
}

.stage-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-inline: 4px;
}

.stage-label {
  display: inline-flex;
  align-items: flex-end;
  gap: 8px;
  font:
    400 19px / 1 "Excalifont",
    cursive;
  color: var(--vp-c-text-2);
  transform: rotate(-1deg);
}

.stage-label svg {
  width: 26px;
  height: 20px;
  fill: none;
  stroke: var(--violet);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.theme-doodle {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition:
    color 140ms ease,
    transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.theme-doodle:hover {
  color: var(--violet);
  transform: rotate(-12deg) scale(1.1);
}

.theme-doodle:active {
  transform: rotate(-24deg) scale(0.9);
}

.theme-doodle svg {
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.theme-doodle .moon,
.theme-doodle .sun {
  transform-origin: 16px 16px;
  transition:
    opacity 260ms ease,
    transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.theme-doodle .sun,
.dark .theme-doodle .moon {
  opacity: 0;
  transform: rotate(-90deg) scale(0.4);
}

.theme-doodle .moon,
.dark .theme-doodle .sun {
  opacity: 1;
  transform: none;
}

/* Feature notes */
.notes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px 48px;
  margin-top: clamp(8px, 2cqi, 24px);
}

.note {
  display: block;
  color: inherit;
  text-decoration: none;
}

.note h2 {
  position: relative;
  width: fit-content;
  margin: 0 0 6px;
  font:
    400 23px / 1.2 "Excalifont",
    cursive;
  color: var(--vp-c-text-1);
  transition: color 140ms ease;
}

.note h2 svg {
  position: absolute;
  left: 0;
  bottom: -5px;
  width: 100%;
  height: 7px;
  fill: none;
  stroke: var(--violet);
  stroke-width: 2.4;
  stroke-linecap: round;
}

.note h2 path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  opacity: 0;
  transition:
    stroke-dashoffset 360ms ease,
    opacity 120ms ease;
}

.note:hover h2 {
  color: var(--vp-c-brand-1);
}

.note:hover h2 path,
.note:focus-visible h2 path {
  stroke-dashoffset: 0;
  opacity: 1;
}

.note p {
  margin: 0;
  max-width: 34ch;
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

@container (min-width: 600px) {
  .notes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (min-width: 900px) {
  .notes {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    row-gap: 40px;
  }
}

@container (max-width: 1099px) {
  .drawing-home {
    overflow-x: clip;
  }
}

@container (max-width: 599px) {
  .sheet.back,
  .stack:hover .sheet.back {
    transform: translate(0.8%, 2.4%) rotate(1.4deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero h1,
  .hero-action,
  .hero-action svg,
  .sheet,
  .sheet img,
  .sheet::after,
  .theme-doodle,
  .theme-doodle .moon,
  .theme-doodle .sun,
  .note h2 path {
    transition: none;
  }

  .hero-underline path {
    animation: none;
    stroke-dashoffset: 0;
  }

  .stack.shuffled .sheet {
    animation: none;
  }
}
</style>
