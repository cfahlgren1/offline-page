/** When a page was last changed, for the sidebar: today's pages show the time, older ones the date. */
export function when(timestamp: number): string {
  const date = new Date(timestamp);
  if (date.toDateString() === new Date().toDateString()) {
    // The time without AM/PM, which the sidebar has no room for: "9:41".
    const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatToParts(date);
    return parts
      .filter(
        (part) => part.type === "hour" || part.type === "minute" || (part.type === "literal" && part.value.trim()),
      )
      .map((part) => part.value)
      .join("");
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
