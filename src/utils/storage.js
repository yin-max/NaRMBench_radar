const custom_expiry_minutes = 10

/**
 * Checks if the localStorage data has expired.
 * @param {string} key - localStorage key.
 * @returns {any|null} - Data value or null.
 */
export function getStoredWithExpiry(key) {
    const itemStr = localStorage.getItem(key)
    if (!itemStr) return null

    try {
        const item = JSON.parse(itemStr)
        // Check if it is a new format ({ value, expiry })
        if (item && typeof item === 'object' && 'value' in item && 'expiry' in item) {
            const now = new Date().getTime()
            if (now > item.expiry) {
                localStorage.removeItem(key)
                return null
            }
            return item.value
        }
        // Compatible with old format (direct JSON array)
        console.warn(`Legacy format detected for ${key}: ${itemStr}`)
        // Migrate legacy format
        setStoredWithExpiry(key, item)
        return item
    } catch (error) {
        console.error(`Failed to parse ${key} from localStorage: ${error.message}`)
        return null
    }
}

/**
 * Save data to localStorage and set expiry time.
 * @param {string} key - localStorage key.
 * @param {any} value - The value to save.
 * @param {number} ttl - Time to live in milliseconds. Defaults to custom setting.
 */
export function setStoredWithExpiry(key, value, ttl = custom_expiry_minutes * 60 * 1000) {
    const item = {
        value,
        expiry: new Date().getTime() + ttl,
    }
    localStorage.setItem(key, JSON.stringify(item))
}