/**
 * Helper script to calculate Unix timestamp for specific dates
 * For Year 1 start time configuration
 */

function calculateTimestamp(dateString: string): number {
  const date = new Date(dateString);
  return Math.floor(date.getTime() / 1000);
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString();
}

console.log("=== Year Start Timestamp Calculator ===\n");

// January 1, 2025 00:00:00 UTC
const jan1_2025 = calculateTimestamp("2025-01-01T00:00:00.000Z");
console.log(`January 1, 2025 00:00:00 UTC`);
console.log(`   Timestamp: ${jan1_2025}`);
console.log(`   Verification: ${formatTimestamp(jan1_2025)}\n`);

// January 1, 2026 00:00:00 UTC (Year 2)
const jan1_2026 = calculateTimestamp("2026-01-01T00:00:00.000Z");
console.log(`January 1, 2026 00:00:00 UTC (Year 2)`);
console.log(`   Timestamp: ${jan1_2026}`);
console.log(`   Verification: ${formatTimestamp(jan1_2026)}\n`);

// Current time
const now = Math.floor(Date.now() / 1000);
console.log(`Current Time`);
console.log(`   Timestamp: ${now}`);
console.log(`   Date: ${formatTimestamp(now)}\n`);

// Usage examples
console.log("=== Usage Examples ===\n");
console.log("For deployment script, use:");
console.log(`  const YEAR_START_TIME = ${jan1_2025}; // Jan 1, 2025 00:00:00 UTC`);
console.log(`  const YEAR_START_TIME = 0; // Use block.timestamp (deploy time)`);
console.log(`  const YEAR_START_TIME = ${now}; // Use current time\n`);

export { calculateTimestamp, formatTimestamp };

