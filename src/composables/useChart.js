import { ref, computed, watch } from 'vue'
import { generateColors, hexToHsl } from '../utils/chartConfig'

// Image cache
const imageCache = ref({})

// Get icon URL
function getIconUrl(label) {
    const imageName = label.toLowerCase().replace(/\s+/g, '') + '.png'
    return new URL(`../assets/icons/${imageName}`, import.meta.url).href
}

// Preload images
function preloadImages(labels) {
    labels.forEach(label => {
        const imageSrc = getIconUrl(label)
        if (!imageCache.value[imageSrc]) {
            const img = new Image()
            img.src = imageSrc
            img.onload = () => {
                setTimeout(() => {
                imageCache.value[imageSrc] = img
                console.log(`Loaded image for ${label}: ${imageSrc}, complete: ${img.complete}`)
                }, 100)
            }
            img.onerror = () => {
                console.error(`Failed to load image for ${label}: ${imageSrc}`)
            }
            imageCache.value[imageSrc] = img // Immediate cache, even if not loaded
        }
    })
}

/**
 * Chart.js plugin for drawing icons next to radar chart labels.
 */
export const pointLabelImagesPlugin = {
    id: 'pointLabelImages',
    afterDraw(chart) {
        console.log('Plugin afterDraw triggered', {
            labels: chart.data.labels,
            labelPositions: chart.scales.r?._pointLabelItems
        })
        const { ctx, scales: { r }, width } = chart
        const labels = chart.data.labels
        const labelPositions = r?._pointLabelItems
        const canvas = chart.canvas
        if (!labelPositions || !canvas || !labels.length) {
            console.warn('Plugin afterDraw skipped: Invalid labels or labelPositions', {
                labels,
                labelPositions,
                canvas
            })
            return
        }

        // Dynamically adjust icon size and spacing
        const imageSize = Math.max(20, width / 15) // Adjust image size with canvas width
        const fontSize = Math.max(10, Math.min(width / 40, 14))
        const padding = Math.max(10, width / 30)
        const centerX = r.xCenter
        const centerY = r.yCenter

        ctx.font = `${fontSize}px sans-serif`

        labels.forEach((label, index) => {
            // Use getIconUrl directly to avoid relying on labelImageMap
            const imageSrc = getIconUrl(label)
            if (!imageSrc || !imageCache.value[imageSrc]) {
                console.warn(`No image for label: ${label}`)
                return
            }

            const img = imageCache.value[imageSrc]
            if (img && img.complete) {
                const { x, y, textAlign } = labelPositions[index]
                const textWidth = ctx.measureText(label).width
                const rad = Math.atan2(y - centerY, x - centerX)
                let imageX = x + Math.cos(rad) * (textWidth + padding * 3) - imageSize / 2
                let imageY = y + Math.sin(rad) * (padding * 2) - imageSize / 2

                // Limit the image position to stay within the canvas boundaries
                imageX = Math.max(0, Math.min(canvas.width - imageSize, imageX))
                imageY = Math.max(0, Math.min(canvas.height - imageSize, imageY))

                ctx.drawImage(img, imageX, imageY, imageSize, imageSize)
                console.log(`Drawing image: ${imageSrc} at x: ${imageX}, y: ${imageY}, size: ${imageSize}, label: ${label}`)
            } else {
                console.warn(`Image not loaded for ${label}: ${imageSrc}`)
            }
        })
    }
}

// --- Composable Main Body ---

/**
 * Manages the logic for a Chart.js radar chart, including data conversion, option configuration, and interaction.
 * @param {import('vue').ComputedRef<object|null>} csvData - The current CSV data from useCsvData.
 */
