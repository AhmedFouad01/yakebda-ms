<div dir="rtl" align="right">

# تشغيل YAKEBDA MS محليًا على Windows

## المتطلبات

- Node.js 20+
- Docker Desktop
- PowerShell

## تشغيل PostgreSQL

```powershell
docker run -d --name ykms-postgres -e POSTGRES_USER=ykms -e POSTGRES_PASSWORD=ykms -e POSTGRES_DB=ykms -p 5432:5432 postgres:16
docker exec -it ykms-postgres psql -U ykms -d postgres -c "CREATE DATABASE ykms_test OWNER ykms;"
```

لو container موجود:

```powershell
docker start ykms-postgres
```

## تشغيل المشروع

```powershell
npm ci
copy apps\api\.env.example apps\api\.env
npm run api:migrate
npm run api:seed
npm run api:test
npm run admin:build
```

Terminal 1:

```powershell
npm run api:dev
```

Terminal 2:

```powershell
npm run admin:dev
```

افتح:

```text
http://localhost:5173
```

## بيانات الدخول

```text
owner@ykms.local / Owner@12345
manager@ykms.local / Manager@12345
kitchen@ykms.local / Kitchen@12345
Cashier PIN: 1234
```

</div>
