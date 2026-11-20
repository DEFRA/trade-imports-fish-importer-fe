import { validateTestUsers } from './test-users.js'

const user = {
  userId: 'test-user-001',
  name: 'North Quay Importer',
  role: 'importer',
  organisationId: 'test-org-001',
  organisationName: 'North Quay Seafood Ltd'
}

describe('Test user catalogue validation', () => {
  test('allows distinct users to share an organisation', () => {
    const users = [
      user,
      { ...user, userId: 'test-user-002', name: 'Westhaven Importer' },
      {
        ...user,
        userId: 'test-user-003',
        role: 'importer-agent',
        organisationId: 'test-org-002',
        organisationName: 'Westhaven Fish Imports Ltd'
      }
    ]

    expect(validateTestUsers(users)).toEqual(users)
  })

  test.each([
    ['missing catalogue', undefined],
    ['empty catalogue', []],
    ['missing user ID', [{ ...user, userId: undefined }]],
    ['empty display name', [{ ...user, name: '' }]],
    ['missing role', [{ ...user, role: undefined }]],
    ['empty role', [{ ...user, role: '' }]],
    ['unknown role', [{ ...user, role: 'administrator' }]],
    ['PHA role', [{ ...user, role: 'pha' }]],
    ['PHI role', [{ ...user, role: 'phi' }]],
    ['missing organisation ID', [{ ...user, organisationId: undefined }]],
    ['non-string organisation ID', [{ ...user, organisationId: 123 }]],
    ['missing organisation name', [{ ...user, organisationName: undefined }]],
    ['surrounding whitespace', [{ ...user, userId: ' test-user-001 ' }]],
    ['blank organisation name', [{ ...user, organisationName: '   ' }]],
    ['duplicate user IDs', [user, { ...user, name: 'Another user' }]],
    [
      'unexpected identity fields',
      [{ ...user, identitySource: 'another-source' }]
    ],
    [
      'inconsistent organisation names',
      [
        user,
        {
          ...user,
          userId: 'test-user-002',
          organisationName: 'Another organisation name'
        }
      ]
    ]
  ])('rejects %s without substituting defaults', (_description, users) => {
    expect(() => validateTestUsers(users)).toThrow(
      'Invalid test user catalogue'
    )
  })
})
