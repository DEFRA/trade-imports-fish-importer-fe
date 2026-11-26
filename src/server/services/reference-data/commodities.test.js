import { readFileSync } from 'node:fs'

const seededCommodities = JSON.parse(
  readFileSync(new URL('./commodities.json', import.meta.url), 'utf8')
)

async function loadCommodityService(environment, nodeEnv = 'production') {
  vi.stubEnv('ENVIRONMENT', environment)
  vi.stubEnv('NODE_ENV', nodeEnv)
  vi.resetModules()
  const { getCommodities } = await import('./commodities.js')
  return getCommodities
}

describe('commodity reference data', () => {
  let logger

  beforeEach(() => {
    vi.stubEnv('REFERENCE_DATA_API_URL', 'https://reference.example')
    vi.stubEnv('COMMODITIES_PATH', '/commodities')
    logger = { warn: vi.fn() }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('loads and caches valid commodity data from the configured API', async () => {
    const getCommodities = await loadCommodityService('test')
    const data = [
      {
        code: '03021400',
        name: 'Fresh salmon',
        species: [{ faoCode: 'SAL', commonName: 'Atlantic salmon' }]
      }
    ]
    const fetch = vi.fn().mockResolvedValue(Response.json(data))
    vi.stubGlobal('fetch', fetch)

    await expect(getCommodities(logger)).resolves.toEqual(data)
    await expect(getCommodities(logger)).resolves.toEqual(data)
    expect(fetch).toHaveBeenCalledOnce()
  })

  test('rejects invalid species identities and retries after a failed load', async () => {
    const getCommodities = await loadCommodityService('prod')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            code: '03021400',
            name: 'Salmon',
            species: [{ commonName: 'Atlantic salmon' }]
          }
        ])
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            code: '03021400',
            name: 'Salmon',
            species: [{ faoCode: 'SAL', commonName: 'Atlantic salmon' }]
          }
        ])
      )
    vi.stubGlobal('fetch', fetch)

    await expect(getCommodities(logger)).rejects.toThrow(
      'Invalid species reference data'
    )
    await expect(getCommodities(logger)).resolves.toHaveLength(1)
  })

  test('an invalid response falls back to the fixture and is cached locally', async () => {
    const getCommodities = await loadCommodityService('local', 'development')
    const fetch = vi.fn().mockResolvedValue(Response.json({ invalid: true }))
    vi.stubGlobal('fetch', fetch)

    const result = await getCommodities(logger)
    expect(result).toEqual(seededCommodities)
    await expect(getCommodities(logger)).resolves.toBe(result)
    expect(fetch).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalled()
  })

  test.each(['dev', 'test', 'ext-test'])(
    'uses seeded commodities when the API is unavailable in CDP %s',
    async (environment) => {
      const getCommodities = await loadCommodityService(environment)
      const outage = new Error('Reference data API is unavailable')
      const fetch = vi.fn().mockRejectedValue(outage)
      vi.stubGlobal('fetch', fetch)

      await expect(getCommodities(logger)).resolves.toEqual(seededCommodities)
      expect(fetch).toHaveBeenCalledOnce()
      expect(logger.warn).toHaveBeenCalledWith(
        { err: outage },
        expect.any(String)
      )
    }
  )

  test('uses seeded commodities without API configuration in CDP perf-test', async () => {
    vi.stubEnv('REFERENCE_DATA_API_URL', undefined)
    const getCommodities = await loadCommodityService('perf-test')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(getCommodities(logger)).resolves.toEqual(seededCommodities)
    expect(fetch).not.toHaveBeenCalled()
  })

  test.each([undefined, 'prod', 'infra-dev', 'management'])(
    'propagates API failures without using seeded data with ENVIRONMENT=%s',
    async (environment) => {
      const getCommodities = await loadCommodityService(environment)
      const outage = new Error('Reference data API is unavailable')
      const fetch = vi.fn().mockRejectedValue(outage)
      vi.stubGlobal('fetch', fetch)

      await expect(getCommodities(logger)).rejects.toBe(outage)
      expect(fetch).toHaveBeenCalledOnce()
      expect(logger.warn).not.toHaveBeenCalled()
    }
  )

  test('rejects indistinguishable species names in the same commodity', async () => {
    const getCommodities = await loadCommodityService('prod')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json([
          {
            code: '03021400',
            name: 'Salmon',
            species: [
              { faoCode: 'SAL', commonName: 'Salmon' },
              { faoCode: 'TRT', commonName: ' salmon ' }
            ]
          }
        ])
      )
    )
    await expect(getCommodities(logger)).rejects.toThrow(
      'Ambiguous species reference data'
    )
  })

  test('in CDP prod, missing configuration never uses seeded commodities', async () => {
    vi.stubEnv('REFERENCE_DATA_API_URL', undefined)
    const getCommodities = await loadCommodityService('prod', 'development')
    vi.stubGlobal('fetch', vi.fn())
    await expect(getCommodities(logger)).rejects.toThrow(
      'Reference data API URL or commodities path is not set'
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
