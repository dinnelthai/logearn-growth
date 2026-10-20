/**
 * @deprecated Mock JSON data mode has been removed.
 * Use backend or API data sources instead.
 */
import {datasetFromJson as fromInput} from './jsonDatasetCore.js'

export function datasetFromJson(input) {
  if (!input) {
    throw new Error(
      'Mock JSON data mode has been removed. ' +
      'Configure VITE_BACKEND_BASE_URL or VITE_ANALYTICS_DATA_SOURCE=api for real data.'
    )
  }
  return fromInput(input)
}

