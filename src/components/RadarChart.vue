<template>
  <div v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</div>
  <div v-else-if="isLoading">Loading...</div>
  <div v-else class="container">
    <div class="filters-container">
      <!-- Kit selection -->
      <div class="filters">
        <fieldset>
          <legend>ONT-DRS Kit</legend>
          <label v-for="kit in kits" :key="kit" class="checkbox" :class="{ selected: selectedKit === kit }">
            <input type="radio" :value="kit" v-model="selectedKit" name="kit-selection" />
            {{ kit }}
          </label>
        </fieldset>
      </div>
      <!-- Modification selection -->
      <div class="filters">
        <fieldset>
          <legend>RNA Modifications</legend>
          <label v-for="csv in csvFiles" :key="csv" class="checkbox" :class="{ selected: selectedCsv === csv }">
            <input type="radio" :value="csv" v-model="selectedCsv" name="csv-selection" />
            {{ csv.replace(/_\d{3}\.csv$/, '.csv').replace('.csv', '') }}
          </label>
        </fieldset>
      </div>
      <!-- Detection tools selection -->
      <div class="filters">
        <fieldset>
          <legend>
            Detection Tools
            <div class="button-group">
              <button @click="clearAllModels" class="toggle-btn" :disabled="!modelNames.length">Clear</button>
              <button @click="selectAllModels" class="toggle-btn" :disabled="!modelNames.length">All</button>
            </div>
          </legend>
          <div class="model-columns">
            <div v-for="(column, colIndex) in modelColumns" :key="colIndex" class="column">
              <label
                v-for="name in column"
                :key="name"
                class="checkbox"
                :class="{ nomal: name.toLowerCase() !== 'retrain', retrain: name.toLowerCase().includes('retrain') }"
                :style="{ backgroundColor: selectedModels.includes(name) ? modelColors[name] : 'transparent' }"
                :title="name"
              >
                <input type="checkbox" :value="name" v-model="selectedModels" />
                <span class="model-name" :style="{ color: selectedModels.includes(name) ? '#ffffff' : modelColors[name] }">{{ name }}</span>
              </label>
            </div>
          </div>
        </fieldset>
        <!-- #45b2e0: retrained model -->
        <div class="note">
          <p>
            Note: Models with a
            <span class="color-box"></span>
            border are retrained models.
          </p>
        </div>
      </div>
    </div>

    <!-- Radar Chart container -->
    <div class="wrapper">
      <div class="chart-box">
        <Radar :data="chartData" :options="chartOptions" ref="chartRef" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { Radar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler } from 'chart.js';
import { useCsvData } from '../composables/useCsvData';
import { useChart, pointLabelImagesPlugin } from '../composables/useChart';

// Register Chart.js core components and custom plugins
ChartJS.register(Title, Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler, pointLabelImagesPlugin);

// 1. Get data loading logic
const { isLoading, errorMessage, csvFiles, selectedCsv, currentCsvData, selectedKit, kits } = useCsvData();

// 2. Get chart logic and pass reactive data in
const {
  chartRef,
  chartData,
  chartOptions,
  modelNames,
  selectedModels,
  modelColors,
  modelColumns,
  selectAllModels,
  clearAllModels,
} = useChart(currentCsvData);

</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 100%; /* Consistent with App */
  /* margin: 0 auto; */
  padding: 0rem;
  background-color: white;
}

.wrapper {
  width: 100%;
  max-width: 100vw; /* Adjust with viewport width to control radar chart size */
  display: flex; /* Use Flexbox for centering */
  justify-content: center; /* Horizontal centering */
  align-items: center; /* Vertical centering (optional) */
}

.chart-box {
  position: relative;
  width: 90%;
  height: 80vw; /* Height adjusts with width */
  max-height: 800px; /* Maximum height limit */
  margin: 0 auto; /* Additional centering assurance */
}

.chart-box canvas {
  width: 100% !important;
  height: 100% !important;
}

/* small screen adjustments */
@media (max-width: 768px) {
  .wrapper {
    max-width: 95vw;
  }
  .chart-box {
    height: 80vw;
    min-height: 300px;
  }
}

@media (max-width: 480px) {
  .wrapper {
    max-width: 98vw;
  }
  .chart-box {
    height: 90vw;
    min-height: 250px;
  }
}

.filters-container {
  display: flex;
  gap: 2rem;
  justify-content: flex-start;
  width: 100%;
  margin-bottom: 0rem;
  flex-wrap: wrap;
  padding: 0rem 0rem 0rem 2rem;
}

.filters fieldset {
  padding: 0.5rem 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: left;
}

.filters legend {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-weight: bold;
}

.button-group {
  display: flex;
  gap: 0.5rem;
}

.toggle-btn {
  padding: 0.2rem 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  color: #000;
}

.toggle-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.model-columns {
  display: flex;
  gap: 1rem;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  padding: 0.3rem 0.6rem;
  border: 2px solid transparent;
  border-radius: 4px;
  transition: all 0.2s ease-in-out;
}

.checkbox input[type="checkbox"],
.checkbox input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.checkbox.selected {
  border-color: #000;
  border-width: 0.2rem;
  background-color: #000;
  color: #fff;
}

.model-columns .checkbox.nomal {
  border-color: #000;
  border-width: 0.2rem;
}

.model-columns .checkbox.retrain {
  border-color: #45b2e0;
}


.model-name {
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  font-weight: bold;
}

.note {
  text-align: left;
}

.note p {
  margin: 0rem 0rem 0rem 1rem;
}


.color-box {
  display: inline-block;
  width: 14px;
  height: 14px;
  background-color: #45b2e0;
  border: 1px solid #ccc;
  margin: 0 4px;
  vertical-align: middle;
}

.error {
  color: red;
  padding: 1rem;
  text-align: center;
  font-weight: bold;
}
</style>
