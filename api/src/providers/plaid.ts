// Plaid provider stub
export type PlaidCreateDebitInput = {
  plaidAccountId: string;
  amount: number;
  currency: string;
  idempotencyKey?: string;
};

export async function plaidCreateAchDebit(input: PlaidCreateDebitInput) {
  // TODO: integrate Plaid Transfer create
  return { transfer_id: 'trf_stub_123', status: 'posted' };
}
