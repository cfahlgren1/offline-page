<script lang="ts">
  import { MODELS, hubUrl } from "#lib/brand";
  import { closeModelInfo, keepModelInfo, leaveModelInfo, modelInfo, type ModelStatus } from "#lib/modelInfo.svelte";

  let { status }: { status: ModelStatus } = $props();

  let card: HTMLElement | undefined = $state();

  const footer = $derived.by(() => {
    if (status.state === "error") return "The models couldn’t load. Writing and saving still work.";
    if (status.state === "loading") return "Loading…";
    return status.worksOffline ? "Runs in this tab and is saved for offline use." : "Runs in this tab.";
  });

  /** A press anywhere but the card or a model's name puts the card away. */
  function closeOnOutsidePress(event: PointerEvent): void {
    if (!modelInfo.id) return;
    const target = event.target as Element;
    if (!card?.contains(target) && !target.closest(".model-name")) closeModelInfo();
  }
</script>

<svelte:document
  onpointerdown={closeOnOutsidePress}
  onkeydown={(event) => event.key === "Escape" && closeModelInfo()}
/>
<!-- The card is placed against the window, so it's closed rather than left behind when the window changes. -->
<svelte:window onresize={closeModelInfo} />

<!-- What a model does, in a sentence, with a link to it. All of the text comes from brand.ts. -->
<div
  id="models-info"
  class="info-card"
  role="dialog"
  aria-label="About the models"
  tabindex="-1"
  hidden={!modelInfo.id}
  style:bottom="{modelInfo.bottom}px"
  style:left="{modelInfo.left}px"
  bind:this={card}
  onpointerenter={keepModelInfo}
  onpointerleave={leaveModelInfo}
>
  {#if modelInfo.id}
    {@const model = MODELS[modelInfo.id]}
    <div class="flex items-baseline justify-between gap-3">
      <span><span class="info-name">{model.name}</span> <span class="info-kind">{model.role} · {model.size}</span></span
      >
      <a class="info-link" href={hubUrl(modelInfo.id)} target="_blank" rel="noopener">Model ↗</a>
    </div>
    <p class="info-text">{model.caveat}</p>
    <p class="info-text text-faint">{footer}</p>
  {/if}
</div>
