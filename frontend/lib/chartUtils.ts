/**
 * Utility functions for rendering, formatting, and scaling charts beautifully and responsively.
 */

/**
 * Formats a number into a clean compact notation (e.g. 1.2M, 42.8M, 2.0M, 15.5K).
 * Handles thousands (K), millions (M), billions (B), and trillions (T).
 */
export function formatCompactNumber(value: unknown): string {
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);

  const absNum = Math.abs(num);
  if (absNum >= 1.0e12) {
    return (num / 1.0e12).toFixed(1) + 'T';
  }
  if (absNum >= 1.0e9) {
    return (num / 1.0e9).toFixed(1) + 'B';
  }
  if (absNum >= 1.0e6) {
    return (num / 1.0e6).toFixed(1) + 'M';
  }
  if (absNum >= 1.0e3) {
    return (num / 1.0e3).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Intelligently formats tooltip values based on their metric keys.
 * Standardizes:
 * - Revenue/Billing -> clean currency formatted with commas (e.g. $1,200,000)
 * - Deal size/Averages -> rounded compact value (e.g. $12.5K) or limited decimals
 * - Counts -> standard integer format with commas
 */
export function formatTooltipValue(value: number, key: string): string {
  const normalizedKey = key.toLowerCase();

  // If it's a count, id, quantity, or recruiter series
  if (
    normalizedKey.includes('count') ||
    normalizedKey.includes('quantity') ||
    normalizedKey.includes('id') ||
    normalizedKey.includes('number') ||
    normalizedKey.includes('placement') ||
    normalizedKey === 'recruiter' ||
    normalizedKey === 'candidate_count'
  ) {
    return Math.round(value).toLocaleString();
  }

  // If it's average, deal size, rate, or percentage, format as a clean rounded/limited decimal compact value
  if (
    normalizedKey.includes('avg') ||
    normalizedKey.includes('average') ||
    normalizedKey.includes('size') ||
    normalizedKey.includes('rate') ||
    normalizedKey.includes('percent')
  ) {
    const isMonetary =
      normalizedKey.includes('billing') ||
      normalizedKey.includes('deal') ||
      normalizedKey.includes('amount') ||
      normalizedKey.includes('revenue') ||
      normalizedKey.includes('value');
    
    // Use limited decimals for small averages, or compact format for larger averages
    if (Math.abs(value) < 1000) {
      const formatted = value.toFixed(2).replace(/\.00$/, '');
      return isMonetary ? `$${formatted}` : formatted;
    }
    const formatted = formatCompactNumber(value);
    return isMonetary ? `$${formatted}` : formatted;
  }

  // If it's general revenue/monetary value (total, tax, billingamount, dealvalue, revenue, amount)
  if (
    normalizedKey.includes('revenue') ||
    normalizedKey.includes('billing') ||
    normalizedKey.includes('deal') ||
    normalizedKey.includes('amount') ||
    normalizedKey.includes('total') ||
    normalizedKey.includes('tax') ||
    normalizedKey.includes('value')
  ) {
    return `$${Math.round(value).toLocaleString()}`;
  }

  // Fallback to standard formatted number with up to 2 decimal places
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Dynamically assigns series to Left or Right Y-axis based on orders of magnitude.
 * If one series is significantly larger than another (e.g. >= 3x difference in max value),
 * separate scales are used (Dual Y-axes) to maintain visual hierarchy and visibility.
 */
export function getSeriesYAxisAssignment(
  data: any[],
  seriesKeys: string[]
): {
  useDualAxes: boolean;
  assignments: Record<string, 'left' | 'right'>;
} {
  const assignments: Record<string, 'left' | 'right'> = {};

  if (!seriesKeys || seriesKeys.length < 2) {
    if (seriesKeys && seriesKeys.length > 0) {
      assignments[seriesKeys[0]] = 'left';
    }
    return { useDualAxes: false, assignments };
  }

  // Find the maximum value for each series key
  const maxValues = seriesKeys.map((key) => {
    let max = 0;
    data.forEach((row) => {
      const val = Number(row?.[key]);
      if (Number.isFinite(val) && val > max) {
        max = val;
      }
    });
    return { key, max };
  });

  // Sort series keys by their max value
  const sorted = [...maxValues].sort((a, b) => b.max - a.max);
  const primaryMax = sorted[0].max;
  const secondaryMax = sorted[sorted.length - 1].max;

  // Use dual axes if there is at least a 3x difference in magnitude
  const useDualAxes = primaryMax > 0 && secondaryMax > 0 && primaryMax / secondaryMax >= 3.0;

  if (useDualAxes) {
    // Determine cutoff using geometric mean to separate scales cleanly
    const threshold = Math.sqrt(primaryMax * secondaryMax);
    maxValues.forEach((item) => {
      assignments[item.key] = item.max >= threshold ? 'left' : 'right';
    });
  } else {
    // Put all on the left axis
    seriesKeys.forEach((key) => {
      assignments[key] = 'left';
    });
  }

  return { useDualAxes, assignments };
}

/**
 * Calculates dynamic widths for the Y-axes based on the maximum formatted label length.
 * Adds left padding and prevents graph container misalignment.
 */
export function calculateAxisWidths(
  data: any[],
  assignments: Record<string, 'left' | 'right'>,
  useDualAxes: boolean
): { leftWidth: number; rightWidth: number } {
  let maxLeftLen = 0;
  let maxRightLen = 0;

  data.forEach((row) => {
    Object.entries(assignments).forEach(([key, axis]) => {
      const val = Number(row?.[key]);
      if (Number.isFinite(val)) {
        const formatted = formatCompactNumber(val);
        if (axis === 'left') {
          maxLeftLen = Math.max(maxLeftLen, formatted.length);
        } else {
          maxRightLen = Math.max(maxRightLen, formatted.length);
        }
      }
    });
  });

  // 7.5px per character, plus 16px padding
  const leftWidth = Math.max(44, Math.min(80, maxLeftLen * 7.5 + 16));
  const rightWidth = useDualAxes ? Math.max(44, Math.min(80, maxRightLen * 7.5 + 16)) : 0;

  return { leftWidth, rightWidth };
}

function formatAxisMetricLabel(key: string): string {
  return key
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildAxisLabel(
  seriesKeys: string[],
  assignments: Record<string, 'left' | 'right'>,
  side: 'left' | 'right'
): string {
  const sideLabel = side === 'left' ? 'Left axis' : 'Right axis';
  const labels = seriesKeys
    .filter((key) => assignments[key] === side)
    .map((key) => formatAxisMetricLabel(key))
    .filter(Boolean);

  if (labels.length === 0) {
    return sideLabel;
  }

  if (labels.length === 1) {
    return `${sideLabel}: ${labels[0]}`;
  }

  const visibleLabels = labels.slice(0, 2).join(', ');
  const remaining = labels.length - 2;

  return `${sideLabel}: ${visibleLabels}${remaining > 0 ? ` +${remaining}` : ''}`;
}

/**
 * Truncates long text labels to prevent X-axis clutter.
 */
export function truncateLabel(value: unknown, maxLength: number = 14): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length > maxLength) {
    return str.substring(0, maxLength - 3) + '...';
  }
  return str;
}
