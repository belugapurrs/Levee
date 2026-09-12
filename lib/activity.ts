export type ActivityEvent = {
  id: string;
  kind: "added" | "held" | "sent" | "released" | "failed";
  action: "add" | "hold" | "spend" | "release";
  amount: string;
  label?: string;
  at: number;
  status: "confirmed" | "failed";
  hash: string | null;
  errorMessage?: string;
};
