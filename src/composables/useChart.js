import { ref, computed, watch } from 'vue'
import { generateColors } from '../utils/chartConfig'
import { getStoredWithExpiry, setStoredWithExpiry } from '../utils/storage'

const custom_maxWidth = 15
const custom_maxModelNumPerColumn = 5
const custom_padding_label_to_point = 0
const point_hover_showing_model_name = true
const maxChartWidth = 1324
const debug_chart = false

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
 * [HELPER] Greedy line wrapping algorithm: Fill each line as much as possible until the next word cannot fit.
 * @param {string[]} words - Array of words.
 * @param {number} maxWidth - Maximum width per line.
 * @returns {string[]} - Array of split lines.
 */
function greedyWrap(words, maxWidth) {
    if (!words || words.length === 0) return ['']
    const lines = []
    let currentLine = words[0]

    for (let i = 1; i < words.length; i++) {
        const word = words[i]
        if ((currentLine + ' ' + word).length > maxWidth) {
            lines.push(currentLine)
            currentLine = word
        } else {
            currentLine += ' ' + word
        }
    }
    lines.push(currentLine) // Push the last line
    return lines
}

/**
 * [HELPER] Ideal split point algorithm (the function we analyzed before).
 * @param {string} label - Original label string.
 * @param {number} maxWidth - Maximum width (may be Infinity in certain cases).
 * @param {number} targetLines - Target number of split lines.
 * @returns {string[]} - An array of wrapped label strings.
 */
function performIdealSplit(label, maxWidth, targetLines) {
    if (!label) return ['']
    // If the target is only 1 line or the string is very short, return directly
    if (targetLines <= 1 || label.length <= maxWidth) return [label]

    const words = label.split(' ')
    if (words.length <= 1) return [label]

    const totalLength = label.length
    // Use the target number of lines to calculate the ideal length
    const idealLength = totalLength / targetLines

    let bestSplitIndex = 0
    let smallestDiff = Infinity
    let currentLength = 0

    for (let i = 0; i < words.length - 1; i++) {
        currentLength += words[i].length + 1
        const diff = Math.abs(currentLength - idealLength)
        if (diff < smallestDiff) {
            smallestDiff = diff
            bestSplitIndex = i + 1
        }
    }

    // If no good split point is found (e.g., only one word), split after the first word
    if (bestSplitIndex === 0) bestSplitIndex = 1

    const firstLine = words.slice(0, bestSplitIndex).join(' ')
    const rest = words.slice(bestSplitIndex).join(' ')

    // Recursive condition: The remaining part is still too long (relative to maxWidth) and there is still budget for more than 1 line
    // Note that here is targetLines > 1 instead of maxLines > 2, which is more clear
    if (rest.length > maxWidth && targetLines > 1) {
        // Recursive call, target number of lines minus 1
        return [firstLine, ...performIdealSplit(rest, maxWidth, targetLines - 1)]
    }

    return [firstLine, rest]
}


/**
 * @param {string} label - The original label string to wrap.
 * @param {number} maxWidth - The maximum number of characters per line.
 * @param {number} maxLines - The maximum number of lines allowed.
 * @returns {string[]} - An array of wrapped label strings.
 */
function wrapLabel(label, maxWidth, maxLines = 3) {
    // 1. Initial boundary check
    if (!label) return ['']
    if (label.length <= maxWidth) return [label]

    const words = label.split(' ')
    if (words.length <= 1) return [label] // Single long word cannot be processed

    // 2. First perform "greedy" line wrapping, check how many lines are needed
    const greedyLines = greedyWrap(words, maxWidth)
    const greedyLinesCount = greedyLines.length

    // 3. Decide based on the new rules
    if (greedyLinesCount <= maxLines) {
        // Case 1: Greedy wrapping does not exceed maxLines limit.
        // We use the "ideal split point" algorithm to beautify the lines within `greedyLinesCount` lines.
        // console.log(`Greedy wrapping needs ${greedyLinesCount} lines (within budget), we use the "ideal split point" algorithm to beautify the lines within ${greedyLinesCount} lines.`);
        return performIdealSplit(label, maxWidth, greedyLinesCount)
    } else {
        // Case 2: Greedy wrapping exceeds maxLines limit.
        // We must give up maxWidth, force split within `maxLines` lines.
        // We set maxWidth to Infinity to let the "ideal split point" algorithm ignore the length limit.
        // console.log(`Greedy wrapping needs ${greedyLinesCount} lines (exceeds budget!), we must force split within ${maxLines} lines.`);
        return performIdealSplit(label, Infinity, maxLines)
    }
}