export function useChart(csvData) {
    const chartRef = ref(null)
    const modelNames = ref([])
    const selectedModels = ref([])
    const hoveredDatasetIndex = ref(null)

    const maxModelNumPerColumn = 5 // Maximum number of models to display per column

    // 调试 csvData
    watch(csvData, (newCsvData) => {
        console.log('csvData updated:', newCsvData)
        if (newCsvData?.labels) {
            preloadImages(newCsvData.labels)
        }
    }, { immediate: true })

    // Label to image mapping
    // const labelImageMap = computed(() => {
    //     const map = {}
    //     if (csvData.value?.labels) {
    //         csvData.value.labels.forEach(label => {
    //             map[label] = getIconUrl(label)
    //         })
    //     }
    //     return map
    // })

    // Core Optimization Part 1: Create a basic dataset
    // This computed property will only be recalculated when csvData (i.e., the selected CSV file) changes
    const baseDatasets = computed(() => {
        if (!csvData.value) {
            console.warn('baseDatasets: csvData is null')
            return []
        }

        const { data: modelData, sortData } = csvData.value
        console.log('baseDatasets: modelData', modelData)

        // 按指标总和对模型进行降序排序
        const modelSums = Object.entries(sortData)
            .filter(([name]) => !name.includes('Max') && !name.includes('Min'))
            .map(([name, values]) => ({
                name,
                sum: values.reduce((acc, val) => acc + (isNaN(val) ? 0 : val), 0),
            }))
            .sort((a, b) => b.sum - a.sum)

        const sortedModelNames = modelSums.map(({ name }) => name)
        modelNames.value = sortedModelNames
        console.log('baseDatasets: sortedModelNames', sortedModelNames)

        const colors = generateColors(sortedModelNames.length, sortedModelNames)

        return sortedModelNames.map((name, i) => ({
            label: name,
            data: modelData[name] || [],
            borderColor: colors[i],
            backgroundColor: colors[i].replace('hsl', 'hsla').replace(')', ', 0.2)'),
            pointBackgroundColor: colors[i],
            fill: true,
            pointHitRadius: 10,
        }))
    })

    // When the CSV file is switched, all models are selected by default
    watch(baseDatasets, (newDatasets) => {
        console.log('baseDatasets updated:', newDatasets)
        selectedModels.value = newDatasets.map(ds => ds.label)
    }, { immediate: true })

    // Core Optimization Part 2: chartData's computation is highly efficient
    // It only filters and applies interaction styles, not data parsing and sorting
    const chartData = computed(() => {
        if (!csvData.value || !baseDatasets.value.length) {
            console.warn('chartData: Invalid csvData or baseDatasets')
            return { labels: [], datasets: [] }
        }

        const originalLabels = csvData.value.labels
        const chartLabels = originalLabels.length > 0
            ? [originalLabels[0], ...originalLabels.slice(1).reverse()]
            : []
        console.log('chartData: chartLabels', chartLabels)

        const visibleDatasets = baseDatasets.value.filter(ds => selectedModels.value.includes(ds.label))

        const finalDatasets = visibleDatasets.map((ds, i) => {
            const isHovered = hoveredDatasetIndex.value === i
            const newData = ds.data.length > 0
                ? [ds.data[0], ...ds.data.slice(1).reverse()]
                : []

            const baseOpacity = isHovered ? 0.2 : 0.02
            const backgroundColor = ds.backgroundColor.replace(/, [\d.]+?\)/, `, ${baseOpacity})`)

            return {
                ...ds,
                data: newData,
                borderWidth: isHovered ? 6 : 4,
                pointRadius: isHovered ? 4 : 2,
                pointHoverRadius: 6,
                borderColor: isHovered ? ds.borderColor : ds.borderColor.replace('hsl', 'hsla').replace(')', ', 0.3)'),
                backgroundColor,
            }
        })

        console.log('chartData: finalDatasets', finalDatasets)
        return {
            labels: chartLabels,
            datasets: finalDatasets,
        }
    })

    // Chart configuration
    const chartOptions = computed(() => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: Math.max(100, window.innerWidth / 10) }, // Dynamic padding
        interaction: {
            mode: 'point',
            intersect: true,
        },
        scales: {
            r: {
                min: -0.25,
                max: 1,
                grid: { circular: false }, /* Changed to polylines */
                pointLabels: { font: { size: Math.max(10, window.innerWidth / 80) }, padding: 20 },
                ticks: {
                    stepSize: 0.25,
                    callback: value => (value >= 0 ? value : null)
                }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: () => '', // Remove title
                    label: (ctx) => `${ctx.label}: ${Number(ctx.raw).toFixed(4)}` // Format tooltip label: 4 decimal places
                }
            },
            pointLabelImages: pointLabelImagesPlugin, // Enable plugin if icons are needed, otherwise comment out this line
        },
        onHover: (event, chartElements) => {
            if (chartElements.length > 0) {
                hoveredDatasetIndex.value = chartElements[0].datasetIndex
            } else {
                hoveredDatasetIndex.value = null
            }
        }
    }))

    function selectAllModels() {
        selectedModels.value = [...modelNames.value]
    }

    function clearAllModels() {
        selectedModels.value = []
    }

    const modelColors = computed(() => {
        const map = {}
        baseDatasets.value.forEach(ds => {
            map[ds.label] = ds.textColor || ds.borderColor
        })
        return map
    })

    const modelColumns = computed(() => {
        const models = modelNames.value
        const columns = []
        const columnCount = Math.ceil(models.length / maxModelNumPerColumn)
        for (let i = 0; i < columnCount; i++) {
            columns.push(models.slice(i * maxModelNumPerColumn, (i + 1) * maxModelNumPerColumn))
        }
        return columns
    })

    return {
        chartRef,
        chartData,
        chartOptions,
        modelNames,
        selectedModels,
        modelColors,
        modelColumns,
        selectAllModels,
        clearAllModels,
    }
}
