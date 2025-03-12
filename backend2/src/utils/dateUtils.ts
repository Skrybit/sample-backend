export function timestampToDateString(timestamp: number): string {
  const date = new Date(timestamp * 1000); // Convert to milliseconds
  const padZero = (n: number) => n.toString().padStart(2, '0');

  return (
    `${date.getUTCFullYear()}-${padZero(date.getUTCMonth() + 1)}-${padZero(date.getUTCDate())} ` +
    `${padZero(date.getUTCHours())}:${padZero(date.getUTCMinutes())}:${padZero(date.getUTCSeconds())}`
  );
}

export function dateStringToTimestamp(dateString: string): number {
  const [datePart, timePart] = dateString.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);

  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  return Math.floor(date.getTime() / 1000);
}

export function isValidTimestamp(input: string | number): boolean {
  try {
    let timestamp: number;

    if (typeof input === 'string') {
      if (/^\d+$/.test(input)) {
        // Numeric string
        timestamp = parseInt(input, 10);
        if (input.length === 13) timestamp = Math.floor(timestamp / 1000);
      } else {
        // Date string
        timestamp = dateStringToTimestamp(input);
      }
    } else {
      timestamp = input;
    }

    // Bitcoin genesis block timestamp (2009-01-03) as minimum
    const MIN_TIMESTAMP = 1231006505;
    return timestamp >= MIN_TIMESTAMP && !isNaN(timestamp) && timestamp <= Date.now() / 1000 + 86400; // Allow 1 day future
  } catch {
    return false;
  }
}

export function getUTCTimestampInSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function dateToUTCTimestamp(dateString: string): number {
  const date = new Date(dateString + 'Z'); // Force UTC
  return Math.floor(date.getTime() / 1000);
}
