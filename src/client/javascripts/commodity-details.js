// String utilities
const normalize = (value) => value.trim().toLowerCase()

function extractShortName(name) {
  return name.split(/["(]/, 1)[0].trim()
}

// DOM utilities
function createElement(tag, text, className) {
  const node = document.createElement(tag)
  if (text) {
    node.textContent = text
  }
  if (className) {
    node.className = className
  }
  return node
}

// Error management
function createErrorSummary(errors) {
  const summary = createElement('div', '', 'govuk-error-summary')
  summary.setAttribute('role', 'alert')
  summary.tabIndex = -1
  summary.append(
    createElement('h2', 'There is a problem', 'govuk-error-summary__title')
  )
  const body = createElement('div', '', 'govuk-error-summary__body')
  const list = createElement('ul', '', 'govuk-list govuk-error-summary__list')
  for (const { id, message } of errors) {
    const item = createElement('li')
    const link = createElement('a', message)
    link.href = `#${id}`
    item.append(link)
    list.append(item)
  }
  body.append(list)
  summary.append(body)
  return summary
}

function clearInlineErrors(form) {
  form.querySelectorAll('[data-inline-error]').forEach((item) => item.remove())
}

function clearInputErrors(inputs) {
  for (const input of inputs) {
    input.removeAttribute('aria-invalid')
    input.removeAttribute('aria-describedby')
    input
      .closest('.govuk-form-group')
      ?.classList.remove('govuk-form-group--error')
  }
}

function attachInlineError(form, inputId, message) {
  const input = form.querySelector(`#${inputId}`)
  if (!input?.closest('.govuk-form-group')) {
    return
  }
  const group = input.closest('.govuk-form-group')
  group.classList.add('govuk-form-group--error')
  input.setAttribute('aria-invalid', 'true')
  input.setAttribute('aria-describedby', `${inputId}-error`)
  const inline = createElement('p', message, 'govuk-error-message')
  inline.id = `${inputId}-error`
  inline.dataset.inlineError = ''
  group.after(inline)
}

function displayErrors(form, errorContainer, inputs, errors) {
  errorContainer.replaceChildren()
  clearInlineErrors(form)
  clearInputErrors(inputs)

  if (!errors.length) {
    return
  }

  const summary = createErrorSummary(errors)
  errorContainer.append(summary)

  const rowContainer = form.querySelector('[data-commodity-fields-row]')
  const rowErrors = []
  const otherErrors = []

  for (const error of errors) {
    const input = form.querySelector(`#${error.id}`)
    if (input && rowContainer && rowContainer.contains(input)) {
      rowErrors.push(error)
    } else {
      otherErrors.push(error)
    }
  }

  if (rowErrors.length > 0) {
    const messages = rowErrors.map((e) => e.message).join(' | ')
    const inlineId = rowErrors[0].id

    const rowErrorsGroup = form.querySelectorAll(
      `#${rowErrors.map((e) => e.id).join(', #')}`
    )
    rowErrorsGroup.forEach((input) => {
      const group = input.closest('.govuk-form-group')
      if (group) {
        group.classList.add('govuk-form-group--error')
        input.setAttribute('aria-invalid', 'true')
      }
    })

    const inline = createElement('p', messages, 'govuk-error-message')
    inline.id = `${inlineId}-error`
    inline.dataset.inlineError = ''
    rowContainer.after(inline)

    rowErrorsGroup.forEach((input) => {
      input.setAttribute('aria-describedby', `${inlineId}-error`)
    })
  }

  for (const error of otherErrors) {
    attachInlineError(form, error.id, error.message)
  }

  summary.focus()
}

// Table rendering
function renderCommodityRows(table, summary, rows, onRemove) {
  summary.hidden = rows.length === 0
  table.replaceChildren()

  rows.forEach((row, index) => {
    const tr = createElement('tr', '', 'govuk-table__row')
    for (const value of [
      row.commodityCode,
      row.commonName,
      String(row.netWeightKg)
    ]) {
      tr.append(createElement('td', value, 'govuk-table__cell'))
    }

    const cell = createElement('td', '', 'govuk-table__cell')
    const removeBtn = createElement('button', 'Remove', 'app-remove-commodity')
    removeBtn.type = 'button'
    removeBtn.setAttribute(
      'aria-label',
      `Remove ${row.commonName}, ${row.commodityCode}`
    )
    removeBtn.addEventListener('click', () => onRemove(index))
    cell.append(removeBtn)
    tr.append(cell)
    table.append(tr)
  })
}

// Commodity dropdown management
function closeCommodityDropdown(codeInput, optionsContainer) {
  optionsContainer.hidden = true
  codeInput.setAttribute('aria-expanded', 'false')
  codeInput.removeAttribute('aria-activedescendant')
  return -1
}

function filterCommoditiesByQuery(commodities, query) {
  const normalizedQuery = normalize(query)
  return commodities.filter(
    (item) =>
      normalize(item.code).includes(normalizedQuery) ||
      normalize(extractShortName(item.name)).includes(normalizedQuery)
  )
}

function buildCommodityOption(commodity, index, onSelect) {
  const option = createElement('div', '', 'app-commodity-option')
  option.id = `commodity-option-${index}`
  option.title = `${commodity.code} ${extractShortName(commodity.name)}`
  option.setAttribute('role', 'option')
  option.append(
    createElement('strong', commodity.code),
    createElement('span', extractShortName(commodity.name))
  )
  option.addEventListener('mousedown', (event) => {
    event.preventDefault()
    onSelect(commodity)
  })
  return option
}

function populateCommodityOptions(optionsContainer, matches, onSelect) {
  optionsContainer.replaceChildren()
  if (!matches.length) {
    optionsContainer.append(
      createElement('div', 'No results found', 'app-commodity-option')
    )
    return
  }
  matches.forEach((item, index) => {
    optionsContainer.append(buildCommodityOption(item, index, onSelect))
  })
}

function displayCommodityMatches(
  codeInput,
  optionsContainer,
  matches,
  onSelect
) {
  populateCommodityOptions(optionsContainer, matches, onSelect)
  optionsContainer.hidden = false
  codeInput.setAttribute('aria-expanded', 'true')
  return -1
}

function highlightCommodityOption(optionsContainer, codeInput, index) {
  optionsContainer.querySelectorAll('[role="option"]').forEach((item, i) => {
    item.setAttribute('aria-selected', String(i === index))
  })
  const active = optionsContainer.children[index]
  if (active) {
    codeInput.setAttribute('aria-activedescendant', active.id)
    active.scrollIntoView({ block: 'nearest' })
  }
}

function handleCommodityKeyNavigation(
  event,
  codeInput,
  optionsContainer,
  matches,
  currentActiveIndex,
  onSelect
) {
  if (event.key === 'Escape') {
    return closeCommodityDropdown(codeInput, optionsContainer)
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (optionsContainer.hidden) {
      displayCommodityMatches(codeInput, optionsContainer, matches, onSelect)
    }
    if (!matches.length) return -1

    const newIndex =
      event.key === 'ArrowDown'
        ? Math.min(currentActiveIndex + 1, matches.length - 1)
        : Math.max(currentActiveIndex - 1, 0)

    highlightCommodityOption(optionsContainer, codeInput, newIndex)
    return newIndex
  }

  if (event.key === 'Enter' && currentActiveIndex >= 0) {
    event.preventDefault()
    onSelect(matches[currentActiveIndex])
  }

  return currentActiveIndex
}

// Species dropdown management
function closeSpeciesDropdown(speciesInput, speciesOptionsContainer) {
  speciesOptionsContainer.hidden = true
  speciesInput.setAttribute('aria-expanded', 'false')
  speciesInput.removeAttribute('aria-activedescendant')
  return -1
}

function clearSpeciesInput(speciesInput) {
  speciesInput.value = ''
  const displaySpan = speciesInput.querySelector('span')
  if (displaySpan) {
    displaySpan.textContent = ''
  }
}

function buildSpeciesOption(species, index, onSelect) {
  const option = createElement(
    'div',
    species.commonName,
    'app-commodity-option'
  )
  option.id = `species-option-${index}`
  option.title = species.commonName
  option.setAttribute('role', 'option')
  option.addEventListener('mousedown', (event) => event.preventDefault())
  option.addEventListener('click', () => onSelect(species))
  return option
}

function populateSpeciesOptions(speciesOptionsContainer, species, onSelect) {
  speciesOptionsContainer.replaceChildren()
  if (!species.length) {
    speciesOptionsContainer.append(
      createElement('div', 'Select a commodity first', 'app-commodity-option')
    )
    return
  }
  species.forEach((item, index) => {
    speciesOptionsContainer.append(buildSpeciesOption(item, index, onSelect))
  })
}

function displaySpeciesOptions(
  speciesInput,
  speciesOptionsContainer,
  species,
  onSelect
) {
  populateSpeciesOptions(speciesOptionsContainer, species, onSelect)
  speciesOptionsContainer.hidden = false
  speciesInput.setAttribute('aria-expanded', 'true')
  return -1
}

function highlightSpeciesOption(speciesInput, speciesOptionsContainer, index) {
  speciesOptionsContainer
    .querySelectorAll('[role="option"]')
    .forEach((item, i) => {
      item.setAttribute('aria-selected', String(i === index))
    })
  const active = speciesOptionsContainer.children[index]
  if (active) {
    speciesInput.setAttribute('aria-activedescendant', active.id)
    active.scrollIntoView({ block: 'nearest' })
  }
}

function getArrowNavigationIndex(event, currentActiveIndex, itemsLength) {
  if (event.key === 'Home') return 0
  if (event.key === 'End') return itemsLength - 1
  if (event.key === 'ArrowDown') {
    return Math.min(currentActiveIndex + 1, itemsLength - 1)
  }
  return currentActiveIndex < 0
    ? itemsLength - 1
    : Math.max(currentActiveIndex - 1, 0)
}

function handleArrowNavigation(
  event,
  speciesInput,
  speciesOptionsContainer,
  items,
  currentActiveIndex,
  onSelect
) {
  event.preventDefault()
  if (speciesOptionsContainer.hidden) {
    displaySpeciesOptions(
      speciesInput,
      speciesOptionsContainer,
      items,
      onSelect
    )
  }
  if (!items.length) return -1

  const index = getArrowNavigationIndex(event, currentActiveIndex, items.length)
  highlightSpeciesOption(speciesInput, speciesOptionsContainer, index)
  return index
}

function handleEnterOrSpace(
  event,
  speciesInput,
  speciesOptionsContainer,
  items,
  currentActiveIndex,
  onSelect
) {
  event.preventDefault()
  if (speciesOptionsContainer.hidden) {
    return displaySpeciesOptions(
      speciesInput,
      speciesOptionsContainer,
      items,
      onSelect
    )
  }
  if (currentActiveIndex >= 0) {
    onSelect(items[currentActiveIndex])
    return currentActiveIndex
  }
  return closeSpeciesDropdown(speciesInput, speciesOptionsContainer)
}

export function handleSpeciesKeyNavigation(
  event,
  speciesInput,
  speciesOptionsContainer,
  species,
  currentActiveIndex,
  onSelect
) {
  const items = species ?? []

  if (event.key === 'Escape') {
    return closeSpeciesDropdown(speciesInput, speciesOptionsContainer)
  }

  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    return handleArrowNavigation(
      event,
      speciesInput,
      speciesOptionsContainer,
      items,
      currentActiveIndex,
      onSelect
    )
  }

  if (event.key === 'Enter' || event.key === ' ') {
    return handleEnterOrSpace(
      event,
      speciesInput,
      speciesOptionsContainer,
      items,
      currentActiveIndex,
      onSelect
    )
  }

  return currentActiveIndex
}

function handleSpeciesTypeAhead(event, species, currentActiveIndex) {
  if (
    event.key.length !== 1 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return { searchTerm: '', foundIndex: -1 }
  }

  const now = Date.now()
  const lastSearchTime = event.target.dataset.lastSpeciesSearch || '0'
  const previousSearch = event.target.dataset.speciesSearch || ''

  const speciesSearch =
    (now - parseInt(lastSearchTime) > 1000 ? '' : previousSearch) +
    event.key.toLowerCase()

  event.target.dataset.lastSpeciesSearch = String(now)
  event.target.dataset.speciesSearch = speciesSearch

  const items = species ?? []
  const index = items.findIndex((item) =>
    normalize(item.commonName).startsWith(speciesSearch)
  )

  return { searchTerm: speciesSearch, foundIndex: index }
}

// Validation
function validateCommodityCode(selected) {
  if (!selected) {
    return { id: 'commodityCode', message: 'Select a commodity code' }
  }
  return null
}

function validateSpeciesSelection(selectedSpecies) {
  if (!selectedSpecies) {
    return { id: 'species', message: 'Select a species' }
  }
  return null
}

function validateWeight(value) {
  const trimmed = value.trim()
  const number = Number(trimmed)
  if (
    !/^\d+(?:\.\d+)?$/.test(trimmed) ||
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return { id: 'weight', message: 'Enter a valid weight in kilograms' }
  }
  return null
}

function validateNoDuplicateCommodity(selected, selectedSpecies, rows) {
  if (
    selected &&
    selectedSpecies &&
    rows.some(
      (row) =>
        normalize(row.commodityCode) === normalize(selected.code) &&
        normalize(row.speciesCode) === normalize(selectedSpecies.faoCode)
    )
  ) {
    return {
      id: 'species',
      message: 'This commodity and species have already been added'
    }
  }
  return null
}

function collectAddCommodityErrors(selected, selectedSpecies, weight, rows) {
  const errors = []

  const codeError = validateCommodityCode(selected)
  if (codeError) errors.push(codeError)

  const speciesError = validateSpeciesSelection(selectedSpecies)
  if (speciesError) errors.push(speciesError)

  const weightError = validateWeight(weight)
  if (weightError) errors.push(weightError)

  if (!weightError) {
    const duplicateError = validateNoDuplicateCommodity(
      selected,
      selectedSpecies,
      rows
    )
    if (duplicateError) errors.push(duplicateError)
  }

  return errors
}

function validateFormSubmission(codeInput, speciesInput, weightInput, rows) {
  if (
    codeInput.value.trim() ||
    speciesInput.value ||
    weightInput.value.trim()
  ) {
    return {
      id: 'commodityCode',
      message: 'Add or clear selected commodity details before continuing'
    }
  }

  if (!rows.length) {
    return {
      id: 'commodityCode',
      message: 'Add at least one commodity before continuing.'
    }
  }

  return null
}

function validateWeightTotals(rows) {
  const totals = new Map()
  for (const row of rows) {
    const key = normalize(row.commodityCode)
    const total = (totals.get(key) ?? 0) + row.netWeightKg
    if (!Number.isFinite(total)) {
      return {
        id: 'weight',
        message: 'The total weight for a commodity is too large'
      }
    }
    totals.set(key, total)
  }
  return null
}

// Row management
function createRowFromCommodity(
  commodity,
  species,
  weight,
  existingDescription
) {
  return {
    commodityCode: commodity.code,
    description: existingDescription ?? commodity.name,
    speciesCode: species.faoCode,
    commonName: species.commonName,
    ...(species.scientificName
      ? { scientificName: species.scientificName }
      : {}),
    netWeightKg: weight
  }
}

function findExistingCommodityDescription(selected, rows) {
  return rows.find(
    (row) => normalize(row.commodityCode) === normalize(selected.code)
  )?.description
}

// Data transformation
function groupRowsByCommodity(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const key = normalize(row.commodityCode)
    let commodity = grouped.get(key)
    if (!commodity) {
      commodity = {
        commodityCode: row.commodityCode,
        description: row.description,
        species: [],
        totalNetWeightKg: 0
      }
      grouped.set(key, commodity)
    }
    commodity.species.push({
      speciesCode: row.speciesCode,
      commonName: row.commonName,
      ...(row.scientificName ? { scientificName: row.scientificName } : {}),
      netWeightKg: row.netWeightKg
    })
    commodity.totalNetWeightKg += row.netWeightKg
  }
  return [...grouped.values()]
}

