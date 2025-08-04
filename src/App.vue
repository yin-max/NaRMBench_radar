<template>
  <main>
    <h1>Heading</h1>
    <RadarChart />
  </main>
</template>

<script setup>
import RadarChart from './components/RadarChart.vue';
</script>

<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #333;
  background-color: white;
  margin: 0; /* Remove body default margin */
}

main {
  width: 100%;
  min-height: 100vh; /* Fill viewport height */
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding: 0;
}

h1 {
  align-self: flex-start;
  font-weight: 400;
  font-size: 2.5rem;
  margin-top: 0rem;
  margin-bottom: 1rem;
  margin-left: 2rem;
}
</style>
