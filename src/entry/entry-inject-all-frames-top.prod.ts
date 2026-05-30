import { run } from '../contents/inject-all-frames-top'
import { onExtLoaded } from './utils'

onExtLoaded(() => {
  run()
})
