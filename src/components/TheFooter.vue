<script setup lang="ts">
const annee = new Date().getFullYear();
</script>

<template>
  <footer class="siteFoot">
    <div class="fRow">
      <div class="fBrand">MovieGuesser</div>
      <nav class="fNav" aria-label="Pied de page">
        <RouterLink to="/">Accueil</RouterLink>
        <RouterLink to="/nouvelle-seance">Nouvelle séance</RouterLink>
        <RouterLink to="/profil">Le club</RouterLink>
      </nav>
    </div>
    <p class="fNote">Un jeu de devinettes entre cinéphiles. Données de classements
      issues de Letterboxd — site non affilié à Letterboxd.</p>
    <p class="fCopy">© {{ annee }} MovieGuesser · Admit One</p>
  </footer>
</template>
