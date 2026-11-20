import { readFileSync } from 'node:fs'
import Joi from 'joi'

export const testUserRoleLabels = {
  importer: 'Importer',
  'importer-agent': 'Importer agent'
}

const requiredText = Joi.string().trim().required()
const catalogueSchema = Joi.array()
  .items(
    Joi.object({
      userId: requiredText,
      name: requiredText,
      role: Joi.string()
        .valid(...Object.keys(testUserRoleLabels))
        .required(),
      organisationId: requiredText,
      organisationName: requiredText
    })
  )
  .min(1)
  .unique('userId')
  .required()

let testUsers

export function validateTestUsers(users) {
  const validated = Joi.attempt(
    users,
    catalogueSchema,
    'Invalid test user catalogue',
    {
      convert: false
    }
  )
  const organisationNames = new Map()
  for (const user of validated) {
    const name = organisationNames.get(user.organisationId)
    if (name && name !== user.organisationName) {
      throw new Error(
        'Invalid test user catalogue: each organisation ID must have a consistent name'
      )
    }
    organisationNames.set(user.organisationId, user.organisationName)
  }
  return validated
}

export function getTestUsers() {
  testUsers ??= validateTestUsers(
    JSON.parse(
      readFileSync(new URL('./test-users.json', import.meta.url), 'utf8')
    )
  )
  return testUsers
}

export function findTestUser(userId) {
  return getTestUsers().find((user) => user.userId === userId)
}
