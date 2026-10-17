# Core — aplikasi `seloko`

Konsol pusat SELOKO: identitas, RBAC, aplikasi, navigasi, master organisasi, dan storage.
Seluruh endpoint di sini memakai `X-App-Code: seloko`, kecuali modul yang menyediakan endpoint
publik lintas aplikasi (Applications public-config, Organizations public).

| Modul | Berkas | Endpoint | Prefix | Sumber kode |
|---|---|:---:|---|---|
| Auth | [auth.md](./auth.md) | 5 | `/api/auth` | `src/modules/core/auth/` |
| Users | [users.md](./users.md) | 9 | `/api/users` | `src/modules/core/users/` |
| Applications | [applications.md](./applications.md) | 8 | `/api/applications` | `src/modules/core/applications/` |
| Permissions | [permissions.md](./permissions.md) | 7 | `/api/permissions` | `src/modules/core/permissions/` |
| Roles | [roles.md](./roles.md) | 8 | `/api/roles` | `src/modules/core/roles/` |
| Menus | [menus.md](./menus.md) | 8 | `/api/menus` | `src/modules/core/menus/` |
| Organizations | [organizations.md](./organizations.md) | 8 | `/api/organizations` | `src/modules/core/organizations/` |
| Storage | [storage.md](./storage.md) | 3 | `/api/storage` | `src/modules/core/storage/` |

**Total: 56 endpoint.**

## Peta izin aplikasi `seloko`

```
Pengguna      user:create|read|update|delete|list
Akses         role:*              permission:read|list
              user-app-role:create|list|delete
Sistem        application:*        organization:*
              audit-log:read|list|export
```

## Catatan

- Modul Core memakai bentuk respons `{ success, message, data, meta? }`.
- `DELETE` pada Core umumnya soft-delete; pengecualian yang benar-benar menghapus permanen
  dicatat di berkas modulnya.
- Modul Storage memakai bentuk `{ statusCode, code, message, data }` karena warisan standar
  media. Konsumen disarankan membaca `data` tanpa memeriksa `success`.
