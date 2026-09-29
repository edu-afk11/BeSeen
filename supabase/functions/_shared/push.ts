const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendExpoPush(admin: any, messages: Array<Record<string, unknown>>) {
  if (!messages.length) return 0;
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Expo push request failed: ${response.status}`);
  let payload: { data?: unknown };
  try { payload = await response.json(); } catch { throw new Error('Expo push returned invalid JSON'); }
  const tickets = Array.isArray(payload?.data) ? payload.data : [payload?.data];
  if (tickets.length !== messages.length || tickets.some((ticket: any) => !ticket || !['ok', 'error'].includes(ticket.status))) throw new Error('Expo push returned invalid tickets');
  const invalidTokens: string[] = [];
  const retryableErrors: string[] = [];
  let sent = 0;
  tickets.forEach((ticket: any, index: number) => {
    if (ticket?.status === 'ok') sent += 1;
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      const token = messages[index]?.to;
      if (typeof token === 'string') invalidTokens.push(token);
    }
    if (ticket?.status === 'error' && ticket?.details?.error !== 'DeviceNotRegistered') retryableErrors.push(ticket?.details?.error ?? 'UnknownPushError');
  });
  if (invalidTokens.length) await admin.from('push_tokens').delete().in('token', invalidTokens);
  if (retryableErrors.length && sent === 0) throw new Error(`Expo push rejected delivery: ${retryableErrors.join(',')}`);
  return sent;
}
