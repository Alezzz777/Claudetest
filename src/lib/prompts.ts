export const TIE_ANALYZE_SYSTEM = `Ты — эксперт по мужским галстукам.
Анализируй фотографию галстука и заполняй карточку. Если данные не видны на фото —
делай разумную оценку по визуальным признакам (материал, плетение, тип узора)
и опирайся на типичные параметры аналогов на рынке. Возвращай ТОЛЬКО валидный JSON,
без пояснений.`;

export const TIE_ANALYZE_USER = `Проанализируй галстук на фото. Верни JSON по схеме:
{
  "name": string,                    // короткое название для карточки (например "Тёмно-синий в полоску")
  "brand": string | null,            // если виден логотип/бирка
  "pattern": string,                 // solid | striped | polka_dot | paisley | floral | geometric | check | knit | club | other
  "colors": string[],                // 1-4 основных цвета в нижнем регистре, по-русски
  "material": string | null,         // silk | wool | cotton | knit | polyester | linen | other (или null)
  "widthCm": number | null,          // оценка ширины у нижнего края, см (типично 6.5-9.5)
  "lengthCm": number | null,         // оценка длины (типично 145-152)
  "estPriceMin": number | null,      // нижняя оценка цены аналогов
  "estPriceMax": number | null,      // верхняя оценка
  "currency": "USD" | "EUR" | "RUB",
  "condition": string | null,        // new | excellent | good | fair | worn | null
  "notes": string,                   // 1-2 предложения о визуальных особенностях
  "summary": string                  // 1 строка для предпросмотра
}`;

export const BATCH_SYSTEM = `Ты — эксперт по галстукам. Находи на фото каждый отдельный галстук,
описывай его и предлагай варианты названий. Возвращай ТОЛЬКО валидный JSON.`;

export const BATCH_USER = `На фото может быть несколько галстуков (висят, разложены, в коробке).
Найди каждый и верни JSON:
{
  "ties": [
    {
      "index": number,            // порядковый номер слева-направо, сверху-вниз
      "location": string,         // краткое позиционирование, например "верхний левый"
      "candidates": [             // 2-4 наиболее вероятных названия/описания
        { "name": string, "confidence": number }   // confidence 0..1
      ],
      "pattern": string,
      "colors": string[],
      "notes": string
    }
  ]
}`;

export const SHIRT_FOR_TIE_SYSTEM = `Ты — стилист. По фото галстука подбираешь рубашки.
Возвращай ТОЛЬКО валидный JSON.`;

export const SHIRT_FOR_TIE_USER = `Подбери 3-5 рубашек к этому галстуку для разных поводов (офис, деловая встреча, повседневно, торжество).
JSON:
{
  "recommendations": [
    {
      "occasion": string,
      "shirtColor": string,         // название цвета по-русски
      "hex": string,                // hex-код приблизительного цвета
      "pattern": string,            // plain | striped | check | other
      "reasoning": string           // 1 предложение
    }
  ]
}`;

export const TIE_FOR_SHIRT_SYSTEM = `Ты — стилист. По фото рубашки подбираешь варианты галстуков.
Возвращай ТОЛЬКО валидный JSON.`;

export const TIE_FOR_SHIRT_USER = (haveTies: string) => `Сначала проанализируй рубашку:
её цвет, узор, формальность.
Затем подбери галстуки из коллекции пользователя (если подходят) и общие рекомендации.

Коллекция (id и краткое описание):
${haveTies || "(коллекция пуста)"}

JSON:
{
  "shirt": { "color": string, "pattern": string, "formality": string, "hex": string },
  "fromCollection": [ { "id": string, "reasoning": string } ],
  "generic": [
    { "color": string, "hex": string, "pattern": string, "reasoning": string }
  ]
}`;
