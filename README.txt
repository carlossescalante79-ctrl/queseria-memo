QUESERÍA MEMO - VERCEL + NEON

Archivos:
- index.html
- api/data.js
- package.json

La API busca la conexión de Neon en este orden:
1. STORAGE_URL
2. DATABASE_URL
3. POSTGRES_URL

Como la base se conectó mediante la integración de Neon en Vercel,
normalmente no necesitas copiar ninguna contraseña manualmente.

SUBIDA A VERCEL
1. Conserva esta estructura de carpetas.
2. Sube la carpeta completa al proyecto queseria-memo.
3. Vercel instalará @neondatabase/serverless.
4. Haz Deploy.
5. Abre la página y prueba creando un cliente y una venta.

IMPORTANTE
Ya no se usa localStorage como base principal.
Los datos se leen desde Neon al abrir la página.
Conexión Vercel activada
