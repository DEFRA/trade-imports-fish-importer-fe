import {
  createAll,
  Button,
  Checkboxes,
  ErrorSummary,
  Radios,
  SkipLink
} from 'govuk-frontend'
import chedReference from './ched-reference.js'
import cookies from './cookies.js'
import { initCommodityDetails } from './commodity-details.js'

cookies.init()
chedReference.init()

createAll(Button)
createAll(Checkboxes)
createAll(ErrorSummary)
createAll(Radios)
createAll(SkipLink)
initCommodityDetails()
