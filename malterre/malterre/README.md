# Malterre — Seigneurs des Hordes (V1)

Jeu multijoueur 3D pour navigateur (mobile et ordinateur). Chaque joueur incarne un seigneur (Liche ou Roi gobelin), bâtit sa forteresse, envoie ses serviteurs récolter et part chasser les monstres.

## Lancer en local

    npm start

Puis ouvrir http://localhost:3000. Aucune installation n'est obligatoire (Node 18 ou plus).

## Mise en ligne sur Render (via GitHub)

1. Envoyer ce dossier dans un dépôt GitHub.
2. Sur Render : New > Web Service, choisir le dépôt. Build : `npm install`, Start : `npm start`.
3. Ajouter les variables d'environnement :
   - `ADMIN_PASSWORD` : mot de passe de la page admin (`/admin`). Sans lui, la page admin est désactivée.
   - `DATABASE_URL` : adresse d'une base PostgreSQL (voir ci-dessous).

## Sauvegarde du monde (important)

Par défaut le monde est enregistré dans le fichier `data/world.json`. Sur un hébergement dont le disque est effacé à chaque redémarrage (c'est en général le cas des offres gratuites), ce fichier est perdu quand le serveur s'endort.

Pour un monde vraiment persistant, créer une base PostgreSQL (Render, Neon, Supabase…) et mettre son adresse dans `DATABASE_URL` (avec `?sslmode=require` si l'hébergeur le demande). Le jeu y enregistre alors tout, toutes les 20 secondes et à l'arrêt.

Autre solution : un disque persistant, avec `DATA_DIR` pointant dessus.

La page admin permet aussi de télécharger et de restaurer une sauvegarde.

## Page admin

`/admin` : état du serveur, joueurs, dons de ressources, réglages (réapparition des mobs, régénération des gisements, multiplicateurs), annonce, sauvegarde, régénération du monde et remise à zéro complète.

## Organisation

- `shared/data.js` : toutes les valeurs du jeu (classes, serviteurs, monstres, bâtiments, coûts).
- `server/` : serveur (simulation du monde, WebSocket, sauvegarde).
- `public/` : client (moteur 3D, modèles, sons, interface) et page admin.
