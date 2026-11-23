# Calendrier de l'Avent A.V.I.D – Pièces Automobiles

Site interactif de calendrier de l'Avent pour les clients professionnels A.V.I.D.
24 cases numérotées, une case disponible par jour (fuseau Europe/Paris), fiche promotionnelle,
espace administrateur protégé, QR code et métadonnées de partage.

**Aucune dépendance externe** : uniquement Node.js (version 18 ou supérieure).

---

## 1. Contenu du projet

```
avid-calendrier-avent/
├── server.js              Serveur HTTP + règles d'accès (aucune case future n'est envoyée)
├── lib/
│   ├── dates.js           Dates et fuseau Europe/Paris
│   ├── status.js          Statut de chaque case (verrouillée, ouverte, expirée…)
│   ├── store.js           Lecture/écriture des promotions, validation des saisies
│   └── auth.js            Connexion administrateur (mot de passe + session signée)
├── data/
│   └── promotions.json    LES 24 PROMOTIONS (fictives pour l'instant) ET LA CONFIGURATION
├── public/
│   ├── index.html         Page du calendrier
│   ├── admin.html         Espace administrateur (accès : /admin)
│   ├── css/style.css      Charte graphique
│   ├── js/app.js          Interactions du calendrier
│   ├── js/admin.js        Interactions de l'espace administrateur
│   ├── assets/logo.svg    Logo PROVISOIRE à remplacer par votre logo officiel
│   ├── images/placeholder.svg   Photo de démonstration
│   └── uploads/           Photos importées depuis l'espace administrateur
├── test/                  Tests automatiques des règles de dates
├── Dockerfile             Pour un hébergement conteneurisé
└── package.json
```

---

## 2. Tester sur votre ordinateur

