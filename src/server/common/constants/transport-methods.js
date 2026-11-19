export const transportMethods = [
  { value: 'ship-or-vessel', text: 'Ship or vessel' },
  { value: 'air-freight', text: 'Air freight' },
  { value: 'road-vehicle', text: 'Road vehicle' }
]

export const transportModes = new Map([
  ['ship-or-vessel', 'VESSEL'],
  ['air-freight', 'AIR_FREIGHT'],
  ['road-vehicle', 'ROAD_VEHICLE']
])

export function toTransportMode(transportMethod) {
  const mode = transportModes.get(transportMethod)
  if (!mode) {
    throw new Error('Unsupported transport method')
  }
  return mode
}

export function toTransportMethod(mode) {
  const method = transportMethods.find(
    ({ value }) => transportModes.get(value) === mode
  )
  if (!method) {
    throw new Error('Unsupported transport mode')
  }
  return method.value
}
