# 0033 — HTTPS en el servidor de desarrollo (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (pendientes) |
| Specs | RF-15, RNF-05 |
| Proyecto | frontend |

## Descripción

Los navegadores solo dan acceso a la cámara en orígenes seguros (HTTPS o `localhost`). Para probar el escáner desde un celular en la misma red se agrega `pnpm dev:lan`: Vite con certificado autofirmado (`@vitejs/plugin-basic-ssl`, aprobado por el usuario) y escuchando en la red local. `pnpm dev` no cambia (http://localhost:5173), así Playwright sigue igual.

## Checklist
- [x] Dependencia de desarrollo `@vitejs/plugin-basic-ssl`
- [x] `vite.config.ts`: el plugin solo se activa en modo `lan`
- [x] Script `dev:lan` (`vite --mode lan --host`)
- [x] `frontend/CLAUDE.md` documenta el comando

## Cómo probar desde el celular
1. En `backend/.env`, cambia temporalmente `FRONTEND_ORIGIN` y `BETTER_AUTH_URL` a `https://<IP-de-la-PC>:5173` (la IP la imprime `pnpm dev:lan` en "Network"). El backend solo acepta peticiones de ese origen, y los QR se generan con esa URL.
2. Reinicia el backend (`pnpm dev`) y levanta el frontend con `pnpm dev:lan`.
3. Con el celular en la misma red Wi-Fi, abre `https://<IP-de-la-PC>:5173`. El navegador avisa que el certificado no es de confianza: acepta continuar (Chrome: "Avanzado" → "Continuar"; Safari: "Mostrar detalles" → "visitar este sitio web").
4. Si no carga, permite Node.js en el Firewall de Windows para redes privadas.
5. Al terminar, regresa `backend/.env` a `http://localhost:5173`. Los QR generados mientras tanto apuntan a la IP: vuelve a generarlos si los vas a usar en otro lado.

## Notas
- En `localhost` desde la PC (`https://localhost:5173`) también funciona con `dev:lan`, pero el backend solo aceptará el origen configurado en el paso 1.
