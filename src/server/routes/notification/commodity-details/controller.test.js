import {
  getCommodityDetailsController,
  postCommodityDetailsController
} from './controller.js'
import { getCommodities } from '#/server/services/reference-data/commodities.js'
import {
  loadDraft,
  saveCommodities
} from '#/server/services/notifications/draft-session.js'

vi.mock('#/server/services/reference-data/commodities.js', () => ({
  getCommodities: vi.fn()
}))

vi.mock('#/server/services/notifications/draft-session.js', () => ({
  loadDraft: vi.fn(),
  saveCommodities: vi.fn()
}))

const commodities = [
  {
    commodityCode: '03021400',
    description: 'Fresh salmon',
    species: [
      {
        speciesCode: 'SAL',
        commonName: 'Atlantic salmon',
        scientificName: 'Salmo salar',
        netWeightKg: 500
      }
    ],
    totalNetWeightKg: 500
  }
]

const referenceData = [
  {
    code: '03021400',
    name: 'Fresh salmon',
    species: [
      {
        faoCode: 'SAL',
        commonName: 'Atlantic salmon',
        scientificName: 'Salmo salar'
      }
    ]
  },
  {
    code: '03025100',
    name: 'Fresh cod',
    species: [
      { faoCode: 'COD', commonName: 'Atlantic cod', scientificName: null }
    ]
  }
]

