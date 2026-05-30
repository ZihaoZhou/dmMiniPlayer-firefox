import { run } from '../contents/inject-top'
import { onExtLoaded } from './utils'

onExtLoaded(() => {
  run()
})
