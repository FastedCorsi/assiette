# Assiette

Assiette est un journal nutritionnel personnel en français. L’application fonctionne dans le navigateur et s’héberge gratuitement depuis la racine d’un dépôt public avec [GitHub Pages](https://docs.github.com/fr/pages/getting-started-with-github-pages/what-is-github-pages).

## Utilisation

1. Dans **Profil**, renseigne ton âge, ta taille, ton poids, ton objectif, ton activité quotidienne et le nombre de séances de sport par semaine. Les repères d’énergie et de macronutriments évoluent avec ton profil.
2. Dans **Journal**, écris par exemple « 150 g de poulet, riz cuit, 1/2 avocat ». Vérifie les portions proposées et ajuste les valeurs pour 100 g ou 100 ml selon l’étiquette ou la recette. La recherche Open Food Facts accepte un nom de produit ou un code-barres. Les données absentes donnent lieu à un total partiel.
3. Enregistre les boissons dans le même journal. Le volume affiché correspond aux boissons saisies en ml. Le bilan compare les entrées du jour aux repères disponibles.
4. Consulte les jours précédents et enregistre tes pesées dans **Historique**. Chaque journée enregistrée conserve ses repères. Une modification du profil met à jour ceux du jour courant.

L’onglet **Photo** télécharge environ 25 Mo de fichiers lors du premier essai. Le navigateur analyse l’image et propose des plats parmi 101 catégories. Confirme la suggestion et la portion. Pour une assiette composée, précise ses ingrédients dans la saisie de repas.

Le profil, le journal et les pesées sont enregistrés dans le stockage local du navigateur. L’export JSON permet de transférer ou restaurer ces données. Seul le terme saisi dans la recherche de produit est envoyé à Open Food Facts. La photo est traitée sur l’appareil et la recherche de produit ainsi que le chargement du modèle sont déclenchés à la demande.

## Développement

Lance le serveur et les tests depuis le dossier du projet.

```sh
python -m http.server 4173 --bind 127.0.0.1
node --test journal.test.mjs nutrition.test.mjs
```

Le journal s’ouvre sur `http://127.0.0.1:4173/`. Le site est statique et ne comporte aucune étape de compilation.

## Sources et repères

- Aliments génériques et portions types. Les valeurs nutritionnelles proviennent de la [table Ciqual 2025 de l’Anses](https://doi.org/10.57745/RDMHWY), disponible sous Licence Ouverte Etalab 2.0. Les portions proposées sont indicatives et modifiables.
- Produits de marque. Les fiches sont interrogées dans [Open Food Facts](https://world.openfoodfacts.org/), base collaborative sous [licence ODbL](https://world.openfoodfacts.org/terms-of-use).
- Énergie et macronutriments. Le calcul pour adulte s’appuie sur l’[équation de Mifflin–St Jeor](https://pubmed.ncbi.nlm.nih.gov/2305711/) et les [références nutritionnelles de l’Anses](https://anses.fr/fr/system/files/NUT2012SA0103Ra-1.pdf). Les coefficients d’activité et les écarts d’énergie liés à l’objectif sont des estimations qui tiennent compte des séances déclarées. Le repère de boissons est ajustable. [EFSA](https://www.efsa.europa.eu/en/safe2eat/your-nutrition-needs)
- Photo. Le [modèle MobileNetV3 sur Food-101](https://github.com/yueyang-yin/food-101/tree/a5e27a18aee91413ae88c3bea4c0f1f65df0aec4) est exécuté via [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html). Les suggestions restent des estimations à confirmer.
