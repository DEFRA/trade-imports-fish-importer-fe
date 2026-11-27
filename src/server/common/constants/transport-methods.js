export const transportModeOptions = [
  { value: 'VESSEL', text: 'Ship or vessel' },
  { value: 'AIR_FREIGHT', text: 'Air freight' },
  { value: 'ROAD_VEHICLE', text: 'Road vehicle' }
]

export const transportModes = transportModeOptions.map(({ value }) => value)
