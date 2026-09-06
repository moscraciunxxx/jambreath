/** US AQI category + plain-language advice for asthmatic / sensitive groups. */

export type AqiCategory =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous';

export type AqiAdvice = {
  category: AqiCategory;
  band: string;
  general: string;
  sensitive: string;
};

export function aqiCategory(usAqi: number): AqiCategory {
  const v = Math.max(0, usAqi);
  if (v <= 50) return 'Good';
  if (v <= 100) return 'Moderate';
  if (v <= 150) return 'Unhealthy for Sensitive Groups';
  if (v <= 200) return 'Unhealthy';
  if (v <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

export function aqiAdvice(usAqi: number): AqiAdvice {
  const category = aqiCategory(usAqi);
  switch (category) {
    case 'Good':
      return {
        category,
        band: '0–50',
        general: 'Air quality is satisfactory for most people.',
        sensitive:
          'Asthma / sensitive: usually fine outdoors. Still carry your inhaler if you use one; watch for personal triggers.',
      };
    case 'Moderate':
      return {
        category,
        band: '51–100',
        general: 'Acceptable overall; a few people may notice mild irritation.',
        sensitive:
          'Asthma / sensitive: consider shorter outdoor time near heavy traffic. Prefer leave-later or a less congested corridor if you feel chesty.',
      };
    case 'Unhealthy for Sensitive Groups':
      return {
        category,
        band: '101–150',
        general: 'Sensitive groups may feel effects; general public is less likely to be affected.',
        sensitive:
          'Asthma / sensitive: limit prolonged outdoor exposure near jams. Prefer transit / bike paths away from corridors, or delay the trip. Keep rescue meds handy.',
      };
    case 'Unhealthy':
      return {
        category,
        band: '151–200',
        general: 'Everyone may begin to experience health effects; sensitive groups more seriously.',
        sensitive:
          'Asthma / sensitive: avoid sitting in traffic with windows down. Strongly prefer remote / leave-later / indoor wait. Consider N95 if you must be outdoors.',
      };
    case 'Very Unhealthy':
      return {
        category,
        band: '201–300',
        general: 'Health alert: everyone may experience more serious effects.',
        sensitive:
          'Asthma / sensitive: stay indoors with filtered air if possible. Do not idle in congested corridors for errands that can wait.',
      };
    default:
      return {
        category,
        band: '301+',
        general: 'Emergency conditions — entire population is more likely to be affected.',
        sensitive:
          'Asthma / sensitive: emergency precautions. Avoid outdoor exposure; follow local health advisories.',
      };
  }
}
