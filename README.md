# TOFA Life Hub

Личный Telegram Mini App: холодильник и рецепты, тренировки и вес, 3D печать, магазин TOFA3D Studio.

Всё приложение — один файл `index.html`. Данные хранятся локально на устройстве (localStorage).

## Цена и фото по ссылке (worker.js)

Браузер не может читать страницы магазинов напрямую, поэтому используется маленький прокси на Cloudflare Workers (бесплатно):

1. dash.cloudflare.com → Workers & Pages → Create → Create Worker → Deploy.
2. Edit code → вставить содержимое `worker.js` → Deploy.
3. Адрес воркера (`https://….workers.dev`) вписать в `META_PROXY` в `index.html`.
