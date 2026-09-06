/** Lightweight city label from geocode / preset text. */
export function detectCityFromLabel(destinationLabel: string, originLabel?: string): string {
  const text = `${destinationLabel} ${originLabel || ''}`.toLowerCase();
  const presets: Array<[RegExp, string]> = [
    [/los angeles|echo park|downtown la|\bla\b/, 'Los Angeles'],
    [/san francisco|mission district|financial district|\bsf\b/, 'San Francisco'],
    [/seattle|u-district|university district/, 'Seattle'],
    [/chicago/, 'Chicago'],
  ];
  for (const [re, city] of presets) {
    if (re.test(text)) return city;
  }
  const m = destinationLabel.match(/,\s*([^,]+?)(?:,\s*[A-Z]{2})?$/);
  if (m) return m[1].trim();
  return 'Unknown city';
}
