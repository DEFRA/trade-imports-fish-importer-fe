export const nextStepController = {
  handler(_request, h) {
    return h.view('notification/next-step/index', {
      pageTitle: 'Next step'
    })
  }
}
