export const defaultLimits = { appMinute: 3, appDay: 100, sessionMinute: 2, sessionDay: 20 };

export function parseLimits(values) {
  const limits = {};
  for (const [name, fallback] of Object.entries(defaultLimits)) {
    const number = Number(values[name] ?? fallback);
    if (!Number.isInteger(number) || number < 1 || number > 500) throw new Error('Invalid quota configuration');
    limits[name] = number;
  }
  return limits;
}
