import { motion } from 'framer-motion'

import { BallAvatar } from './home/BallAvatar.jsx'

/**
 * Full-screen boot / transition loader.
 * Shown when the app first opens and briefly after onboarding completes.
 * Pure presentational — no worker/state coupling.
 */
export function SplashScreen({ label = 'Warming up the terrace' }) {
  return (
    <motion.div
      className='tifo-splash'
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }}
    >
      <div className='tifo-splash-inner'>
        <motion.div
          className='tifo-splash-ball'
          initial={{ scale: 0.7, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.3, 1] }}
        >
          <span className='tifo-splash-glow' aria-hidden='true' />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3.4, ease: 'linear', repeat: Infinity }}
            style={{ display: 'inline-flex' }}
          >
            <BallAvatar size={78} />
          </motion.div>
        </motion.div>

        <motion.div
          className='tifo-splash-word'
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.44, ease: 'easeOut' }}
        >
          tifo
          <span className='dot' aria-hidden='true' />
        </motion.div>

        <motion.div
          className='tifo-splash-label'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.4 }}
        >
          {label}
        </motion.div>

        <div className='tifo-splash-track' aria-hidden='true'>
          <motion.span
            className='tifo-splash-bar'
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.15, ease: 'easeInOut', repeat: Infinity }}
          />
        </div>
      </div>
    </motion.div>
  )
}
