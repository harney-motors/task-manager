// Brand mark + wordmark, derived from docs/tickd_final_brand_sheet.
//
// Geometry (canonical 100×100):
//   Square corner radius: 22% of side length
//   Check stroke width:   11% of side length
//   Check path:           M (22, 52) L (40, 68) L (76, 28)
//
// In dark mode the icon does NOT invert — it stays blue. The wordmark
// switches to white via the surrounding text color.

const BRAND_BLUE = '#185FA5'
const CHECK_PATH_RATIOS = [
  [0.22, 0.52],
  [0.40, 0.68],
  [0.76, 0.28],
]

export function TickdMark({ size = 32, className }) {
  const radius = size * 0.22
  const stroke = size * 0.11
  const [p1, p2, p3] = CHECK_PATH_RATIOS.map(([x, y]) => [x * size, y * size])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
    >
      <rect width={size} height={size} rx={radius} fill={BRAND_BLUE} />
      <path
        d={`M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]}`}
        stroke="white"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TickdWordmark({ size = 'small', className, style }) {
  // Brand spec: -0.05em letter-spacing for large display sizes,
  // -0.03em for small in-app sizes.
  const letterSpacing = size === 'large' ? '-0.05em' : '-0.03em'
  return (
    <span
      className={className}
      style={{
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        letterSpacing,
        ...style,
      }}
    >
      Tickd.
    </span>
  )
}
