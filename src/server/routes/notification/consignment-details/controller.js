import { statusCodes } from '#/server/common/constants/status-codes.js'
import { ports } from './ports.js'
import { validateConsignmentDetails } from './validation.js'

function pageModel({ values = {}, errors = {} } = {}) {
  const errorList = Object.values(errors)
    .filter(Boolean)
    .map(({ text, fields }) => ({ text, href: `#${fields[0]}` }))

  return {
    pageTitle: `${errorList.length ? 'Error: ' : ''}Consignment details`,
    values,
    errors: {
      ...errors,
      date: errors.date ?? errors.arrival,
      time: errors.time ?? errors.arrival
    },
    errorList,
    ports: [{ value: '', text: 'Select a destination port' }, ...ports].map(
      (port) => ({
        ...port,
        selected: port.value === (values.port?.trim() ?? '')
      })
    )
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
