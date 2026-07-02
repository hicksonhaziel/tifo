import { motion } from 'framer-motion'

import { safeClass } from '../tifo/domain.js'

export function ReactionEffects({ effects }) {
  if (effects.length === 0) return null

  return (
    <div className='reaction-fx-layer' aria-hidden='true'>
      {effects.map((effect, index) => (
        <motion.div
          className={`reaction-burst tone-${safeClass(effect.tone)} burst-${index}`}
          initial={{ opacity: 0, y: 18, scale: 0.72, x: '-50%' }}
          animate={{ opacity: [0, 1, 1, 0], y: [18, 0, 0, -40], scale: [0.72, 1, 1, 0.94] }}
          transition={{ duration: 1.8, ease: 'easeOut' }}
          key={`${effect.id}-${effect.createdAt}`}
        >
          <span>{effect.label}</span>
          <small>{effect.sender}</small>
        </motion.div>
      ))}
      <div className={`terrace-flash tone-${safeClass(effects[0].tone)}`}></div>
    </div>
  )
}
