export type UserRecord = {
  id: string;
  email: string | null;
  name: string | null;
};

export type PickSurvivorResult =
  | { kind: "same"; user: UserRecord }
  | { kind: "merge"; survivor: UserRecord; absorbed: UserRecord }
  | { kind: "both-have-email"; issuer: UserRecord; consumer: UserRecord };

export function pickSurvivor(issuer: UserRecord, consumer: UserRecord): PickSurvivorResult {
  if (issuer.id === consumer.id) {
    return { kind: "same", user: issuer };
  }
  const issuerHasEmail = Boolean(issuer.email);
  const consumerHasEmail = Boolean(consumer.email);
  if (issuerHasEmail && consumerHasEmail) {
    return { kind: "both-have-email", issuer, consumer };
  }
  if (issuerHasEmail) {
    return { kind: "merge", survivor: issuer, absorbed: consumer };
  }
  if (consumerHasEmail) {
    return { kind: "merge", survivor: consumer, absorbed: issuer };
  }
  return { kind: "merge", survivor: issuer, absorbed: consumer };
}
