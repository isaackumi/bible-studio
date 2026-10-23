<script lang="ts">
  import type { MotionId } from "../domain/types";

  // Animated theme backgrounds, drawn in CSS on the 1920×1080 frame: no files, any tint.
  // Only transform and opacity animate, so they stay smooth on the audience screen.
  let { motion, tint, base, still = false }: { motion: MotionId; tint: string; base: string; still?: boolean } = $props();

  // Fixed pseudo-random layouts so every screen draws the same scene.
  const seeded = (count: number, seed: number) =>
    Array.from({ length: count }, (_, i) => {
      const r = (n: number) => {
        const x = Math.sin((i + 1) * 9301 + seed * 49297 + n * 233) * 43758.5453;
        return x - Math.floor(x);
      };
      return { x: r(1) * 100, y: r(2) * 100, s: r(3), d: r(4), t: r(5) };
    });
  const bokeh = seeded(16, 3);
  const embers = seeded(34, 7);
  const stars = seeded(140, 11);
</script>

<div class="motion {motion}" class:still style:--tint={tint} style:--base={base} aria-hidden="true">
  {#if motion === "aurora"}
    <i class="blob a"></i><i class="blob b"></i><i class="blob c"></i>
  {:else if motion === "rays"}
    <i class="rays"></i><i class="rays slow"></i><i class="sun"></i>
  {:else if motion === "bokeh"}
    {#each bokeh as dot, n (n)}
      <i class="orb" style:left="{dot.x}%" style:top="{dot.y}%" style:--size="{60 + dot.s * 220}px" style:--delay="{-dot.d * 18}s" style:--dur="{14 + dot.t * 16}s" style:opacity={0.18 + dot.s * 0.35}></i>
    {/each}
  {:else if motion === "waves"}
    <i class="wave w1"></i><i class="wave w2"></i><i class="wave w3"></i>
  {:else if motion === "stars"}
    {#each stars as star, n (n)}
      <i class="star" style:left="{star.x}%" style:top="{star.y}%" style:--size="{1.5 + star.s * 3.5}px" style:--delay="{-star.d * 6}s" style:--dur="{3 + star.t * 5}s"></i>
    {/each}
    <i class="drift"></i>
  {:else if motion === "embers"}
    <i class="hearth"></i>
    {#each embers as spark, n (n)}
      <i class="spark" style:left="{spark.x}%" style:--size="{4 + spark.s * 10}px" style:--delay="{-spark.d * 14}s" style:--dur="{8 + spark.t * 10}s" style:--sway="{(spark.s - 0.5) * 160}px"></i>
    {/each}
  {:else if motion === "clouds"}
    <i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i><i class="cloud c4"></i>
  {/if}
</div>

<style>
  .motion { position: absolute; inset: 0; overflow: hidden; background: var(--base); pointer-events: none; }
  .motion i { position: absolute; display: block; }
  .still i, .still i::before, .still i::after { animation-play-state: paused !important; }

  /* Aurora: three soft color fields drifting across the sky. */
  /* The soft edges are in the gradients themselves: a blur filter would be redrawn on every frame of
     the drift, which kept a core busy for the whole service on small church PCs. */
  .blob { width: 1800px; height: 1200px; border-radius: 50%; mix-blend-mode: screen; opacity: 0.55; will-change: transform; --soft: color-mix(in srgb, var(--blob) 45%, transparent); background: radial-gradient(closest-side, var(--blob) 0%, var(--soft) 35%, transparent 100%); }
  .blob.a { left: -450px; top: -350px; --blob: var(--tint); animation: drift-a 26s ease-in-out infinite alternate; }
  .blob.b { right: -550px; top: -50px; --blob: color-mix(in srgb, var(--tint) 55%, #6a5cff); animation: drift-b 32s ease-in-out infinite alternate; }
  .blob.c { left: 150px; bottom: -650px; --blob: color-mix(in srgb, var(--tint) 60%, #00b3ff); animation: drift-c 38s ease-in-out infinite alternate; opacity: 0.4; }
  @keyframes drift-a { to { transform: translate(420px, 160px) scale(1.2); } }
  @keyframes drift-b { to { transform: translate(-520px, -120px) scale(0.85); } }
  @keyframes drift-c { to { transform: translate(260px, -260px) scale(1.15); } }

  /* Light rays: slow rotating beams from above. */
  .rays { will-change: transform; left: 50%; top: -1400px; width: 3200px; height: 3200px; margin-left: -1600px; border-radius: 50%;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--tint) 34%, transparent) 0deg 4deg, transparent 4deg 13deg);
    mask-image: radial-gradient(closest-side, black 18%, transparent 72%); animation: spin 90s linear infinite; opacity: 0.8; }
  .rays.slow { animation-duration: 140s; animation-direction: reverse; opacity: 0.45; }
  .sun { left: 50%; top: -290px; width: 960px; height: 660px; margin-left: -480px; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--tint) 80%, white) 0%, color-mix(in srgb, var(--tint) 50%, transparent) 45%, transparent 100%); opacity: 0.65; will-change: transform; animation: breathe 9s ease-in-out infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes breathe { 50% { opacity: 0.4; transform: scale(1.08); } }

  /* Bokeh: out-of-focus lights floating upward. */
  .orb { width: var(--size); height: var(--size); margin: calc(var(--size) / -2); border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--tint) 70%, white), var(--tint) 45%, transparent 72%);
    filter: blur(6px); animation: float var(--dur) ease-in-out var(--delay) infinite alternate; }
  @keyframes float { from { transform: translate(-30px, 60px); } to { transform: translate(40px, -90px); } }

  /* Waves: layered swells rolling sideways. */
  .wave { left: -50%; width: 200%; height: 900px; border-radius: 45%; background: color-mix(in srgb, var(--tint) 30%, transparent); }
  .wave.w1 { bottom: -620px; animation: roll 16s linear infinite; }
  .wave.w2 { bottom: -660px; background: color-mix(in srgb, var(--tint) 22%, transparent); animation: roll 23s linear infinite reverse; }
  .wave.w3 { bottom: -700px; background: color-mix(in srgb, var(--tint) 40%, transparent); animation: roll 31s linear infinite; }
  @keyframes roll { from { transform: translateX(0) rotate(0deg); } to { transform: translateX(25%) rotate(360deg); } }

  /* Starfield: twinkling points with a faint nebula. */
  .star { width: var(--size); height: var(--size); border-radius: 50%; background: var(--tint); box-shadow: 0 0 6px var(--tint); animation: twinkle var(--dur) ease-in-out var(--delay) infinite; }
  .drift { inset: -20%; background: radial-gradient(40% 30% at 30% 40%, color-mix(in srgb, var(--tint) 10%, transparent), transparent), radial-gradient(35% 25% at 72% 62%, color-mix(in srgb, #7a5cff 14%, transparent), transparent); animation: drift-a 60s ease-in-out infinite alternate; }
  @keyframes twinkle { 50% { opacity: 0.2; transform: scale(0.6); } }

  /* Embers: sparks rising from a warm glow. */
  .hearth { left: 0; right: 0; bottom: -300px; height: 700px; background: radial-gradient(60% 70% at 50% 100%, color-mix(in srgb, var(--tint) 55%, transparent), transparent); animation: breathe 7s ease-in-out infinite; }
  .spark { bottom: -40px; width: var(--size); height: var(--size); border-radius: 50%; background: color-mix(in srgb, var(--tint) 70%, #fff3c0); box-shadow: 0 0 calc(var(--size) * 2) var(--tint); animation: rise var(--dur) linear var(--delay) infinite; }
  @keyframes rise { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(var(--sway), -1200px); opacity: 0; } }

  /* Clouds: soft white masses drifting across a sky. */
  .cloud { height: 520px; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--tint) 85%, transparent) 0%, color-mix(in srgb, var(--tint) 60%, transparent) 30%, color-mix(in srgb, var(--tint) 28%, transparent) 60%, color-mix(in srgb, var(--tint) 8%, transparent) 85%, transparent 100%); opacity: 0.75; will-change: transform; }
  .cloud.c1 { width: 1100px; top: 80px; left: -600px; animation: sail 70s linear infinite; }
  .cloud.c2 { width: 900px; top: 520px; left: -500px; animation: sail 95s linear -40s infinite; opacity: 0.55; }
  .cloud.c3 { width: 1300px; top: -120px; left: -700px; animation: sail 120s linear -70s infinite; opacity: 0.6; }
  .cloud.c4 { width: 800px; top: 760px; left: -400px; animation: sail 85s linear -20s infinite; opacity: 0.45; }
  @keyframes sail { to { transform: translateX(3000px); } }

  @media (prefers-reduced-motion: reduce) {
    .motion i, .motion i::before, .motion i::after { animation-play-state: paused !important; }
  }
</style>
