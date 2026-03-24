# whatsapp-reminder-engine

Motor de recordatorios automáticos vía WhatsApp, basado en eventos de Google Calendar.

## Arquitectura

```
Google Calendar  ──▶  /send-reminders  ──▶  Meta Cloud API (WhatsApp)
                           │
                        SQLite (dedup)
```

- **GET /health** — health check
- **POST /send-reminders** — lee eventos próximos de Google Calendar y envía recordatorios por WhatsApp (evita duplicados con SQLite)
- **GET/POST /webhook** — webhook de Meta para verificación y recepción de mensajes entrantes

## Setup

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd whatsapp-reminder-engine
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

#### Google Calendar (Service Account)

1. Crear un Service Account en Google Cloud Console
2. Habilitar la API de Google Calendar
3. Descargar la clave JSON y copiar `client_email` y `private_key` al `.env`
4. Compartir el calendario con el email del Service Account (permisos de lectura)

#### Meta Cloud API (WhatsApp Business)

1. Crear una app en [Meta for Developers](https://developers.facebook.com/)
2. Configurar WhatsApp Business API
3. Obtener el Phone Number ID y Access Token
4. Configurar el webhook apuntando a `https://tu-dominio.com/webhook`
5. Usar el mismo `WHATSAPP_VERIFY_TOKEN` en Meta y en tu `.env`

### 3. Formato de eventos en Google Calendar

En la **descripción** del evento, incluir los números de teléfono destino (con código de país):

```
Reunión con cliente
+5491155551234
+5491166662345
```

### 4. Ejecutar

```bash
# Producción
npm start

# Desarrollo (auto-reload)
npm run dev
```

### 5. Disparar recordatorios

Llamar periódicamente al endpoint (por ejemplo cada 10 minutos con un cron o Make.com):

```bash
curl -X POST http://localhost:3000/send-reminders
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `PORT` | Puerto del servidor (default: 3000) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email del Service Account |
| `GOOGLE_PRIVATE_KEY` | Clave privada del Service Account |
| `GOOGLE_CALENDAR_ID` | ID del calendario a monitorear |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID de Meta |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso de Meta |
| `WHATSAPP_VERIFY_TOKEN` | Token personalizado para verificación del webhook |
| `REMINDER_MINUTES_BEFORE` | Ventana de tiempo en minutos (default: 30) |
