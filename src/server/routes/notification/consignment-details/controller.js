import { statusCodes } from '#/server/common/constants/status-codes.js'
import {
  currentDraft,
  loadSavedDraft,
  saveArrival
} from '#/server/services/notifications/draft-session.js'
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
    errors: {
      ...errors,
      date: errors.date ?? errors.arrival,
      time: errors.time ?? errors.arrival
    },
    errorList,
    ports: [{ value: '', text: 'Select a port of entry' }, ...ports].map(
      (port) => ({
        ...port,
        selected: port.value === (values.port?.trim() ?? '')
      })
    ),
    countries: countryItems(countryValue)
  }
}

function arrivalValues(notification) {
  const arrival = notification?.notification?.arrival
  if (!arrival) {
    return {}
  }
  const [year, month, day] = arrival.expectedArrivalDate.split('-')
  const [hour, minute] = arrival.expectedArrivalTime.split(':')
  return {
    port: arrival.portOfEntry,
    'arrival-day': String(Number(day)),
    'arrival-month': String(Number(month)),
    'arrival-year': year,
    'arrival-hour': hour,
    'arrival-minute': minute
  }
}

export const consignmentDetailsController = {
  async handler(request, h) {
    const notification = await loadSavedDraft(request)
    if (!notification) {
      return h.redirect('/notification/transport-details').code(303)
    }
    return h.view(
      'notification/consignment-details/index',
      pageModel({ values: arrivalValues(notification) })
    )
  }
}

export const submitConsignmentDetailsController = {
  async handler(request, h) {
    if (!currentDraft(request)) {
      return h
        .view('error/index', {
          pageTitle: 'Start again',
          heading: statusCodes.badRequest,
          message:
            'Your session has expired. Return to Transport details and try again.'
        })
        .code(statusCodes.badRequest)
    }
    const result = validateConsignmentDetails(request.payload)
    const model = pageModel(result)
    if (model.errorList.length) {
      return h
        .view('notification/consignment-details/index', model)
        .code(statusCodes.badRequest)
    }
    const notification = await saveArrival(request, result.arrival)
    if (!notification) {
      return h
        .view('error/index', {
          pageTitle: 'Start again',
          heading: statusCodes.badRequest,
          message:
            'Your session has expired. Return to Transport details and try again.'
        })
        .code(statusCodes.badRequest)
    }
    return h.redirect('/notification/next-step').code(statusCodes.seeOther)
  }
}