describe('commodity details controllers', () => {
  let request
  let response
  let h

  beforeEach(() => {
    vi.resetAllMocks()
    getCommodities.mockResolvedValue(referenceData)
    request = {
      headers: { accept: 'application/json' },
      logger: { error: vi.fn() },
      payload: { commodities: JSON.stringify(commodities) }
    }
    response = {
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis()
    }
    h = {
      view: vi.fn().mockReturnValue(response),
      redirect: vi.fn().mockReturnValue(response),
      response: vi.fn().mockReturnValue(response)
    }
  })

  test('renders reference data and saved commodities', async () => {
    loadDraft.mockResolvedValue({ commodities })

    await getCommodityDetailsController.handler(request, h)

    expect(h.view).toHaveBeenCalledWith(
      'notification/commodity-details/index',
      {
        pageTitle: 'Tell us about the seafood you are importing',
        referenceData: JSON.stringify(referenceData),
        savedCommodities: JSON.stringify(commodities)
      }
    )
  })

  test('blocks the page when reference data is unavailable', async () => {
    const error = new Error('Unavailable')
    getCommodities.mockRejectedValue(error)

    await getCommodityDetailsController.handler(request, h)

    expect(request.logger.error).toHaveBeenCalledWith(
      { err: error },
      'Reference data unavailable'
    )
    expect(loadDraft).not.toHaveBeenCalled()
    expect(h.view).toHaveBeenCalledWith(
      'error/index',
      expect.objectContaining({ heading: 'Commodity service unavailable' })
    )
    expect(response.code).toHaveBeenCalledWith(503)
  })

  test('saves canonical codes and labels with the submitted weights', async () => {
    request.payload.commodities = JSON.stringify([
      {
        commodityCode: ' 03021400 ',
        description: 'Submitted salmon description',
        species: [
          {
            speciesCode: ' sal ',
            commonName: 'Submitted salmon name',
            scientificName: 'Submitted scientific name',
            netWeightKg: 500
          }
        ],
        totalNetWeightKg: 500
      },
      {
        commodityCode: '03025100',
        species: [
          {
            speciesCode: 'COD',
            commonName: 'Submitted cod name',
            scientificName: 'Submitted scientific name',
            netWeightKg: 300
          }
        ],
        totalNetWeightKg: 300
      }
    ])

    await postCommodityDetailsController.handler(request, h)

    expect(getCommodities).toHaveBeenCalledWith(request.logger)
    expect(saveCommodities).toHaveBeenCalledOnce()
    expect(saveCommodities.mock.calls[0][0]).toBe(request)
    expect(saveCommodities.mock.calls[0][1]).toStrictEqual([
      ...commodities,
      {
        commodityCode: '03025100',
        description: 'Fresh cod',
        species: [
          { speciesCode: 'COD', commonName: 'Atlantic cod', netWeightKg: 300 }
        ],
        totalNetWeightKg: 300
      }
    ])
    expect(h.response).toHaveBeenCalledWith({ success: true })
    expect(response.type).toHaveBeenCalledWith('application/json')
    expect(response.code).toHaveBeenCalledWith(200)
  })

  test.each([
    'not json',
    '[]',
    JSON.stringify([{ ...commodities[0], totalNetWeightKg: 1 }]),
    JSON.stringify([commodities[0], commodities[0]])
  ])('rejects invalid commodities without saving: %s', async (value) => {
    request.payload.commodities = value

    await postCommodityDetailsController.handler(request, h)

    expect(saveCommodities).not.toHaveBeenCalled()
    expect(h.response).toHaveBeenCalledWith({
      message: 'Check the commodity details and try again.'
    })
    expect(response.code).toHaveBeenCalledWith(400)
  })

  test('rejects duplicate species codes regardless of casing or whitespace', async () => {
    const [commodity] = commodities
    const [species] = commodity.species
    request.payload.commodities = JSON.stringify([
      {
        ...commodity,
        species: [species, { ...species, speciesCode: ' sal ' }],
        totalNetWeightKg: species.netWeightKg * 2
      }
    ])

    await postCommodityDetailsController.handler(request, h)

    expect(response.code).toHaveBeenCalledWith(400)
    expect(saveCommodities).not.toHaveBeenCalled()
  })

  test.each([
    ['an unknown commodity', '00000000', 'SAL'],
    ['an unknown species', '03021400', 'ZZZ'],
    ['a species listed under a different commodity', '03021400', 'COD']
  ])(
    'rejects %s without saving',
    async (_label, commodityCode, speciesCode) => {
      const [commodity] = commodities
      request.payload.commodities = JSON.stringify([
        {
          ...commodity,
          commodityCode,
          species: [{ ...commodity.species[0], speciesCode }]
        }
      ])

      await postCommodityDetailsController.handler(request, h)

      expect(saveCommodities).not.toHaveBeenCalled()
      expect(h.response).toHaveBeenCalledWith({
        message: 'Check the commodity details and try again.'
      })
      expect(response.code).toHaveBeenCalledWith(400)
    }
  )

  test('does not save when reference data is unavailable', async () => {
    const error = new Error('Reference data unavailable')
    getCommodities.mockRejectedValue(error)

    await postCommodityDetailsController.handler(request, h)

    expect(saveCommodities).not.toHaveBeenCalled()
    expect(request.logger.error).toHaveBeenCalledWith(
      { err: error },
      'Failed to save commodities'
    )
    expect(response.code).toHaveBeenCalledWith(500)
  })

  test('returns a conflict message when the save conflicts', async () => {
    const error = Object.assign(new Error('Draft conflict'), {
      statusCode: 409
    })
    saveCommodities.mockRejectedValue(error)

    await postCommodityDetailsController.handler(request, h)

    expect(request.logger.error).toHaveBeenCalledWith(
      { err: error },
      'Failed to save commodities'
    )
    expect(h.response).toHaveBeenCalledWith({ message: 'Draft conflict' })
    expect(response.code).toHaveBeenCalledWith(409)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  test('reports an unconfirmed save without claiming that nothing was saved', async () => {
    saveCommodities.mockRejectedValue(new Error('Response mismatch'))

    await postCommodityDetailsController.handler(request, h)

    expect(h.response).toHaveBeenCalledWith({
      message:
        'We could not confirm that your commodity details were saved. Try again later.'
    })
    expect(response.type).toHaveBeenCalledWith('application/json')
    expect(response.code).toHaveBeenCalledWith(500)
    expect(h.redirect).not.toHaveBeenCalled()
  })
})
