// `new Date("2026-12-02")` parses date-only strings as UTC midnight, which lands on a
// different day/time locally. Build the date from parts so it is local midnight.
export function dateInputToTimestamp(dateInput: string) {
  const [year, month, day] = dateInput.split("-").map(Number);
  return BigInt(Math.floor(new Date(year, month - 1, day).getTime() / 1000));
}

export function formatDate(unlockDate: bigint) {
  return new Date(Number(unlockDate) * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
