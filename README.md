# Assiette

Assiette est un journal nutritionnel personnel en français. L’application fonctionne dans le navigateur et s’héberge gratuitement depuis la racine d’un dépôt public avec [GitHub Pages](https://docs.github.com/fr/pages/getting-started-with-github-pages/what-is-github-pages).

## Utilisation

1. Dans **Profil**, renseigne ton âge, ta taille, ton poids, ton objectif, ton activité quotidienne et le nombre de séances de sport par semaine. Les repères d’énergie et de macronutriments évoluent avec ton profil.
2. Dans **Journal**, écris par exemple « 150 g de poulet, riz cuit, 1/2 avocat ». Vérifie les portions proposées et ajuste les valeurs pour 100 g ou 100 ml selon l’étiquette ou la recette. La recherche Open Food Facts accepte un nom de produit ou un code-barres. Les données absentes donnent lieu à un total partiel.
3. Enregistre les boissons dans le même journal. Le volume affiché correspond aux boissons saisies en ml. Le bilan compare les entrées du jour aux repères disponibles.
4. Consulte les jours précédents et enregistre tes pesées dans **Historique**. Chaque journée enregistrée conserve ses repères. Une modification du profil met à jour ceux du jour courant.

Dans l’onglet **Photo**, le navigateur analyse l’image et propose plusieurs aliments ainsi que des portions approximatives. Vérifie la liste, ajoute les ingrédients cachés ou non reconnus et corrige les quantités avant d’enregistrer. Les valeurs sont calculées à partir des aliments et portions sélectionnés.

Le profil, le journal et les pesées sont enregistrés dans le navigateur. L’export JSON permet de transférer ou restaurer ces données. Sur l’iPhone, **Profil → Enregistrer dans Fichiers** ouvre le partage de fichier. Choisis iCloud Drive pour conserver une copie accessible sur tes autres appareils. Seul le terme saisi dans la recherche de produit est envoyé à Open Food Facts. La photo est traitée sur l’appareil.

### Sauvegarde automatique

Dans **Profil → Configurer la sauvegarde**, utilise un [jeton GitHub à accès limité](https://docs.github.com/fr/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) avec la permission **Contents · Read and write** pour le seul dépôt privé `FastedCorsi/assiette-sauvegarde`. Choisis un mot de passe de sauvegarde et conserve-le dans un gestionnaire de mots de passe.

Une fois activée, la copie est chiffrée sur l’appareil avec AES-GCM et envoyée à GitHub quand l’app est ouverte et connectée. Le journal local reste disponible pendant une interruption. Vérifie la mention **Sauvegardé sur GitHub** avant de changer d’iPhone. Si deux appareils modifient le journal, Assiette suspend les envois et te demande de choisir la copie à garder.

Sur un nouvel iPhone, ouvre Assiette, reconnecte GitHub avec le même mot de passe de sauvegarde, puis utilise **Restaurer la copie GitHub**. Un jeton expiré peut être remplacé en déconnectant et en réactivant la sauvegarde. Le mot de passe reste nécessaire à la récupération. Évite de connecter la sauvegarde sur un appareil partagé.

## Développement

Lance le serveur et les tests depuis le dossier du projet.

```sh
python -m http.server 4173 --bind 127.0.0.1
node --test journal.test.mjs nutrition.test.mjs backup-crypto.test.mjs
```

Le journal s’ouvre sur `http://127.0.0.1:4173/`. Le site est statique et ne comporte aucune étape de compilation.

## Sources et repères

- Aliments génériques et portions types. Les valeurs nutritionnelles proviennent de la [table Ciqual 2025 de l’Anses](https://doi.org/10.57745/RDMHWY), disponible sous Licence Ouverte Etalab 2.0. Les portions proposées sont indicatives et modifiables.
- Produits de marque. Les fiches sont interrogées dans [Open Food Facts](https://world.openfoodfacts.org/), base collaborative sous [licence ODbL](https://world.openfoodfacts.org/terms-of-use).
- Énergie et macronutriments. Le calcul pour adulte s’appuie sur l’[équation de Mifflin–St Jeor](https://pubmed.ncbi.nlm.nih.gov/2305711/) et les [références nutritionnelles de l’Anses](https://anses.fr/fr/system/files/NUT2012SA0103Ra-1.pdf). Les coefficients d’activité et les écarts d’énergie liés à l’objectif sont des estimations qui tiennent compte des séances déclarées. Le repère de boissons est ajustable. [EFSA](https://www.efsa.europa.eu/en/safe2eat/your-nutrition-needs)
- Photo. Le [modèle DeepLabV3+ avec MobileNetV2 de mawiie](https://huggingface.co/mawiie/food-segmentation-mobilenet/tree/93d8c84b121ecce76ed752be538e01d72df15825), entraîné sur [FoodSeg103](https://github.com/LARC-CMU-SMU/FoodSeg103-Benchmark-v1), est exécuté par [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html). Le premier essai télécharge environ 30 Mo. La surface visible et une portion type servent à estimer les quantités. La photo peut manquer ou confondre des aliments. Voir [les crédits du modèle](PHOTO-MODEL.md).
