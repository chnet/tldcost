// CountryFlag (design system): 16x12 flag plus ISO code in front of the provider name. The flags
// are flag-icons SVGs (MIT) copied to public/flags/ and served from tldcost.io itself: no CDN, no
// emoji. The image carries the country name; the visible code is aria-hidden, so screen readers
// hear the name once.
export default function CountryFlag({ code, name }: { code: string; name: string }) {
  const cc = code.toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return null;
  return (
    <span class="tc-country">
      <img
        class="tc-flag"
        src={`/flags/${cc}.svg`}
        width={16}
        height={12}
        alt={name}
        title={name}
        loading="lazy"
        decoding="async"
      />
      <span class="tc-cc" aria-hidden="true">
        {code.toUpperCase()}
      </span>
    </span>
  );
}