1. Installez Node.js 18+ (https://nodejs.org).
2. Ouvrez un terminal dans le dossier du projet.
3. Lancez le serveur en définissant un mot de passe administrateur :

   **Windows (PowerShell)**
   ```powershell
   $env:ADMIN_PASSWORD="choisissez-un-mot-de-passe-long"; node server.js
   ```

   **macOS / Linux**
   ```bash
   ADMIN_PASSWORD="choisissez-un-mot-de-passe-long" node server.js
   ```

4. Ouvrez dans le navigateur :
   - **http://localhost:3000** : le calendrier tel que le voient vos clients ;
   - **http://localhost:3000/admin** : l'espace administrateur.

Sans `ADMIN_PASSWORD`, un mot de passe temporaire est affiché dans le terminal (usage local uniquement).

**Vérifier les règles d'accès :** `npm test` (ou `node --test`).

### Voir toutes les cases (aperçu)

- Depuis l'espace administrateur, cliquez sur **Mode démonstration (toutes les cases)** : toutes les cases s'ouvrent, uniquement pour l'administrateur connecté.
- Pour une case précise, cliquez sur **Prévisualiser cette case**.

Les visiteurs non connectés ne peuvent jamais voir une case avant sa date.

---

## 3. Utiliser l'espace administrateur

Accès : `https://votre-domaine.fr/admin` (page non indexée par les moteurs de recherche).

| Action | Où |
|---|---|
| Ajouter ou modifier une promotion (titre, remise, description, marques, références, conditions) | Liste des 24 cases → case → formulaire → **Enregistrer la case** |
| Importer les photos du produit ou de la marque (JPEG, PNG, WebP, 2 Mo max.) | Section « Photos » de la case |
| Programmer la date de publication | Champ « Date de publication » (vide = jour correspondant de décembre) |
| Fixer une fin de validité (la case affiche alors « Offre expirée ») | Champ « Fin de validité » |
| Activer ou désactiver une promotion | Case « Promotion active » |
| Prévisualiser une case | Bouton **Prévisualiser cette case** |
| Changer l'année de campagne (2026 par défaut) | Section « Campagne » |
| Générer le QR code | Section « Lien et QR code » |

**Sécurité de l'accès**
- Le mot de passe n'est jamais écrit dans le code ni dans les données : il est fourni par la variable d'environnement `ADMIN_PASSWORD`.
- La session expire après 8 heures ; le cookie est `HttpOnly` et `SameSite=Strict`.
- Après 10 échecs de connexion depuis une même adresse, les tentatives sont bloquées 15 minutes.

---

## 4. Remplacer les contenus fictifs par vos promotions

Les 24 promotions actuelles sont des **démonstrations** (titres préfixés « [DÉMO] »).
Vous pouvez les modifier dans l'espace administrateur, ou directement dans `data/promotions.json`.

Structure d'une case :

```json
{
  "day": 1,
  "enabled": true,
  "publishAt": "",
  "validUntil": "",
  "title": "Titre de la promotion",
  "discount": "-15 %",
  "description": "Description complète…",
  "brands": ["Nom de la marque"],
  "references": ["REF-123", "REF-456"],
  "conditions": "Conditions de l'offre…",
  "images": ["/uploads/photo-produit.jpg"]
}
```

Champs de configuration (haut du fichier) :
- `campaignYear` : année de la campagne (2026 pour la première version) ;
- `showDemoBanner` : `true` affiche le bandeau « Mode démonstration » ; passez-le à `false` pour la campagne réelle.

**Logo** : remplacez `public/assets/logo.svg` par votre logo officiel, en gardant le même nom de fichier.

**Aperçu de partage** : une fois le domaine connu, remplacez `VOTRE-DOMAINE.fr` dans `public/index.html`
et créez une image `public/assets/og-image.jpg` de 1200 × 630 pixels (logo + visuel de la campagne).
Cette image sera affichée lors du partage du lien (SMS, e-mail, réseaux sociaux).

---

## 5. Garantie : les promotions futures ne sont jamais envoyées

- Le serveur décide, à chaque requête, quelles cases sont disponibles selon la date du jour à Paris.
- Une case verrouillée ne transmet que son numéro et sa date de déblocage. Son titre, sa description et ses photos n'apparaissent **nulle part** dans les réponses envoyées au navigateur.
- Le fichier `data/promotions.json` n'est pas accessible depuis le site (testé : réponse 404).
- Le détail d'une case verrouillée renvoie une erreur 403 tant que la date n'est pas atteinte.

---

## 6. Mise en ligne

Le site a besoin d'un **serveur Node.js avec un disque persistant**, car l'espace administrateur enregistre les modifications dans `data/promotions.json` et les photos dans `public/uploads/`.

### Option A – Hébergement Node.js simple (recommandé : Render, Railway, Fly.io)

1. Créez un compte et un nouveau service « Web Service » à partir du dépôt ou du dossier du projet.
2. Commande de démarrage : `node server.js`. Version Node : 18 ou supérieure.
3. Variables d'environnement à définir :
   - `ADMIN_PASSWORD` : mot de passe administrateur (obligatoire) ;
   - `SESSION_SECRET` : longue chaîne aléatoire (recommandé) ;
   - `COOKIE_SECURE=1` : active le cookie sécurisé en HTTPS (recommandé) ;
   - `DATA_FILE` : chemin du fichier de données si vous utilisez un disque monté (ex. `/data/promotions.json`).
4. Ajoutez un **disque persistant** (volume) pour que les modifications survivent aux redémarrages.
5. Associez votre domaine (ex. `calendrier.avid-pieces.fr`) et activez le HTTPS (automatique chez ces hébergeurs).

### Option B – Conteneur Docker (tout hébergeur acceptant Docker)

```bash
docker build -t avid-avent .
docker run -d -p 80:3000 \
  -e ADMIN_PASSWORD="mot-de-passe-long" \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e COOKIE_SECURE=1 \
  -v avid-avent-data:/app/data \
  -v avid-avent-uploads:/app/public/uploads \
  avid-avent
```

### Option C – Serveur (VPS) avec Nginx

Installez Node.js, copiez le projet, lancez-le avec `pm2` ou un service systemd, puis placez Nginx devant (port 3000 vers 80/443) et obtenez un certificat HTTPS gratuit avec Let's Encrypt.

### Vercel ou Netlify : attention

Le **site public** peut fonctionner sur ces plateformes, mais **l'espace administrateur ne peut pas enregistrer de modifications** : leur système de fichiers ne persiste pas. Pour les utiliser, il faut remplacer le stockage JSON par une base de données (par exemple Postgres ou un stockage clé-valeur). Cette adaptation est possible ; demandez-la si vous voulez rester sur ces plateformes.

---

## 7. Lien et QR code

- **Lien** : `https://votre-domaine.fr/` (à envoyer à vos clients par e-mail, SMS, réseaux sociaux).
- **QR code** : dans l'espace administrateur, saisissez l'adresse définitive puis cliquez sur **Générer le QR code**.
  Le QR code est produit par un service externe (api.qrserver.com) ; seule l'adresse du calendrier y est transmise.
  Enregistrez l'image pour vos affiches et e-mails.

---

## 8. Points de vigilance avant la campagne

- Remplacez le logo provisoire, l'image de partage et les adresses `VOTRE-DOMAINE.fr`.
- Définissez un **mot de passe administrateur fort**, et ne le partagez qu'avec les personnes concernées.
- Passez `showDemoBanner` à `false` et vérifiez chaque case sur téléphone avant l'envoi.
- Faites une sauvegarde régulière de `data/promotions.json` et de `public/uploads/`.
- Les conditions commerciales réelles doivent être validées par votre service juridique ou commercial.

---

## 9. Dépannage

| Problème | Solution |
|---|---|
| « Port déjà utilisé » | Changez le port : `PORT=3001 node server.js` |
| Le mot de passe admin ne fonctionne pas | Vérifiez la variable `ADMIN_PASSWORD` au démarrage du serveur (il faut redémarrer après la modification) |
| Les modifications disparaissent après un redémarrage | Le stockage n'est pas persistant : utilisez un volume ou un disque monté (voir section 6) |
| Une case ne s'ouvre pas le jour prévu | Vérifiez la date de publication et l'année de campagne ; rappel : le fuseau est Europe/Paris |
| Le partage n'affiche pas l'aperçu | Vérifiez l'URL dans les balises `og:` de `index.html` et la taille de l'image (1200 × 630) |
