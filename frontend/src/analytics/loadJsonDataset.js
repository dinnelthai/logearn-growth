/**
 * @deprecated Mock JSON data mode has been removed.
 * Configure VITE_BACKEND_BASE_URL or VITE_ANALYTICS_DATA_SOURCE=api instead.
 */
export async function loadJsonDataset() {
  throw new Error(
    'Mock JSON data mode has been removed. ' +
    'Please configure VITE_BACKEND_BASE_URL for backend data or VITE_ANALYTICS_DATA_SOURCE=api for direct API mode.'
  )
}

