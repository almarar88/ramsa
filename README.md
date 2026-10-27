# رمسة · Ramsa
منصة صوت عربي: نطق بالإماراتي والسعودي والكويتي والمصري والإنجليزي، تفريغ صوتي يكشف اللهجة، تنقية صوت على الجهاز (RNNoise)، ووكيل صوتي «رفيج».

- الواجهة: موقع ثابت (PWA) على GitHub Pages.
- الذكاء: Supabase Edge Function (`supabase/functions/ramsa`) تستدعي Google Gemini؛ المفتاح سرّ على الخادم فقط.
- `vendor/rnnoise.js`: @shiguredo/rnnoise-wasm (Apache-2.0، انظر vendor/LICENSE).
