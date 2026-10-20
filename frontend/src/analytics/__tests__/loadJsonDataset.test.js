import {test,expect} from 'vitest'
import {loadJsonDataset} from '../loadJsonDataset.js'
import {datasetFromJson} from '../jsonDataset.js'

test.skip('Mock JSON data mode has been removed', () => {
  // These tests are skipped because mock JSON data files have been removed.
  // The application now requires VITE_BACKEND_BASE_URL or VITE_ANALYTICS_DATA_SOURCE=api.
})

test('loadJsonDataset throws clear error when called', async () => {
  await expect(loadJsonDataset()).rejects.toThrow('Mock JSON data mode has been removed')
})

test('datasetFromJson throws clear error when called without input', () => {
  expect(() => datasetFromJson()).toThrow('Mock JSON data mode has been removed')
})

