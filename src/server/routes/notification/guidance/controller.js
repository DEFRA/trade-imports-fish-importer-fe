export const guidanceController = {
  handler(_request, h) {
    return h.view('notification/guidance/index', {
      pageTitle: 'Submit your seafood import notification',
      heading: 'Submit your seafood import notification'
    })
  }
}
