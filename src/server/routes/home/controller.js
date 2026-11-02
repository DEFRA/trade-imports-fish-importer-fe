/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 */
export const homeController = {
  handler(_request, h) {
    return h.view('home/index', {
      pageTitle: 'Import fish and fishery products',
      heading: 'Import fish and fishery products'
    })
  }
}
