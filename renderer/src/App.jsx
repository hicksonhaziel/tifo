import { AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { HomeView } from './components/HomeView.jsx'
import { SplashScreen } from './components/SplashScreen.jsx'
import { WelcomeView } from './components/WelcomeView.jsx'
import { useTifoController } from './hooks/useTifoController.js'

const BOOT_SPLASH_MS = 1250
const ONBOARDING_SPLASH_MS = 1400

export function App() {
  const controller = useTifoController()
  const view = controller.state.view

  // Boot splash on first open.
  const [booting, setBooting] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), BOOT_SPLASH_MS)
    return () => clearTimeout(timer)
  }, [])

  // Brief splash after onboarding completes (welcome -> home).
  const prevView = useRef(view)
  const [onboardingSplash, setOnboardingSplash] = useState(false)
  useEffect(() => {
    if (prevView.current === 'welcome' && view !== 'welcome') {
      setOnboardingSplash(true)
      const timer = setTimeout(() => setOnboardingSplash(false), ONBOARDING_SPLASH_MS)
      prevView.current = view
      return () => clearTimeout(timer)
    }
    prevView.current = view
    return undefined
  }, [view])

  const showSplash = booting || onboardingSplash
  const splashLabel = onboardingSplash ? 'Building your terrace' : 'Warming up the terrace'

  return (
    <div className='app-shell'>
      {view === 'welcome' ? (
        <WelcomeView actions={controller.actions} state={controller.state} />
      ) : (
        <HomeView controller={controller} />
      )}
      <AnimatePresence>
        {showSplash ? <SplashScreen key='tifo-splash' label={splashLabel} /> : null}
      </AnimatePresence>
    </div>
  )
}
