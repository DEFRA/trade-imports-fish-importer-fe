import { readFile } from 'node:fs/promises'

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal()
  return { ...fs, readFile: vi.fn(fs.readFile) }
})

describe('commodity reference data', () => {
  let getCommodities

  beforeEach(async () => {
    vi.resetModules()
    readFile.mockReset()
    vi.stubEnv('REFERENCE_DATA_API_URL', '')
    vi.stubEnv('COMMODITIES_PATH', '')
    vi.stubGlobal('fetch', vi.fn())
    ;({ getCommodities } = await import('./commodities.js'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test.each(['development', 'production'])(
    'loads and caches the bundled data without an API in %s mode',
    async (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv)
      vi.resetModules()
      ;({ getCommodities } = await import('./commodities.js'))

      const result = await getCommodities()
      const { readFile: readActualFile } =
        await vi.importActual('node:fs/promises')
      const expected = JSON.parse(
        await readActualFile(
          new URL('./commodities.json', import.meta.url),
          'utf8'
        )
      )

      expect(result).toEqual(expected)
      await expect(getCommodities()).resolves.toBe(result)
      expect(readFile).toHaveBeenCalledOnce()
      expect(fetch).not.toHaveBeenCalled()
    }
  )

  test('rejects invalid species identities and retries after a failed load', async () => {
    readFile
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            code: '03021400',
            name: 'Salmon',
            species: [{ commonName: 'Atlantic salmon' }]
          }
        ])
      )
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            code: '03021400',
            name: 'Salmon',
            species: [{ faoCode: 'SAL', commonName: 'Atlantic salmon' }]
          }
        ])
      )

    await expect(getCommodities()).rejects.toThrow(
      'Invalid species reference data'
    )
    await expect(getCommodities()).resolves.toHaveLength(1)
  })

  test('propagates file read errors and retries after a failed load', async () => {
    const error = new Error('Cannot read commodity data')
    readFile.mockRejectedValueOnce(error)

    await expect(getCommodities()).rejects.toBe(error)
    await expect(getCommodities()).resolves.toEqual(expect.any(Array))
  })

  test('rejects indistinguishable species names in the same commodity', async () => {
    readFile.mockResolvedValueOnce(
      JSON.stringify([
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
    await expect(getCommodities()).rejects.toThrow(
      'Ambiguous species reference data'
    )
  })
})
