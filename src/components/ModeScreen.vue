<script setup lang="ts">
import { useGameStore } from "../stores/game";
import router from "../router";

const game = useGameStore();
function goCompet() { router.push("/competitif"); }
</script>

<template>
  <section>
    <div class="setHead">Nouvelle séance</div>
    <p class="clubIntro">Trois salles, trois façons de jouer — choisis la tienne.</p>

    <div class="breakout">
      <nav class="menu">
        <div class="menuRow" role="button" tabindex="0"
             @click="game.goSetup()" @keydown.enter="game.goSetup()">
          <span class="lbl">En local</span>
          <span class="mdesc">un duel à deux, sur le même écran</span>
        </div>
        <div class="menuRow" role="button" tabindex="0"
             @click="router.push('/entre-amis')" @keydown.enter="router.push('/entre-amis')">
          <span class="lbl">Entre amis</span>
          <span class="mdesc">un duel en ligne, sur invitation</span>
        </div>
        <div class="menuRow" role="button" tabindex="0"
             @click="goCompet()" @keydown.enter="goCompet()">
          <span class="lbl">Compétition</span>
          <span class="mdesc">le défi du moment, seul face au classement mondial</span>
        </div>
      </nav>
    </div>
  </section>
</template>
