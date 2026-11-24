function clearChedError(reference) {
  const error = document.getElementById('ched-reference-error')
  if (error) {
    error.remove()
    reference.classList.remove('govuk-input--error')
    reference
      .closest('.govuk-form-group')
      .classList.remove('govuk-form-group--error')

    const describedBy = reference.getAttribute('aria-describedby')
    if (describedBy) {
      const remaining = describedBy
        .split(/\s+/)
        .filter((id) => id !== 'ched-reference-error')
        .join(' ')
      if (remaining) {
        reference.setAttribute('aria-describedby', remaining)
      } else {
        reference.removeAttribute('aria-describedby')
      }
    }
  }

  const errorLink = document.querySelector(
    '.govuk-error-summary__list a[href="#ched-reference"]'
  )
  if (errorLink) {
    const summary = errorLink.closest('.govuk-error-summary')
    errorLink.closest('li').remove()
    if (!summary.querySelector('.govuk-error-summary__list li')) {
      summary.remove()
      document.title = document.title.replace(/^Error: /, '')
    }
  }
}

export default {
  init() {
    const container = document.querySelector(
      '[data-module="app-ched-reference"]'
    )
    const select = document.getElementById('country-of-export')
    if (!container || !select) {
      return
    }
    const reference = document.getElementById('ched-reference')

    const update = () => {
      const option = select.options[select.selectedIndex]
      const isRestOfWorld = option?.dataset.restOfWorld === 'true'
      container.hidden = !isRestOfWorld
      if (!isRestOfWorld) {
        if (option?.dataset.restOfWorld === 'false') {
          reference.value = ''
        }
        clearChedError(reference)
      }
    }

    select.addEventListener('change', update)
    update()
  }
}
