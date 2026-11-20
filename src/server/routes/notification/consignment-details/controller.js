import { statusCodes } from '#/server/common/constants/status-codes.js'
import { countries, isRestOfWorld } from './countries.js'
import { ports } from './ports.js'
import { validateConsignmentDetails } from './validation.js'

function countryItems(selectedValue) {
  return [
    { value: '', text: 'Select a country' },
    ...countries.map((country) => ({
      value: country.value,
      text: country.text,
      attributes: { 'data-rest-of-world': String(isRestOfWorld(country)) }
    }))
  ].map((item) => ({ ...item, selected: item.value === selectedValue }))
}

function pageModel({ values = {}, errors = {} } = {}) {
  const errorList = Object.values(errors)
    .filter(Boolean)
    .map(({ text, fields }) => ({ text, href: `#${fields[0]}` }))
  const countryValue = values['country-of-export']?.trim() ?? ''

  return {
    pageTitle: `${errorList.length ? 'Error: ' : ''}Consignment details`,
    values,
    errors,
    errorList,
    ports: [{ value: '', text: 'Select a destination port' }, ...ports].map(
      (port) => ({
        ...port,
        selected: port.value === (values.port?.trim() ?? '')
      })
    ),
    countries: countryItems(countryValue)
  }
}

export const consignmentDetailsController = {
  handler(_request, h) {
    return h.view('notification/consignment-details/index', pageModel())
  }
}

export const submitConsignmentDetailsController = {
  handler(request, h) {
    const model = pageModel(validateConsignmentDetails(request.payload))
    if (model.errorList.length) {
      return h
        .view('notification/consignment-details/index', model)
        .code(statusCodes.badRequest)
    }
    return h.redirect('/notification/next-step').code(303)
  }
}
