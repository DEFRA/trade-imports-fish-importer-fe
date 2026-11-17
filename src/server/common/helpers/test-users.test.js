import { validateTestUsers } from './test-users.js'

const user = {
  userId: 'test-user-001',
  name: 'Importer Oak',
  organisationId: 'test-org-001',
  organisationName: 'Example Harbour Imports'
}

describe('Test user catalogue validation', () => {
  test('allows distinct users to share an organisation', () => {
    const users = [
      user,
      { ...user, userId: 'test-user-002', name: 'Importer Sycamore' },
      {
        ...user,
        userId: 'test-user-003',
        organisationId: 'test-org-002',
        organisationName: 'Example Coastal Imports'
      }
    ]

    expect(validateTestUsers(users)).toEqual(users)
  })

  test.each([
    ['missing catalogue', undefined],
    ['empty catalogue', []],
    ['missing user ID', [{ ...user, userId: undefined }]],
    ['empty display name', [{ ...user, name: '' }]],
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
