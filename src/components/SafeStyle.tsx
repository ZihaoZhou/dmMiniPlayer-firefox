import { FC, useEffect, useRef } from 'react'

type Props = {
  cssText: string
}

const SafeStyle: FC<Props> = ({ cssText }) => {
  const ref = useRef<HTMLStyleElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.textContent = cssText
  }, [cssText])

  return <style ref={ref}></style>
}

export default SafeStyle
