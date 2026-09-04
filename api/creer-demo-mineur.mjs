// Endpoint one-shot pour creer le compte demo mineur (Apple review 2.3.6).
// Volontairement rigide : email cible EN DUR, secret partage requis, expire.
//
// Une fois qu'Apple a valide et qu'on n'en a plus besoin, cet endpoint sera
// supprime. En attendant, la triple contrainte (secret + email fige + date
// d'expiration inline) fait qu'il ne peut rien creer d'autre que ce compte.

const EMAIL_CIBLE = 'demo-mineur@ninjascores.com';
const DOB = '2015-06-15';
const EXPIRE_LE = '2026-09-15';   // apres cette date, l'endpoint refuse

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Verrou temporel
  if (new Date().toISOString().slice(0, 10) > EXPIRE_LE) {
    return res.status(410).json({ error: 'expired', message: 'delete this endpoint file' });
  }

  const secret = req.query.secret;
  if (!secret || secret !== process.env.CREER_DEMO_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const URL = process.env.SUPABASE_URL;
  const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !SRK) return res.status(500).json({ error: 'env missing' });

  const password = req.query.pw;
  if (!password || password.length < 12) {
    return res.status(400).json({ error: 'need pw >= 12 chars in ?pw=' });
  }

  const H = { 'Content-Type': 'application/json', apikey: SRK, Authorization: 'Bearer ' + SRK };

  try {
    // 1) Cree l'utilisateur (email_confirm: true = pas d'email a envoyer)
    const rCreate = await fetch(URL + '/auth/v1/admin/users', {
      method: 'POST', headers: H,
      body: JSON.stringify({ email: EMAIL_CIBLE, password, email_confirm: true,
                             user_metadata: { date_of_birth: DOB } }),
    });
    if (!rCreate.ok) {
      const t = await rCreate.text();
      return res.status(rCreate.status).json({ etape: 'create', status: rCreate.status, message: t });
    }
    const created = await rCreate.json();
    const uid = created.id;

    // 2) UPSERT profil avec date_of_birth (le trigger sur auth.users creera
    // peut-etre la ligne, on merge pour ecraser is_minor calcule ou non).
    await new Promise(r => setTimeout(r, 400));
    const rProf = await fetch(URL + '/rest/v1/profiles?on_conflict=id', {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ id: uid, date_of_birth: DOB }),
    });
    const profText = await rProf.text();

    // 3) Verification
    const rCheck = await fetch(URL + '/rest/v1/profiles?id=eq.' + uid + '&select=id,is_minor,date_of_birth', { headers: H });
    const check = await rCheck.text();

    return res.status(200).json({
      ok: true,
      email: EMAIL_CIBLE,
      uid,
      dob: DOB,
      profil_upsert: { status: rProf.status, body: profText },
      profil_actuel: check,
    });
  } catch (e) {
    return res.status(500).json({ error: 'exception', message: e.message });
  }
}
