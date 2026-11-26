import {
  getCommodityDetailsController,
  postCommodityDetailsController
} from './controller.js'

export const commodityDetails = {
  plugin: {
    name: 'commodity-details',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/notification/commodity-details',
          ...getCommodityDetailsController
        },
        {
          method: 'POST',
          path: '/notification/commodity-details',
          ...postCommodityDetailsController
        }
      ])
    }
  }
}
