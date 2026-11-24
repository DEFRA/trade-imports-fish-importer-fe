describe('commodity reference data', () => {
  let config
  let getCommodities
  let logger

  beforeEach(async () => {
    vi.resetModules()
    ;({ config } = await import('#/config/config.js'))
    ;({ getCommodities } = await import('./commodities.js'))
    config.set('referenceDataApiUrl', 'https://reference.example')
    config.set('commoditiesPath', '/commodities')
    config.set('isDevelopment', false)
    logger = { warn: vi.fn() }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('loads and caches valid commodity data from the configured API', async () => {
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

    await expect(getCommodities(logger)).rejects.toThrow()
    await expect(getCommodities(logger)).resolves.toHaveLength(1)
  })

  test('in development an invalid response falls back to the fixture and is cached', async () => {
    config.set('isDevelopment', true)
    const fetch = vi.fn().mockResolvedValue(Response.json({ invalid: true }))
    vi.stubGlobal('fetch', fetch)

    const result = await getCommodities(logger)
    expect(result.length).toBeGreaterThan(200)
    expect(result[0]).toHaveProperty('code')
    await expect(getCommodities(logger)).resolves.toBe(result)
    expect(fetch).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalled()
  })

  test('rejects indistinguishable species names in the same commodity', async () => {
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

  test('outside development missing configuration does not use mock data', async () => {
    config.set('referenceDataApiUrl', '')
    vi.stubGlobal('fetch', vi.fn())
    await expect(getCommodities(logger)).rejects.toThrow(
      'Reference data API URL or commodities path is not set'
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
