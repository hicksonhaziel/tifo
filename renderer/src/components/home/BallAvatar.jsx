import { useId } from 'react'

export function BallAvatar({ size = 40, className = '', style }) {
  const id = useId().replace(/:/g, '')
  const surfaceId = `ballSurface-${id}`
  const panelShadeId = `panelShade-${id}`
  const blackPanelId = `blackPanel-${id}`
  const panelGlowId = `panelGlow-${id}`
  const rimShadeId = `rimShade-${id}`
  const leatherGrainId = `leatherGrain-${id}`
  const fineGrainId = `fineGrain-${id}`
  const textureId = `ballTexture-${id}`
  const clipId = `ballClip-${id}`

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-visible rounded-full bg-transparent drop-shadow-[0_5px_12px_rgba(0,0,0,0.48)] ${className}`}
      style={{ height: size, width: size, ...style }}
    >
      <svg aria-hidden='true' className='block h-full w-full' focusable='false' viewBox='0 0 96 96'>
        <defs>
          <radialGradient id={surfaceId} cx='30%' cy='22%' r='78%'>
            <stop offset='0%' stopColor='#ffffff' />
            <stop offset='32%' stopColor='#fbfaf5' />
            <stop offset='58%' stopColor='#eee8db' />
            <stop offset='80%' stopColor='#c7beaa' />
            <stop offset='100%' stopColor='#726d61' />
          </radialGradient>
          <radialGradient id={blackPanelId} cx='34%' cy='23%' r='84%'>
            <stop offset='0%' stopColor='#4c565c' />
            <stop offset='38%' stopColor='#252d31' />
            <stop offset='72%' stopColor='#101417' />
            <stop offset='100%' stopColor='#050607' />
          </radialGradient>
          <linearGradient id={panelShadeId} x1='20' x2='82' y1='12' y2='88'>
            <stop offset='0%' stopColor='#fffdf7' />
            <stop offset='58%' stopColor='#ece5d7' />
            <stop offset='100%' stopColor='#aaa18e' />
          </linearGradient>
          <radialGradient id={panelGlowId} cx='35%' cy='20%' r='74%'>
            <stop offset='0%' stopColor='#ffffff' stopOpacity='0.38' />
            <stop offset='45%' stopColor='#ffffff' stopOpacity='0.08' />
            <stop offset='100%' stopColor='#000000' stopOpacity='0.24' />
          </radialGradient>
          <radialGradient id={rimShadeId} cx='33%' cy='24%' r='72%'>
            <stop offset='48%' stopColor='#000000' stopOpacity='0' />
            <stop offset='80%' stopColor='#000000' stopOpacity='0.26' />
            <stop offset='92%' stopColor='#000000' stopOpacity='0.5' />
            <stop offset='100%' stopColor='#000000' stopOpacity='0.68' />
          </radialGradient>
          <pattern id={leatherGrainId} height='5' patternUnits='userSpaceOnUse' width='5'>
            <circle cx='0.8' cy='1' fill='#ffffff' opacity='0.18' r='0.38' />
            <circle cx='3.8' cy='1.9' fill='#111519' opacity='0.12' r='0.34' />
            <circle cx='2.1' cy='4.2' fill='#000000' opacity='0.1' r='0.28' />
          </pattern>
          <pattern id={fineGrainId} height='3' patternUnits='userSpaceOnUse' width='3'>
            <circle cx='0.8' cy='0.9' fill='#000' opacity='0.08' r='0.22' />
            <circle cx='2.4' cy='2.2' fill='#fff' opacity='0.12' r='0.18' />
          </pattern>
          <filter id={textureId} x='-18%' y='-18%' width='136%' height='136%'>
            <feTurbulence
              baseFrequency='0.92'
              numOctaves='3'
              result='noise'
              seed='7'
              type='fractalNoise'
            />
            <feColorMatrix
              in='noise'
              result='grain'
              type='matrix'
              values='0 0 0 0 0.18 0 0 0 0 0.18 0 0 0 0 0.18 0 0 0 .28 0'
            />
            <feBlend in='SourceGraphic' in2='grain' mode='multiply' />
          </filter>
          <clipPath id={clipId}>
            <circle cx='48' cy='48' r='43' />
          </clipPath>
        </defs>

        <ellipse cx='50' cy='89' fill='#000' opacity='0.28' rx='29' ry='6.5' />
        <circle cx='48' cy='48' fill='#050607' opacity='0.3' r='46' />

        <g clipPath={`url(#${clipId})`} filter={`url(#${textureId})`}>
          <circle cx='48' cy='48' fill={`url(#${surfaceId})`} r='43' />

          <path d='M48 28 L64 40 L58 60 L38 60 L32 40 Z' fill={`url(#${blackPanelId})`} />
          <path d='M48 33 L58 41 L54 55 L42 55 L38 41 Z' fill='#2c3439' opacity='0.72' />
          <path d='M48 37 L54 43 L52 51 L44 51 L42 43 Z' fill='#596267' opacity='0.18' />

          <path d='M48 28 L36 13 L17 20 L18 42 L32 40 Z' fill={`url(#${panelShadeId})`} />
          <path d='M64 40 L78 34 L85 54 L72 73 L58 60 Z' fill='#f8f4eb' />
          <path d='M38 60 L30 77 L49 91 L67 79 L58 60 Z' fill='#eee7d8' />
          <path d='M32 40 L18 42 L11 59 L30 77 L38 60 Z' fill='#e7dfcf' />
          <path d='M64 40 L78 34 L77 14 L60 8 L48 28 Z' fill='#efe8da' />

          <path
            d='M22 21 L32 40 L18 42 M36 13 L48 28 L60 8 M77 14 L78 34 L64 40 M85 54 L72 73 L58 60 M67 79 L58 60 L49 91 M30 77 L38 60 L11 59'
            fill='none'
            stroke='#050607'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='5.2'
          />
          <path
            d='M22 21 L32 40 L18 42 M36 13 L48 28 L60 8 M77 14 L78 34 L64 40 M85 54 L72 73 L58 60 M67 79 L58 60 L49 91 M30 77 L38 60 L11 59'
            fill='none'
            stroke='#161a1d'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='3.25'
          />
          <path
            d='M48 28 L64 40 L58 60 L38 60 L32 40 Z'
            fill='none'
            stroke='#080a0c'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='3.8'
          />
          <path
            d='M48 28 L64 40 L58 60 L38 60 L32 40 Z'
            fill='none'
            stroke='#3e474d'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeOpacity='0.52'
            strokeWidth='1.2'
          />
          <path
            d='M18 42 C25 42 29 42 32 40 M64 40 C70 38 74 36 78 34 M58 60 C62 67 65 73 67 79 M38 60 C35 66 32 72 30 77 M48 28 C52 19 56 13 60 8'
            fill='none'
            stroke='#23282c'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2.25'
          />
          <path
            d='M20 42 C26 48 31 53 38 60 M58 60 C65 57 77 55 85 54 M48 28 C42 30 36 34 32 40 M64 40 C61 35 55 30 48 28'
            fill='none'
            opacity='0.58'
            stroke='#fbf8ef'
            strokeLinecap='round'
            strokeWidth='0.82'
          />

          <path
            d='M48 28 L64 40 L58 60 L38 60 L32 40 Z M18 42 L32 40 L38 60 L30 77 M64 40 L78 34 L85 54 L72 73'
            fill='none'
            opacity='0.42'
            stroke='#000'
            strokeDasharray='1.2 5'
            strokeLinecap='round'
            strokeWidth='1.2'
          />

          <circle cx='40' cy='34' fill='#050607' opacity='0.35' r='0.8' />
          <circle cx='56' cy='34' fill='#050607' opacity='0.35' r='0.8' />
          <circle cx='62' cy='49' fill='#050607' opacity='0.34' r='0.75' />
          <circle cx='55' cy='62' fill='#050607' opacity='0.34' r='0.75' />
          <circle cx='41' cy='62' fill='#050607' opacity='0.34' r='0.75' />
          <circle cx='34' cy='49' fill='#050607' opacity='0.34' r='0.75' />
          <circle cx='29' cy='29' fill='#050607' opacity='0.24' r='0.65' />
          <circle cx='69' cy='27' fill='#050607' opacity='0.24' r='0.65' />
          <circle cx='73' cy='64' fill='#050607' opacity='0.24' r='0.65' />
          <circle cx='27' cy='67' fill='#050607' opacity='0.24' r='0.65' />

          <path
            d='M48 28 L64 40 L58 60 L38 60 L32 40 Z'
            fill={`url(#${panelGlowId})`}
            opacity='0.9'
          />
          <circle cx='48' cy='48' fill={`url(#${leatherGrainId})`} opacity='0.33' r='43' />
          <circle cx='48' cy='48' fill={`url(#${fineGrainId})`} opacity='0.2' r='43' />

          <ellipse
            cx='33'
            cy='22'
            fill='#fff'
            opacity='0.4'
            rx='18'
            ry='9.5'
            transform='rotate(-28 33 22)'
          />
          <ellipse
            cx='30'
            cy='19'
            fill='#fff'
            opacity='0.74'
            rx='7.6'
            ry='3.6'
            transform='rotate(-28 30 19)'
          />
          <ellipse
            cx='25'
            cy='33'
            fill='#fff'
            opacity='0.24'
            rx='6'
            ry='2.6'
            transform='rotate(-34 25 33)'
          />
          <path d='M82 43 C79 65 65 82 42 88 C62 90 85 76 91 53 Z' fill='#000' opacity='0.18' />
          <path d='M10 58 C16 79 33 91 52 91 C34 87 20 76 10 58 Z' fill='#000' opacity='0.1' />
          <circle cx='48' cy='48' fill={`url(#${rimShadeId})`} r='43' />
        </g>

        <circle
          cx='48'
          cy='48'
          fill='none'
          r='43'
          stroke='rgba(255,255,255,0.44)'
          strokeWidth='1.25'
        />
        <circle cx='48' cy='48' fill='none' r='44' stroke='rgba(0,0,0,0.36)' strokeWidth='2' />
      </svg>
    </span>
  )
}
