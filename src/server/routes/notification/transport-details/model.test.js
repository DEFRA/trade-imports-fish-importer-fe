import { transportDetailsModel, transportDetailsSchema } from './model.js'

describe('transport details model', () => {
  test.each([
    '',
    undefined,
    'train',
    'VESSEL',
    'AIR_FREIGHT',
    'ROAD_VEHICLE',
    ['air-freight', 'road-vehicle']
  ])('rejects invalid single selections: %j', (transportMethod) => {
    expect(
      transportDetailsSchema.validate({ transportMethod }).error
    ).toBeDefined()
  })

  test('a valid selection remains selected when another field causes validation failure', () => {
    const model = transportDetailsModel('road-vehicle', true)
    expect(model.radios.items.filter(({ checked }) => checked)).toEqual([
      { text: 'Road vehicle', value: 'road-vehicle', checked: true }
    ])
    expect(model.errorSummary.errorList[0].href).toBe(
      `#${model.radios.idPrefix}`
    )
    expect(model.pageTitle).toBe('Error: Transport details')
  })
})
