// Shimmering placeholder box - the building block every page's loading
// state is made of. Sized/shaped per use (a line of text, a photo, a stat
// tile) via width/height/radius rather than a single fixed skeleton shape.
export default function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, #ECEDEF 25%, #F5F6F7 37%, #ECEDEF 63%)',
        backgroundSize: '640px 100%',
        animation: 'bcs-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
