export function sanitizeUserId(value: string) {
  return value.replace(/[.#$[\]|/]/g, "_");
}

export function formatUserId(value: string | null | undefined) {
  return sanitizeUserId(value ?? "anonymous");
}
