// Geolocalisation par IP — Vercel fournit le pays du visiteur dans un
// en-tete de requete, aucun service externe necessaire. Sert uniquement a
// pre-selectionner le pays (France / Cote d'Ivoire / Cameroun) au premier
// passage ; l'utilisateur peut toujours changer via le selecteur du footer.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const pays = req.headers['x-vercel-ip-country'] || null;
  return res.status(200).json({ pays });
}
