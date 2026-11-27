import chedReference from './ched-reference.js'

function createPage({ chedError = false, otherError = false } = {}) {
  const container = { hidden: false }
  const country = {
    options: [
      { dataset: {} },
      { dataset: { restOfWorld: 'true' } },
      { dataset: { restOfWorld: 'false' } },
      { dataset: { restOfWorld: 'true' } }
    ],
    selectedIndex: 1,
    addEventListener: vi.fn()
  }
  let describedBy = 'ched-reference-hint'
  if (chedError) {
    describedBy += ' ched-reference-error'
  }
  const formGroup = { classList: { remove: vi.fn() } }
  const reference = {
    value: chedError ? 'invalid reference' : 'CHEDP.XI.2025.1234567',
    classList: { remove: vi.fn() },
    closest: vi.fn(() => formGroup),
    getAttribute: vi.fn(() => describedBy),
    setAttribute: vi.fn((name, value) => {
      describedBy = value
    }),
    removeAttribute: vi.fn(() => {
      describedBy = null
    })
  }
  let inlineErrorExists = chedError
  let summaryLinkExists = chedError
  const error = {
    remove: vi.fn(() => {
      inlineErrorExists = false
    })
  }
  const item = {
    remove: vi.fn(() => {
      summaryLinkExists = false
    })
  }
  const summary = {
    querySelector: vi.fn(() => (otherError ? {} : null)),
    remove: vi.fn()
  }
  const errorLink = {
    closest: vi.fn((selector) => (selector === 'li' ? item : summary))
  }
  const document = {
    title: chedError ? 'Error: Consignment details' : 'Consignment details',
    querySelector: vi.fn((selector) =>
      selector === '[data-module="app-ched-reference"]'
        ? container
        : summaryLinkExists
          ? errorLink
          : null
    ),
    getElementById: vi.fn((id) => {
      if (id === 'country-of-export') return country
      if (id === 'ched-reference') return reference
      if (id === 'ched-reference-error') return inlineErrorExists ? error : null
    })
  }
  vi.stubGlobal('document', document)
  chedReference.init()

  const onChange = country.addEventListener.mock.calls.find(
    ([event]) => event === 'change'
  )[1]

  return {
    container,
    document,
    error,
    formGroup,
    item,
    reference,
    summary,
    changeCountry(index) {
      country.selectedIndex = index
      onChange()
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CHED reference reveal', () => {
  test('clears the reference for an exempt country but not an unselected country', () => {
    const page = createPage()
    expect(page.container.hidden).toBe(false)

    page.changeCountry(3)
    expect(page.container.hidden).toBe(false)
    expect(page.reference.value).toBe('CHEDP.XI.2025.1234567')

    page.changeCountry(0)
    expect(page.container.hidden).toBe(true)
    expect(page.reference.value).toBe('CHEDP.XI.2025.1234567')

    page.changeCountry(1)
    expect(page.container.hidden).toBe(false)
    page.changeCountry(2)
    expect(page.container.hidden).toBe(true)
    expect(page.reference.value).toBe('')

    page.changeCountry(1)
    expect(page.container.hidden).toBe(false)
    expect(page.reference.value).toBe('')
  })

  test('clears only the CHED error when other errors remain', () => {
    const page = createPage({ chedError: true, otherError: true })
    page.changeCountry(2)

    expect(page.error.remove).toHaveBeenCalledOnce()
    expect(page.reference.classList.remove).toHaveBeenCalledWith(
      'govuk-input--error'
    )
    expect(page.formGroup.classList.remove).toHaveBeenCalledWith(
      'govuk-form-group--error'
    )
    expect(page.reference.setAttribute).toHaveBeenCalledWith(
      'aria-describedby',
      'ched-reference-hint'
    )
    expect(page.item.remove).toHaveBeenCalledOnce()
    expect(page.summary.remove).not.toHaveBeenCalled()
    expect(page.document.title).toBe('Error: Consignment details')

    page.changeCountry(1)
    expect(page.container.hidden).toBe(false)
    expect(page.reference.value).toBe('')
    expect(page.error.remove).toHaveBeenCalledOnce()
  })

  test('removes the summary and error title when CHED was the only error', () => {
    const page = createPage({ chedError: true })
    page.changeCountry(2)

    expect(page.item.remove).toHaveBeenCalledOnce()
    expect(page.summary.remove).toHaveBeenCalledOnce()
    expect(page.document.title).toBe('Consignment details')
  })

  test('removes a hidden CHED error when the country is unselected', () => {
    const page = createPage({ chedError: true })
    page.changeCountry(0)

    expect(page.container.hidden).toBe(true)
    expect(page.reference.value).toBe('invalid reference')
    expect(page.item.remove).toHaveBeenCalledOnce()
    expect(page.summary.remove).toHaveBeenCalledOnce()
  })
})