/**
 * Chart.js plugin for drawing icons next to radar chart labels.
 */
export const pointLabelImagesPlugin = {
    id: 'pointLabelImages',
    afterDraw(chart) {
        // const maxChartWidth = 1200
        // const effectiveWidth = Math.min(window.innerWidth, maxChartWidth)

        const { ctx, scales: { r }, width } = chart
        const labelPositions = r?._pointLabelItems
        const canvas = chart.canvas
        if (!labelPositions || !canvas || !chart.data.labels.length) {
            console.warn('Plugin afterDraw skipped: Invalid labels or labelPositions')
            return
        }

        const debug = debug_chart // debug mode
        // const fontSize = Math.max(10, effectiveWidth / 80)
        const centerX = r.xCenter
        const centerY = r.yCenter
        // const lineHeight = fontSize * 1.2

        // ====== Create the debug panel in the bottom-left corner ======
        if (debug && !document.getElementById('chart-debug-panel')) {
            const panel = document.createElement('div')
            panel.id = 'chart-debug-panel'
            panel.style.position = 'fixed'
            panel.style.bottom = '10px'
            panel.style.left = '10px'
            panel.style.zIndex = 9999
            panel.style.background = 'rgba(255,255,255,0.85)'
            panel.style.padding = '8px 12px'
            panel.style.border = '1px solid #ccc'
            panel.style.borderRadius = '6px'
            panel.style.fontSize = '14px'
            panel.style.fontFamily = 'sans-serif'
            panel.style.lineHeight = '1.5em'

            function addSlider(id, labelText, min, max, value, step) {
                const container = document.createElement('div')
                const label = document.createElement('label')
                label.innerText = `${labelText}: `
                label.style.display = 'inline-block'
                label.style.width = '80px'

                const valueDisplay = document.createElement('span')
                valueDisplay.id = `${id}-value`
                valueDisplay.innerText = value

                const slider = document.createElement('input')
                slider.type = 'range'
                slider.min = String(min)
                slider.max = String(max)
                slider.value = String(value)
                slider.step = String(step)
                slider.id = id
                slider.style.width = '120px'
                slider.oninput = () => {
                    valueDisplay.innerText = slider.value
                    chart.update()
                }

                container.appendChild(label)
                container.appendChild(slider)
                container.appendChild(valueDisplay)
                panel.appendChild(container)
            }

            addSlider('padding-slider', 'Padding', 0, Math.round(width / 5), Math.max(10, width / 30), 1)
            addSlider('imageSize-slider', 'Image size', 10, Math.round(width / 5), Math.max(20, width / 15), 1)

            document.body.appendChild(panel)
        }

        const padding = debug && document.getElementById('padding-slider')
            ? Number(document.getElementById('padding-slider').value)
            : Math.max(10, width / 30)

        const imageSize = debug && document.getElementById('imageSize-slider')
            ? Number(document.getElementById('imageSize-slider').value)
            : Math.max(20, width / 15)
        // ====== END: Create the debug panel in the bottom-left corner ======

        // ====== Update the font settings of ctx to ensure accurate measureText ======
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // ====== Get the font size from the chart configuration ======
        const fontOption = chart.options.scales.r.pointLabels.font
        let fontSize
        if (typeof fontOption.size === 'function') {
            fontSize = fontOption.size({ chart })
        } else {
            fontSize = fontOption.size || 12 // Default font size
        }
        ctx.font = `${fontSize}px sans-serif`
        const lineHeight = fontSize * 1.2


        function getTextBlockSize(lines) {
            const widths = lines.map(line => ctx.measureText(line).width)
            const maxWidth = Math.max(...widths)
            const height = lines.length * lineHeight
            return { maxWidth, height }
        }

        function adjustLabelPosition(x, y, rad, maxWidth, textHeight) {
            let adjX = x
            let adjY = y

            if (Math.cos(rad) > 0.1) {
                adjX += maxWidth / 2
            } else if (Math.cos(rad) < -0.1) {
                adjX -= maxWidth / 2
            }

            if (Math.sin(rad) > 0.1) {
                adjY += textHeight / 2
            } else if (Math.sin(rad) < -0.1) {
                adjY += textHeight / 2
            }

            return { adjX, adjY }
        }

        chart.data.labels.forEach((label, index) => {
            const position = labelPositions[index]
            if (!position) return

            const lines = wrapLabel(label, custom_maxWidth)
            const { maxWidth, height: textHeight } = getTextBlockSize(lines)

            const imageSrc = getIconUrl(label)
            const img = imageCache.value[imageSrc]
            if (!img || !img.complete) {
                console.warn(`Image not loaded for ${label}: ${imageSrc}`)
                return
            }

            const { x, y } = position
            const radOrig = Math.atan2(y - centerY, x - centerX)
            const { adjX, adjY } = adjustLabelPosition(x, y, radOrig, maxWidth, textHeight)
            const radAdj = Math.atan2(adjY - centerY, adjX - centerX)

            const halfWidth = maxWidth / 2
            const halfHeight = textHeight / 2
            const offsetText = Math.abs(Math.cos(radAdj)) * halfWidth + Math.abs(Math.sin(radAdj)) * halfHeight
            const offset = offsetText + imageSize / 2 + padding

            let imageX = adjX + Math.cos(radAdj) * offset - imageSize / 2
            let imageY = adjY + Math.sin(radAdj) * offset - imageSize / 2

            imageX = Math.max(0, Math.min(canvas.width - imageSize, imageX))
            imageY = Math.max(0, Math.min(canvas.height - imageSize, imageY))

            if (debug) {
                ctx.save()
                ctx.strokeStyle = 'rgba(255,0,0,0.5)'
                ctx.lineWidth = 1
                ctx.strokeRect(adjX - halfWidth, adjY - halfHeight, maxWidth, textHeight)

                ctx.strokeStyle = 'rgba(0,0,255,0.5)'
                ctx.strokeRect(imageX, imageY, imageSize, imageSize)

                ctx.strokeStyle = 'rgba(0,255,0,0.5)'
                ctx.beginPath()
                ctx.moveTo(centerX, centerY)
                ctx.lineTo(adjX, adjY)
                ctx.stroke()

                ctx.strokeStyle = 'rgba(255,165,0,0.8)'
                ctx.beginPath()
                ctx.moveTo(adjX, adjY)
                ctx.lineTo(imageX + imageSize / 2, imageY + imageSize / 2)
                ctx.stroke()

                ctx.restore()
            }

            ctx.drawImage(img, imageX, imageY, imageSize, imageSize)
        })
    }
}



