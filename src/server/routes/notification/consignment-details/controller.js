import { statusCodes } from '#/server/common/constants/status-codes.js'
import { saveArrival } from '#/server/services/notifications/draft-session.js'
import { ports } from './ports.js'
import { ukDate } from './uk-date.js'
import { validateConsignmentDetails } from './validation.js'

// GOV.UK date examples use an unambiguous day and a single-digit month.
const minExampleDay = 13
const maxExampleMonth = 9

function arrivalDateExample(now = new Date()) {
  const example = ukDate(now)
  example.setUTCDate(example.getUTCDate() + 2)
  const month = example.getUTCMonth() + 1
  const year = example.getUTCFullYear()

  if (month > maxExampleMonth) {
    return `${minExampleDay} 1 ${year + 1}`
  }
  return `${Math.max(minExampleDay, example.getUTCDate())} ${month} ${year}`
}

function pageModel({ values = {}, errors = {}, journeyId } = {}) {
  const errorList = Object.values(errors)
    .filter(Boolean)
    .map(({ text, fields }) => ({ text, href: `#${fields[0]}` }))

  return {
    pageTitle: `${errorList.length ? 'Error: ' : ''}Consignment details`,
    journeyId,
    arrivalDateExample: arrivalDateExample(),
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
    )
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
    return h.view(
      'notification/consignment-details/index',
      pageModel({
        values: arrivalValues(request.app.notification),
        journeyId: request.app.notification.id
      })
    )
  }
}

export const submitConsignmentDetailsController = {
  async handler(request, h) {
    const notification = request.app.notification
    const result = validateConsignmentDetails(request.payload)
    const model = pageModel({
      ...result,
      journeyId: notification.id
    })
    if (model.errorList.length) {
      return h
        .view('notification/consignment-details/index', model)
        .code(statusCodes.badRequest)
    }
    await saveArrival(request, result.arrival, notification)
    return h.redirect('/notification/next-step').code(statusCodes.seeOther)
  }
}
