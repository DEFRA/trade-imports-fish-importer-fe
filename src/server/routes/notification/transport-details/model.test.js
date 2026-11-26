import { transportDetailsModel, transportDetailsSchema } from './model.js'

describe('transport details model', () => {
  const journeyId = '00000000-0000-4000-8000-000000000001'

  test.each(['', undefined, 'train', ['air-freight', 'road-vehicle']])(
    'rejects invalid single selections: %j',
    (transportMethod) => {
      expect(
        transportDetailsSchema.validate({ journeyId, transportMethod }).error
          ?.details[0].path
      ).toEqual(['transportMethod'])
    }
  )

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