/**
 * Manage the logic of the Chart.js radar chart, including data conversion, option configuration, and interaction.
 */
/**
 * @param {import('vue').ComputedRef<object|null>} csvData - The current CSV data.
 * @param {import('vue').Ref<string>} selectedKit - The currently selected Kit.
 * @param {import('vue').Ref<string>} selectedCsv - The currently selected CSV filename.
 */
export function useChart(csvData, selectedKit, selectedCsv) {
    const chartRef = ref(null)
    const modelNames = ref([])
    const selectedModels = ref([])
    const hoveredDatasetIndex = ref(null)

    const maxModelNumPerColumn = custom_maxModelNumPerColumn // Maximum number of models to display per column

    // ✨ 创建一个动态的、唯一的 localStorage 键
    const storageKey = computed(() => {
        if (!selectedKit.value || !selectedCsv.value) return null
        return `selectedModels_${selectedKit.value}_${selectedCsv.value}`
    })
    // This watcher will trigger when csvData is updated, preloading images for all labels

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

        // Sort the models in descending order based on the sum of indicators
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
            fill: false, // do not fill the area under the line
            pointHitRadius: 10,
        }))
    })

    // When the CSV file is switched, all models are selected by default
    watch(baseDatasets, (newDatasets) => {
        console.log('baseDatasets updated:', newDatasets)
        // Restore selectedModels from localStorage
        if (!newDatasets || newDatasets.length === 0) return

        let savedModels = null
        if (storageKey.value) {
            savedModels = getStoredWithExpiry(storageKey.value)
        }
        const validModels = Array.isArray(savedModels) ? savedModels.filter(model => newDatasets.some(ds => ds.label === model)) : []
        selectedModels.value = validModels.length > 0 ? validModels : newDatasets.map(ds => ds.label)
    }, { immediate: true, deep: true })

    // Save selectedModels to localStorage
    watch(selectedModels, (newModels) => {
        if (storageKey.value) {
            setStoredWithExpiry(storageKey.value, newModels)
        }
    }, { deep: true })

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

            const baseOpacity = isHovered ? 0.5 : 0.02
            const backgroundColor = ds.backgroundColor.replace(/, [\d.]+?\)/, `, ${baseOpacity})`)

            return {
                ...ds,
                data: newData,
                borderWidth: isHovered ? 6 : 4,
                pointRadius: isHovered ? 4 : 2,
                pointHoverRadius: 6,
                borderColor: isHovered ? ds.borderColor : ds.borderColor.replace('hsl', 'hsla').replace(')', ', 0.3)'),
                backgroundColor,
                fill: isHovered
            }
        })

        console.log('chartData: finalDatasets', finalDatasets)
        return {
            labels: chartLabels,
            datasets: finalDatasets,
        }
    })

    // Chart configuration
    const chartOptions = computed(() => {
        return {
            responsive: true,
            maintainAspectRatio: false,

            // Fix #1: Change layout.padding to a scriptable option
            layout: {
                padding: (context) => {
                    // context.chart.width -> the real-time calculated canvas width by Chart.js
                    const effectiveWidth = Math.min(context.chart.width, maxChartWidth)
                    return Math.max(100, effectiveWidth / 10)
                }
            },

            interaction: {
                mode: 'point',
                intersect: true,
            },
            scales: {
                r: {
                    min: -0.25,
                    max: 1,
                    grid: { circular: false }, /* Changed to polylines */
                    pointLabels: {
                        // Fix #2: Change font.size to a scriptable option
                        font: {
                            size: (context) => {
                                const effectiveWidth = Math.min(context.chart.width, maxChartWidth)
                                return Math.max(10, effectiveWidth / 80)
                            }
                        },
                        padding: custom_padding_label_to_point,
                        callback: function (label) {
                            // The maximum width per line is `${custom_maxWidth}` characters, which can be adjusted as needed
                            return wrapLabel(label, custom_maxWidth)
                        }
                    },
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
                        title: () => '', // remove title
                        // label: (ctx) => `${ctx.label.toString().replace(/,/g, ' ')}: ${Number(ctx.raw).toFixed(4)}` // Merge multi-line labels and format tooltip label: 4 decimal places
                        // label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.raw).toFixed(4)}` // model name and format tooltip label: 4 decimal places
                        label: (ctx) => {
                            if (point_hover_showing_model_name) {
                                return `${ctx.dataset.label}: ${Number(ctx.raw).toFixed(4)}` // model name and format tooltip label: 4 decimal places
                            } else {
                                return `${ctx.label.toString().replace(/,/g, ' ')}: ${Number(ctx.raw).toFixed(4)}` // Merge multi-line labels and format tooltip label: 4 decimal places
                            }
                        }
                    }
                },
                pointLabelImages: pointLabelImagesPlugin, // Enable plugin if icons are needed, otherwise comment out this line
            },
            onHover: (event, chartElements) => {
                hoveredDatasetIndex.value = chartElements.length > 0 ? chartElements[0].datasetIndex : null
            }
        }
    })

    function selectAllModels() {
        selectedModels.value = [...modelNames.value]
    }

    function clearAllModels() {
        selectedModels.value = []
    }

    const modelColors = computed(() => {
        const map = {}
        baseDatasets.value.forEach(ds => {
            map[ds.label] = ds.borderColor
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
