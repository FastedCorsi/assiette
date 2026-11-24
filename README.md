# Assiette

Assiette est un journal nutritionnel personnel en français. L’application fonctionne dans le navigateur et s’héberge gratuitement depuis la racine d’un dépôt public avec [GitHub Pages](https://docs.github.com/fr/pages/getting-started-with-github-pages/what-is-github-pages).

## Utilisation

1. Dans **Profil**, renseigne ton âge, ta taille, ton poids, ton objectif et ton activité quotidienne hors sport. Si tu t’entraînes, ajoute le nombre de séances par semaine, l’activité principale et la durée d’une séance. Le profil se conserve entre les visites.
2. Dans **Journal**, écris par exemple « 150 g de poulet, riz cuit, 1/2 avocat ». Vérifie les portions proposées et ajuste les valeurs pour 100 g ou 100 ml selon l’étiquette ou la recette. La recherche Open Food Facts accepte un nom de produit ou un code-barres. Les données absentes donnent lieu à un total partiel.
3. Enregistre les boissons dans le même journal. Le repère Anses s’applique à l’eau nature saisie. Le volume de toutes les boissons reste visible. Si tu définis un repère manuel de boissons, il porte sur ce volume total.
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
- Énergie. Le métabolisme de base est estimé à partir du poids, de la taille, de l’âge et du sexe selon [Henry 2005, tableau 15](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/61A9EA486ABFA478FEF2FCE1E70D5BEE/S1368980005001394a.pdf). Les quatre choix d’activité hors sport correspondent aux niveaux de 1,4, 1,6, 1,8 et 2,0 repris par l’[EFSA](https://doi.org/10.2903/j.efsa.2013.3005).
- Sport. Les valeurs par activité proviennent des Compendia 2024 pour [19 à 59 ans](https://pacompendium.com/adult-compendium/) et [60 ans et plus](https://pacompendium.com/older-adult-compendium/). L’application ajoute la dépense des séances au-dessus de 1 MET de repos, en moyenne sur sept jours. Elle utilise 3,5 ou 2,7 mL d’oxygène par kg et par minute pour 1 MET selon la tranche d’âge et environ 5 kcal par litre d’oxygène. Le type et la durée sont nécessaires pour obtenir cet ajustement. [Conversion du Compendium](https://pacompendium.com/corrected-mets/)
- Objectif de poids. Dans le cadre de la perte de poids étudiée chez l’adulte en surpoids, l’application utilise 500 kcal de moins que le maintien estimé. Elle conserve le maintien si le poids visé est bas, si le poids visé est atteint ou si l’ajustement donnerait moins de 1 200 kcal ou 1 500 kcal suivant le sexe utilisé pour le calcul. Pour la prise de poids, elle utilise la borne basse de 300 kcal supplémentaires par jour. Le poids visé aide à arrêter l’ajustement. [NHLBI](https://www.nhlbi.nih.gov/sites/default/files/media/docs/obesity-evidence-review.pdf) · [OMS, seuil d’IMC du surpoids](https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight) · [NHS](https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/healthy-ways-to-gain-weight/)
- Macronutriments. Les repères sont des fourchettes en grammes dérivées des pourcentages d’énergie de l’Anses. Le calcul tient compte des références par âge, du cas des travaux très physiques et de la référence en protéines par kg quand elle est compatible avec la fourchette d’énergie. La conversion utilise 4 kcal/g pour les protéines et glucides et 9 kcal/g pour les lipides. Les repères concernent les adultes de la population générale. [Anses, tableau 8 p. 66](https://www.anses.fr/system/files/NUT2012SA0103Ra-2.pdf) · [Anses, protéines](https://www.anses.fr/fr/article/proteines-role-sources-et-apports-recommandes) · [Règlement UE, annexe XIV](https://eur-lex.europa.eu/eli/reg/2011/1169/oj/fra)
- Eau. Le repère général de 1,5 à 2 L d’eau par jour provient de l’Anses. Il est comparé à l’eau nature enregistrée dans le journal. [Anses, quantité d’eau à boire](https://www.anses.fr/fr/article/eau-bouteille-eau-du-robinet-bonnes-pratiques-consommation)
- Photo. Le [modèle DeepLabV3+ avec MobileNetV2 de mawiie](https://huggingface.co/mawiie/food-segmentation-mobilenet/tree/93d8c84b121ecce76ed752be538e01d72df15825), entraîné sur [FoodSeg103](https://github.com/LARC-CMU-SMU/FoodSeg103-Benchmark-v1), est exécuté par [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html). Le premier essai télécharge environ 30 Mo. La surface visible et une portion type servent à estimer les quantités. La photo peut manquer ou confondre des aliments. Voir [les crédits du modèle](PHOTO-MODEL.md).
