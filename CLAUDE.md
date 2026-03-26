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
- Esto es CRÍTICO — los escapes se renderizan como texto literal en el browser

### Estilo de código y diseño
- Fonts: ya están subidos +2pt respecto al diseño original. No bajarlos.
- Mobile: padding 12px en móvil, 24px en >=520px. No agregar más margen.
- Días con slots en calendario: bold negro. Días sin slots: gris claro. SIN punto verde ni indicador extra.
- Daniel NO quiere emojis en la UI (excepto banderas en selector de país)

## Flujo de la booking app (FLUJO INVERTIDO)
```
Screen 1: Calendario + Slots (NO pide teléfono primero — por privacidad)
   ↓ click en slot
Screen 2: Input teléfono (con contador de dígitos: "5/8 dígitos")
   ↓ submit
Screen 3: Confirmación → POST /api/book { phone, date_time }
   ├── "booked" → Screen 5 (éxito, personalizado con nombre)
   ├── "needs_onboarding" → campos aparecen con slide-in → resubmit
   └── "has_appointment" → Screen 6 (muestra cita existente + la nueva que eligió)
Screen 5: Éxito (sin botón "volver al inicio" — evita trolleo)
Screen 6: Ya tiene cita → "Reagendar" o "Conservar"
   ↓ Reagendar
Screen 1 (modo reschedule) → pick slot → Screen 7 (confirmar reagendamiento)
```

## API endpoints principales
- `POST /api/book` — { phone, date_time, onboarding? } (público) O { client_id, date_time } (admin)
  - Respuestas: `{ status: "booked" }`, `{ status: "needs_onboarding" }`, `{ status: "has_appointment", appointment, client_id, client_name }`
- `POST /api/reschedule` — { client_id, old_appointment_id, date_time }
- `GET /api/slots?date=YYYY-MM-DD` — devuelve { slots: [{ time, block }] }
- `GET /api/config/public` — config pública (available_days, window_days, min_age, max_age, etc.)

## Rate limiting
- `/api/book` y `/api/reschedule`: 3 intentos / 15 min
- `/api/client`: 5 intentos / 15 min
- Bypass: agregar `?devmode=1` a la URL (muestra banner amarillo "MODO DESARROLLO")

## GCal naming
Los eventos se crean como: `Terapia [Nombre] [Apellido] - [teléfono sin +]`
Ejemplo: `Terapia Daniel MacLean - 59172034151`

## Timezone
- Server SIEMPRE trabaja en America/La_Paz (-04:00)
- Client convierte visualmente con Intl.DateTimeFormat
- `client/src/utils/timezones.js` tiene toda la lógica
- Pre-fetch: 7 días en paralelo al cargar, cacheados en Map

## Archivos clave
- `client/src/pages/BookingFlow.jsx` — todo el flujo de booking (screens 1-7)
- `client/src/components/Calendar.jsx` — calendario con daysWithSlots
- `client/src/utils/timezones.js` — zonas horarias y conversión
- `client/src/index.css` — todos los estilos (CSS custom, no Tailwind classes)
- `server/routes/booking.js` — createBooking, createClient, endpoints /book y /reschedule
- `server/routes/slots.js` — genera slots libres leyendo GCal
- `server/index.js` — rate limiting, rutas, webhook

## Variables de entorno
- Hostinger: configuradas en hPanel (NO en .env del repo)
- Render: configuradas en el dashboard de Render
- Ver `.env.example` para la lista completa

## URLs
- Booking app: https://skyblue-rabbit-531241.hostingersite.com/agendar
- Dev mode: https://skyblue-rabbit-531241.hostingersite.com/agendar?devmode=1
- API health: https://skyblue-rabbit-531241.hostingersite.com/api/health
- Render reminders: https://whatsapp-reminder-engine.onrender.com/health

## Dueño
Daniel MacLean — psicólogo en Cochabamba, Bolivia
Teléfono personal: 59172034151
WhatsApp Business: 59169650802
