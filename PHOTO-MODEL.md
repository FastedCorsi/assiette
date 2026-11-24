# Modèle photo FoodSeg103

`foodseg-mobilenet.onnx` est une conversion du modèle DeepLabV3+ avec MobileNetV2 de [mawiie](https://huggingface.co/mawiie/food-segmentation-mobilenet/tree/93d8c84b121ecce76ed752be538e01d72df15825), publié sous licence MIT et entraîné sur [FoodSeg103](https://github.com/LARC-CMU-SMU/FoodSeg103-Benchmark-v1).

- SHA-256 du checkpoint source `best_model.pth` — `6ecc4da2210d8a2128f6a79670d40f25c8f5ffbf11b3358689669c431896600f`
- SHA-256 de la conversion ONNX — `8fc90380740d3fef8a483e9bbcce27ffb31c9af9924f4fa1b91019b4a4eb0857`
- Conversion ONNX opset 17. L’entrée RGB normalisée a une résolution de 512 × 512. L’export utilise la résolution du décodeur de 128 × 128 pour produire le masque des classes et leurs probabilités maximales.

## MIT License

Copyright (c) mawiie, author of food-segmentation-mobilenet

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
