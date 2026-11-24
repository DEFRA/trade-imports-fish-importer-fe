import { handleSpeciesKeyNavigation } from './commodity-details.js'

class FakeElement {
  constructor() {
    this.attributes = new Map()
    this.children = []
    this.listeners = new Map()
    this.hidden = true
  }

  setAttribute(name, value) {
    this.attributes.set(name, value)
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  append(child) {
    this.children.push(child)
  }

  replaceChildren(...children) {
    this.children = children
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback)
  }

  querySelectorAll(selector) {
    return selector === '[role="option"]'
      ? this.children.filter((child) => child.attributes.has('role'))
      : []
  }

  scrollIntoView() {}
}

describe('handleSpeciesKeyNavigation', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: () => new FakeElement()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('opens the options and selects an item after arrow navigation', () => {
    const speciesInput = new FakeElement()
    const optionsContainer = new FakeElement()
    const species = [{ commonName: 'Cod', faoCode: 'COD' }]
    const onSelect = vi.fn()
    const event = { key: 'ArrowDown', preventDefault: vi.fn() }

    const index = handleSpeciesKeyNavigation(
      event,
      speciesInput,
      optionsContainer,
      species,
      -1,
      onSelect
    )

    expect(index).toBe(0)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(optionsContainer.hidden).toBe(false)
    expect(speciesInput.attributes.get('aria-activedescendant')).toBe(
      'species-option-0'
    )

    optionsContainer.children[0].listeners.get('click')()
    expect(onSelect).toHaveBeenCalledWith(species[0])
  })

  test('opens the options on Space and selects the active item on Enter', () => {
    const speciesInput = new FakeElement()
    const optionsContainer = new FakeElement()
    const species = [
      { commonName: 'Cod', faoCode: 'COD' },
      { commonName: 'Haddock', faoCode: 'HAD' }
    ]
    const onSelect = vi.fn()
    const spaceEvent = { key: ' ', preventDefault: vi.fn() }

    expect(
      handleSpeciesKeyNavigation(
        spaceEvent,
        speciesInput,
        optionsContainer,
        species,
        -1,
        onSelect
      )
    ).toBe(-1)
    expect(optionsContainer.hidden).toBe(false)

    const enterEvent = { key: 'Enter', preventDefault: vi.fn() }
    const activeIndex = handleSpeciesKeyNavigation(
      enterEvent,
      speciesInput,
      optionsContainer,
      species,
      1,
      onSelect
    )

    expect(activeIndex).toBe(1)
    expect(enterEvent.preventDefault).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(species[1])
  })
})