function flattenSavedCommodities(saved) {
  return saved.flatMap((commodity) =>
    commodity.species.map((species) => ({
      commodityCode: commodity.commodityCode,
      description: commodity.description ?? undefined,
      ...species
    }))
  )
}

// API communication
async function submitCommodityForm(form) {
  const response = await fetch(form.action, {
    method: 'POST',
    headers: { accept: 'application/json' },
    body: new URLSearchParams(new FormData(form))
  })

  if (
    response.redirected &&
    new URL(response.url).pathname === '/upload-documents'
  ) {
    window.location.assign(response.url)
    return null
  }

  const result = await response.json()
  if (result.success) {
    return null
  }
  return {
    id: 'save-commodity',
    message:
      result.message ??
      'We could not confirm that your commodity details were saved. Try again later.'
  }
}

// Main initialization
export function initCommodityDetails() {
  const form = document.querySelector('[data-commodity-form]')
  if (!form) {
    return
  }

  // Initialize data
  const commodities = JSON.parse(form.dataset.reference).sort((a, b) =>
    a.code.localeCompare(b.code)
  )
  const saved = JSON.parse(form.dataset.saved)
  const rows = flattenSavedCommodities(saved)

  // Initialize DOM elements
  const codeInput = form.querySelector('#commodityCode')
  const speciesInput = form.querySelector('#species')
  const weightInput = form.querySelector('#weight')
  const optionsContainer = form.querySelector('#commodity-options')
  const speciesOptionsContainer = form.querySelector('#species-options')
  const tableContainer = form.querySelector('[data-rows]')
  const summarySummary = form.querySelector('[data-commodity-summary]')
  const errorContainer = form.querySelector('[data-errors]')
  const commoditiesInput = form.querySelector('[data-commodities]')

  // State management
  let selected
  let matches = []
  let activeIndex = -1
  let activeSpeciesIndex = -1
  let submitting = false

  // Helper functions
  const handleShowErrors = (errors) => {
    displayErrors(
      form,
      errorContainer,
      [codeInput, speciesInput, weightInput],
      errors
    )
  }

  const handleRenderRows = () => {
    renderCommodityRows(tableContainer, summarySummary, rows, (index) => {
      rows.splice(index, 1)
      handleRenderRows()
      handleShowErrors([])
    })
  }

  const handleSelectCommodity = (commodity) => {
    selected = commodity
    codeInput.value = commodity.code
    activeIndex = -1
    clearSpeciesInput(speciesInput)
    speciesOptionsContainer.replaceChildren()
    activeSpeciesIndex = closeSpeciesDropdown(
      speciesInput,
      speciesOptionsContainer
    )
    closeCommodityDropdown(codeInput, optionsContainer)
  }

  const handleSelectSpecies = (species) => {
    speciesInput.value = species.faoCode
    const displaySpan = speciesInput.querySelector('span')
    if (displaySpan) {
      displaySpan.textContent = species.commonName
    }
    activeSpeciesIndex = closeSpeciesDropdown(
      speciesInput,
      speciesOptionsContainer
    )
  }

  const handleShowCommodityOptions = () => {
    matches = filterCommoditiesByQuery(commodities, codeInput.value)
    activeIndex = displayCommodityMatches(
      codeInput,
      optionsContainer,
      matches,
      handleSelectCommodity
    )
  }

  const handleShowSpeciesOptions = () => {
    const speciesItems = selected?.species ?? []
    activeSpeciesIndex = displaySpeciesOptions(
      speciesInput,
      speciesOptionsContainer,
      speciesItems,
      handleSelectSpecies
    )
  }

  const handleAddCommodity = () => {
    const selectedSpecies = selected?.species.find(
      (item) => item.faoCode === speciesInput.value
    )
    const weightValue = weightInput.value
    const weightNumber = Number(weightValue.trim())

    const errors = collectAddCommodityErrors(
      selected,
      selectedSpecies,
      weightValue,
      rows
    )
    if (errors.length) {
      handleShowErrors(errors)
      return
    }

    const existingDescription = findExistingCommodityDescription(selected, rows)
    const newRow = createRowFromCommodity(
      selected,
      selectedSpecies,
      weightNumber,
      existingDescription
    )
    rows.push(newRow)

    codeInput.value = ''
    weightInput.value = ''
    selected = undefined
    activeIndex = -1
    clearSpeciesInput(speciesInput)
    speciesOptionsContainer.replaceChildren()
    activeSpeciesIndex = closeSpeciesDropdown(
      speciesInput,
      speciesOptionsContainer
    )

    handleRenderRows()
    handleShowErrors([])
  }

  const handleFormSubmit = async (event) => {
    if (submitting) {
      return
    }
    event.preventDefault()

    const submissionError = validateFormSubmission(
      codeInput,
      speciesInput,
      weightInput,
      rows
    )
    if (submissionError) {
      handleShowErrors([submissionError])
      return
    }

    const weightError = validateWeightTotals(rows)
    if (weightError) {
      handleShowErrors([weightError])
      return
    }

    const grouped = groupRowsByCommodity(rows)
    commoditiesInput.value = JSON.stringify(grouped)
    submitting = true
    handleShowErrors([])

    try {
      const error = await submitCommodityForm(form)
      if (error) {
        handleShowErrors([error])
      } else {
        rows.length = 0
        handleRenderRows()
        handleShowErrors([])
      }
    } catch (err) {
      console.error('Failed to save commodity details', err)
      handleShowErrors([
        {
          id: 'save-commodity',
          message:
            'We could not confirm that your commodity details were saved. Try again later.'
        }
      ])
    } finally {
      submitting = false
    }
  }

  // Event listeners - Commodity input
  codeInput.addEventListener('focus', handleShowCommodityOptions)

  const commodityToggle = form.querySelector('.app-commodity-dropdown__toggle')
  commodityToggle.addEventListener('mousedown', (event) =>
    event.preventDefault()
  )
  commodityToggle.addEventListener('click', () => {
    const wasOpen = !optionsContainer.hidden
    codeInput.focus()
    if (wasOpen) {
      activeIndex = closeCommodityDropdown(codeInput, optionsContainer)
    } else if (optionsContainer.hidden) {
      handleShowCommodityOptions()
    }
  })

  codeInput.addEventListener('input', () => {
    selected = undefined
    activeIndex = -1
    clearSpeciesInput(speciesInput)
    speciesOptionsContainer.replaceChildren()
    activeSpeciesIndex = closeSpeciesDropdown(
      speciesInput,
      speciesOptionsContainer
    )
    handleShowCommodityOptions()
  })

  codeInput.addEventListener('blur', () => {
    activeIndex = closeCommodityDropdown(codeInput, optionsContainer)
  })

  codeInput.addEventListener('keydown', (event) => {
    activeIndex = handleCommodityKeyNavigation(
      event,
      codeInput,
      optionsContainer,
      matches,
      activeIndex,
      handleSelectCommodity
    )
  })

  // Event listeners - Species input
  speciesInput.addEventListener('click', () => {
    if (speciesOptionsContainer.hidden) {
      handleShowSpeciesOptions()
    } else {
      activeSpeciesIndex = closeSpeciesDropdown(
        speciesInput,
        speciesOptionsContainer
      )
    }
  })

  speciesInput.addEventListener('blur', () => {
    if (activeSpeciesIndex >= 0 && selected?.species) {
      handleSelectSpecies(selected.species[activeSpeciesIndex])
    } else {
      activeSpeciesIndex = closeSpeciesDropdown(
        speciesInput,
        speciesOptionsContainer
      )
    }
  })

  speciesInput.addEventListener('keydown', (event) => {
    const items = selected?.species ?? []

    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const { foundIndex } = handleSpeciesTypeAhead(
        event,
        items,
        activeSpeciesIndex
      )
      if (foundIndex >= 0) {
        if (speciesOptionsContainer.hidden) {
          displaySpeciesOptions(
            speciesInput,
            speciesOptionsContainer,
            items,
            handleSelectSpecies
          )
        }
        activeSpeciesIndex = foundIndex
        highlightSpeciesOption(
          speciesInput,
          speciesOptionsContainer,
          foundIndex
        )
      }
    } else {
      activeSpeciesIndex = handleSpeciesKeyNavigation(
        event,
        speciesInput,
        speciesOptionsContainer,
        items,
        activeSpeciesIndex,
        handleSelectSpecies
      )
    }
  })

  // Event listeners - Form submission
  form
    .querySelector('[data-add-commodity]')
    .addEventListener('click', handleAddCommodity)
  form.addEventListener('submit', handleFormSubmit)

  // Initial render
  handleRenderRows()
}
