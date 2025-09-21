// Authorize.Net provider stub
export type AuthNetChargeInput = {
  token: string;
  amount: number;
  currency: string;
  capture?: boolean;
};

export async function authNetCharge(input: AuthNetChargeInput) {
  // TODO: call Authorize.Net createTransactionRequest
  return { transId: 'authnet_tx_123', approved: true, authCode: 'A1B2C3' };
}
