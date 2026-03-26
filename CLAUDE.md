# Proyecto: Booking App — Daniel MacLean

## Qué es
App de agendamiento de sesiones de psicoterapia. Reemplaza Zite.com ($19/mes).
Deploy en **Hostinger** (Business Web Hosting) + motor de recordatorios en **Render**.

## Stack
- **Server:** Express + MySQL (Hostinger) — `server/`
- **Client:** React + Vite + Tailwind — `client/`
- **Render (legacy):** Motor de recordatorios WhatsApp — `src/`

## Arquitectura de deploy
- **Hostinger** sirve la booking app (server/ + client/dist/)
- **Render** corre el motor de recordatorios (src/index.js) con SQLite
- Ambos comparten el mismo repo pero son apps independientes

## Documentos de referencia OBLIGATORIOS
Antes de hacer cambios de deploy o webhooks, LEE estos archivos:
- `HOSTINGER-DEPLOY-LESSONS.md` — errores conocidos de deploy en Hostinger
- `WHATSAPP-WEBHOOK-SETUP.md` — guía completa de webhooks de Meta/WhatsApp

## Reglas críticas (NO ignorar)

### Hostinger
- `dns.setDefaultResultOrder('ipv4first')` DEBE estar en la primera línea de `server/db.js`
- `client/dist/` está commiteado al repo — Hostinger no ejecuta builds
- Después de cambios en client/, correr `npm run build` y commitear `client/dist/`
- `express.static()` con `fs.existsSync()` guard obligatorio

### WhatsApp webhooks
- Después de configurar Callback URL en Meta, SIEMPRE ejecutar:
  ```bash
  curl -X POST "https://graph.facebook.com/v18.0/{WABA_ID}/subscribed_apps" \
    -H "Authorization: Bearer {WA_TOKEN}"
  ```
  Sin esto, los mensajes reales NO llegan (solo los tests de Meta).
- El WABA ID es: `1400277624968330`
- El Phone Number ID es: `887756534426165`

### Textos en español
- NUNCA usar unicode escapes (\u00f3, \u00e9, etc.) en archivos JSX
- Siempre escribir los caracteres directamente: ó, é, í, á, ú, ñ, ¿, ¡

## Variables de entorno
- Hostinger: configuradas en hPanel (NO en .env del repo)
- Render: configuradas en el dashboard de Render
- Ver `.env.example` para la lista completa

## URLs
- Booking app: https://skyblue-rabbit-531241.hostingersite.com/agendar
- API health: https://skyblue-rabbit-531241.hostingersite.com/api/health
- Render reminders: https://whatsapp-reminder-engine.onrender.com/health

## Dueño
Daniel MacLean — psicólogo en Cochabamba, Bolivia
Teléfono personal: 59172034151
WhatsApp Business: 59169650802
