import Joi from 'joi'

import { transportMethods } from '#/server/common/constants/transport-methods.js'

const selectionError = 'Select how the consignment is being transported'

export const transportDetailsSchema = Joi.object({
  transportMethod: Joi.string()
    .valid(...transportMethods.map(({ value }) => value))
    .required()
})

export function transportDetailsModel(selected, invalid = false) {
  const radios = {
    idPrefix: 'transportMethod',
    name: 'transportMethod',
    fieldset: {
      legend: {
        text: 'How is the consignment being transported?',
        classes: 'govuk-fieldset__legend--m'
      }
    },
    items: transportMethods.map((method) => ({
      ...method,
      checked: method.value === selected
    }))
  }
  if (invalid) {
    radios.errorMessage = { text: selectionError }
  }
  return {
    pageTitle: invalid ? 'Error: Transport details' : 'Transport details',
    radios,
    errorSummary: invalid
      ? {
          titleText: 'There is a problem',
          errorList: [{ text: selectionError, href: '#transportMethod' }]
        }
      : null
  }
}
