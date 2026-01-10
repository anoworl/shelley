// Context window utility functions

export function getContextBarColor(percentage: number): string {
  if (percentage >= 90) return "var(--error-text)";
  if (percentage >= 70) return "var(--warning-text, #f59e0b)";
  return "var(--blue-text)";
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`;
  return tokens.toString();
}
