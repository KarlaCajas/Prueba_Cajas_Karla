# Prueba T Cajas

Proyecto con frontend (React + Vite) y backend (Node.js + Express + MySQL).

## Credenciales de Base de Datos (MySQL)

Estas son las credenciales por defecto que usa el backend si no defines variables de entorno:

- Host: `localhost`
- Usuario: `root`
- Contrasena: `root`
- Base de datos: `ventas_seguras`

## Credenciales de Usuario para Login

El backend crea automaticamente un usuario semilla al iniciar:

- Email: `demo@demo.com`
- Contrasena: `Demo123!`

## Credenciales y Variables del Backend

Variables que lee `backend/server.js`:

- `PORT` (default: `3001`)
- `JWT_SECRET` (default: `dev_secret_change_me`)
- `SEED_USER_EMAIL` (default: `demo@demo.com`)
- `SEED_USER_PASSWORD` (default: `Demo123!`)
- `DB_HOST` (default: `localhost`)
- `DB_USER` (default: `root`)
- `DB_PASSWORD` (default: `root`)
- `DB_NAME` (default: `ventas_seguras`)

Ejemplo de `.env` para `backend/`:

```env
PORT=3001
JWT_SECRET=dev_secret_change_me
SEED_USER_EMAIL=demo@demo.com
SEED_USER_PASSWORD=Demo123!

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=ventas_seguras
```

## Como ejecutar

1. Backend:

```bash
cd backend
npm install
node server.js
```

2. Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Nota importante

Estas credenciales son para desarrollo local. En produccion cambia contrasenas y secretos antes de desplegar.
