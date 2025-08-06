import { ref, computed, watch } from 'vue'
import { preferredCsvOrder } from '../utils/chartConfig'
import { getStoredWithExpiry, setStoredWithExpiry } from '../utils/storage'

/**
 * Parses a CSV string into a structured JSON object.
 * @param {string} csv - CSV file content.
 * @returns {object|null} - Parsed data object or null if an error occurs.
 */
function csvToJson(csv) {
    try {
        const lines = csv.trim().split('\n')
        if (lines.length < 2) throw new Error('CSV file is empty or invalid')

        const labels = lines[0].split(',').slice(1).map(label => label.trim())
        if (!labels.length) throw new Error('No label row found in CSV')

        const modelData = {}
        const sortData = {} // Data for sorting, 'NA' values are treated as 0

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',')
            // Error tolerance: skip the line if the number of columns doesn't match
            if (cols.length !== labels.length + 1) continue

            const modelName = cols[0].trim()
            // const values = cols.slice(1).map(val => Number(val)) // 'NA' --> NaN
            const values = cols.slice(1).map(val => (val.trim().toUpperCase() === 'NA' ? 0 : Number(val))) // 'NA' --> 0
            const sortValues = cols.slice(1).map(val => (val.trim().toUpperCase() === 'NA' ? 0 : Number(val))) // 'NA' --> 0

            modelData[modelName] = values
            sortData[modelName] = sortValues
        }
        console.log('csvToJson result:', { labels, data: modelData, sortData })
        return { labels, data: modelData, sortData }
    } catch (error) {
        console.error(`CSV parsing error: ${error.message}`)
        return null
    }
}

/**
 * Extracts the kit version from a CSV file name.
 * @param {string} fileName - CSV filename
 * @returns {string} - Kit name (e.g., 'SQK-RNA002') or 'No Kit'
 */
function getKitFromFileName(fileName) {
    const match = fileName.match(/_(\d{3})\.csv$/)
    if (match) {
        return `SQK-RNA${match[1]}`
    }
    return 'No Kit'
}


/**
 * A composable function for handling CSV data loading, kit classification, and state management.
 */
export function useCsvData() {
    const errorMessage = ref(null)
    const csvDataCache = ref({}) // Cache all parsed CSV data
    const csvFiles = ref([])
    const selectedCsv = ref(null)
    const isLoading = ref(true)
    const selectedKit = ref(null)
    const kits = ref([])
    const kitFiles = ref({})

    // Vite's import.meta.glob dynamically loads all .csv files in the src/data/ directory
    const modules = import.meta.glob('../data/*.csv', { query: '?raw', import: 'default', eager: true })

    try {
        const availableFiles = Object.keys(modules).map(path => path.split('/').pop())

        if (availableFiles.length === 0) {
            throw new Error('No CSV files found in the `src/data` directory.')
        }

        // Classify CSV files by kit
        const kitMap = {}
        availableFiles.forEach(file => {
            const kit = getKitFromFileName(file)
            if (!kitMap[kit]) {
                kitMap[kit] = []
            }
            kitMap[kit].push(file)
        })

        // Sort kits and CSV files
        kits.value = Object.keys(kitMap).sort((a, b) => {
            if (a === 'No Kit') return 1
            if (b === 'No Kit') return -1
            return a.localeCompare(b)
        })

        kitFiles.value = kitMap

        // Default selected kit
        // selectedKit.value = kits.value[0] || 'No Kit'
        // 从 localStorage 恢复 selectedKit
        const savedKit = getStoredWithExpiry('selectedKit')
        selectedKit.value = kits.value.includes(savedKit) ? savedKit : kits.value[0] || 'No Kit'



        // Filter CSV files; sort by preferredCsvOrder, then alphabetically if not specified
        const filteredCsvFiles = computed(() => {
            const files = kitFiles.value[selectedKit.value] || []
            return files.sort((a, b) => {
            const indexA = preferredCsvOrder.indexOf(a)
            const indexB = preferredCsvOrder.indexOf(b)
            if (indexA === -1 && indexB === -1) return a.localeCompare(b)
            if (indexA === -1) return 1
            if (indexB === -1) return -1
            return indexA - indexB
        })
        })

        // Update csvFiles when selectedKit changes
        watch(filteredCsvFiles, (newFiles) => {
            csvFiles.value = newFiles
            const savedCsv = getStoredWithExpiry('selectedCsv')
            if (newFiles.length > 0) {
                selectedCsv.value = newFiles.includes(savedCsv) ? savedCsv : newFiles[0]
            } else {
                selectedCsv.value = null
            }
        }, { immediate: true })

        // Save selectedKit and selectedCsv to localStorage (1 hour expiry)
        watch(selectedKit, (newKit) => {
            setStoredWithExpiry('selectedKit', newKit)
        })

        watch(selectedCsv, (newCsv) => {
            if (newCsv) {
                setStoredWithExpiry('selectedCsv', newCsv)
            }
        })

        // 加载 CSV 数据
        for (const path in modules) {
            const fileName = path.split('/').pop()
            const content = modules[path]
            if (content) {
                csvDataCache.value[fileName] = csvToJson(content)
            }
        }
    } catch (error) {
        errorMessage.value = `Initialization failed: ${error.message}`
        console.error(error)
    } finally {
        isLoading.value = false
    }

    // Computed property, returns the parsed data of the currently selected CSV
    const currentCsvData = computed(() => {
        if (selectedCsv.value && csvDataCache.value[selectedCsv.value]) {
            return csvDataCache.value[selectedCsv.value]
        }
        return null
    })

    return {
        isLoading,
        errorMessage,
        csvFiles,
        selectedCsv,
        currentCsvData,
        selectedKit,
        kits,
    }
}
