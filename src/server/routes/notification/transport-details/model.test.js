import { transportDetailsModel, transportDetailsSchema } from './model.js'

describe('transport details model', () => {
  const journeyId = '00000000-0000-4000-8000-000000000001'

  test.each([
    '',
    undefined,
    'train',
    'ship-or-vessel',
    'air-freight',
    'road-vehicle',
    ['AIR_FREIGHT', 'ROAD_VEHICLE']
  ])('rejects invalid single selections: %j', (transportMethod) => {
    expect(
      transportDetailsSchema.validate({ journeyId, transportMethod }).error
        ?.details[0].path
    ).toEqual(['transportMethod'])
  })

  test('a valid selection remains selected when another field causes validation failure', () => {
    const model = transportDetailsModel('ROAD_VEHICLE', true)
    expect(model.radios.items.filter(({ checked }) => checked)).toEqual([
      { text: 'Road vehicle', value: 'ROAD_VEHICLE', checked: true }
    ])
    expect(model.errorSummary.errorList[0].href).toBe(
      `#${model.radios.idPrefix}`
    )
    expect(model.pageTitle).toBe('Error: Transport details')
  })
})
