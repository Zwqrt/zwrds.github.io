// Edge Function verify-telegram
// Принимает Telegram initData, проверяет HMAC по BOT_TOKEN и сверяет user.id с OWNER_ID.
// Если всё верно — возвращает сессию Supabase (access JWT + refresh) единственного
// пользователя-владельца с app_metadata.tg_owner = true. RLS пускает только его.
//
// Секреты (supabase secrets set ...): BOT_TOKEN, OWNER_ID.
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const MAX_AGE_SEC = 24 * 60 * 60;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
export async function verifyInitData(initData: string, botToken: string): Promise<{ id: number } | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const calc = hex(await hmac(secret, dataCheck));
  if (!safeEqual(calc, hash)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;
  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    return user && typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const BOT_TOKEN = Deno.env.get('BOT_TOKEN');
  const OWNER_ID = Deno.env.get('OWNER_ID');
  const URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!BOT_TOKEN || !OWNER_ID || !URL || !SERVICE_KEY) return json(500, { error: 'Функция не настроена: нет секретов' });

  let initData = '';
  try {
    initData = String((await req.json()).initData ?? '');
  } catch {
    return json(400, { error: 'Нужен JSON {initData}' });
  }
  if (!initData) return json(401, { error: 'Нет initData — откройте приложение через Telegram' });

  const user = await verifyInitData(initData, BOT_TOKEN);
  if (!user) return json(401, { error: 'Подпись Telegram не прошла проверку или устарела' });
  if (String(user.id) !== OWNER_ID.trim()) return json(403, { error: 'Приложение личное: доступ только у владельца' });

  const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `tg${OWNER_ID.trim()}@owner.kartu-grades.app`;

  // Пользователь-владелец: создаём при первом входе (ошибку «уже существует» игнорируем).
  await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { tg_owner: true } });

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data?.properties?.hashed_token) {
    return json(500, { error: `generateLink: ${link.error?.message ?? 'нет токена'}` });
  }
  if (link.data.user && link.data.user.app_metadata?.tg_owner !== true) {
    await admin.auth.admin.updateUserById(link.data.user.id, { app_metadata: { tg_owner: true } });
  }

  // Обмениваем одноразовый токен на сессию — письмо никуда не отправляется.
  const authClient = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
  if (error || !data.session) return json(500, { error: `verifyOtp: ${error?.message ?? 'нет сессии'}` });

  return json(200, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
});
