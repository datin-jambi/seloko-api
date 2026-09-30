#!/usr/bin/env bash
# Uji cepat data seeder terhadap API yang sedang berjalan.
# Pakai: bash prisma/seed-data/smoke.sh [base_url]
BASE="${1:-http://localhost:3000/api}"
PW='Seloko@2025!'
pass=0; fail=0

jqf() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);console.log(eval("o"+process.argv[1]))}catch{console.log("")}})' "$1"; }

login() { # user app password
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -H "X-App-Code: $2" -d "{\"identity\":\"$1\",\"password\":\"${3:-$PW}\"}"
}

code() { # http_code saja
  curl -s -o /dev/null -w '%{http_code}' "$@"
}

check() { # label harapan aktual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok   %-52s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  GAGAL %-52s harap %s, dapat %s\n' "$1" "$2" "$3"; fi
}

echo "== Login: siapa boleh masuk aplikasi mana =="
login_code() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' -H "X-App-Code: $2" \
  -d "{\"identity\":\"$1\",\"password\":\"${3:-$PW}\"}"; }

check "superadmin @seloko"              200 "$(login_code superadmin seloko 'SelokoBapenda@2025!')"
check "admin.seloko @seloko"            200 "$(login_code admin.seloko seloko)"
check "editor.profil @bapenda-profile"  200 "$(login_code editor.profil bapenda-profile)"
check "editor.profil @seloko (app lain)" 403 "$(login_code editor.profil seloko)"
check "nonaktif (isActive=false)"       401 "$(login_code nonaktif seloko)"
check "terhapus (soft deleted)"         401 "$(login_code terhapus seloko)"
check "tanpa.role"                      403 "$(login_code tanpa.role seloko)"
check "role.kedaluwarsa (expiresAt lewat)" 403 "$(login_code role.kedaluwarsa seloko)"
check "role.sementara (masih berlaku)"  200 "$(login_code role.sementara seloko)"
check "role.mati (role isActive=false)" 403 "$(login_code role.mati seloko)"
check "app nonaktif (seloko-nonaktif)"  403 "$(login_code admin.seloko seloko-nonaktif)"
# Password cukup panjang tapi salah → 401. Password terlalu pendek kena validasi
# Zod lebih dulu (400), karena validasi berjalan sebelum preHandler.
check "password salah"                  401 "$(login_code admin.seloko seloko 'SalahSekali@2025!')"

echo "== Permission: guard menolak yang tidak berhak =="
T_ADMIN=$(login admin.seloko seloko | jqf '.data.accessToken')
T_OP=$(login operator.user seloko | jqf '.data.accessToken')
T_VIEW=$(login viewer.only seloko | jqf '.data.accessToken')
H_APP='X-App-Code: seloko'

check "admin  GET /users"    200 "$(code "$BASE/users?limit=5" -H "Authorization: Bearer $T_ADMIN" -H "$H_APP")"
check "operator GET /users"  200 "$(code "$BASE/users?limit=5" -H "Authorization: Bearer $T_OP" -H "$H_APP")"
check "operator DELETE (tanpa user:delete)" 403 \
  "$(code -X DELETE "$BASE/users/00000000-0000-0000-0000-000000000000" -H "Authorization: Bearer $T_OP" -H "$H_APP")"
check "viewer GET /users"    200 "$(code "$BASE/users?limit=5" -H "Authorization: Bearer $T_VIEW" -H "$H_APP")"
# Body {} gagal validasi Zod (400) sebelum guard permission jalan — kirim body
# valid agar yang teruji benar-benar 403 dari requirePermission.
NEW_USER='{"username":"uji.tolak","email":"uji.tolak@bapenda-jambi.go.id","fullName":"Uji Tolak","password":"Seloko@2025!"}'
check "viewer POST (tanpa user:create)" 403 \
  "$(code -X POST "$BASE/users" -H "Authorization: Bearer $T_VIEW" -H "$H_APP" -H 'Content-Type: application/json' -d "$NEW_USER")"
check "tanpa token"          401 "$(code "$BASE/users" -H "$H_APP")"
check "tanpa X-App-Code"     400 "$(code "$BASE/users" -H "Authorization: Bearer $T_ADMIN")"
check "token app lain dipakai di seloko" 403 \
  "$(code "$BASE/users" -H "Authorization: Bearer $(login editor.profil bapenda-profile | jqf '.data.accessToken')" -H "$H_APP")"

echo "== Pagination & filter (butuh data massal) =="
# Catatan: buildPaginatedResult menaruh `meta` di ROOT respons (sejajar `data`),
# bukan di dalam `data` — jalur pembacaan di bawah mengikuti bentuk itu.
META=$(curl -s "$BASE/users?page=2&limit=10" -H "Authorization: Bearer $T_ADMIN" -H "$H_APP")
check "page=2 limit=10 → page"   2 "$(echo "$META" | jqf '.meta.page')"
check "hasPreviousPage"       true "$(echo "$META" | jqf '.meta.hasPreviousPage')"
check "baris terkirim"          10 "$(echo "$META" | jqf '.data.length')"
printf '  info total user aktif: %s\n' "$(echo "$META" | jqf '.meta.total')"
S=$(curl -s "$BASE/users?search=Pratama&limit=3" -H "Authorization: Bearer $T_ADMIN" -H "$H_APP")
printf '  info search Pratama: total %s\n' "$(echo "$S" | jqf '.meta.total')"
F=$(curl -s "$BASE/users?isActive=false&limit=100" -H "Authorization: Bearer $T_ADMIN" -H "$H_APP")
printf '  info isActive=false: total %s\n' "$(echo "$F" | jqf '.meta.total')"

echo "== /auth/me: permission ter-resolve per aplikasi =="
ME_VIEW=$(curl -s "$BASE/auth/me" -H "Authorization: Bearer $T_VIEW" -H "$H_APP")
check "viewer.only role"  viewer "$(echo "$ME_VIEW" | jqf '.data.roles[0]')"
T_MULTI=$(login multirole lapak-jambi-web | jqf '.data.accessToken')
ME_MULTI=$(curl -s "$BASE/auth/me" -H "Authorization: Bearer $T_MULTI" -H 'X-App-Code: lapak-jambi-web')
check "multirole punya 2 role di 1 app" 2 "$(echo "$ME_MULTI" | jqf '.data.roles.length')"
printf '  info permission union multirole: %s\n' "$(echo "$ME_MULTI" | jqf '.data.permissions.length')"
ME_SA=$(curl -s "$BASE/auth/me" -H "Authorization: Bearer $(login superadmin seloko 'SelokoBapenda@2025!' | jqf '.data.accessToken')" -H "$H_APP")
check "superadmin isSuperAdmin" true "$(echo "$ME_SA" | jqf '.data.isSuperAdmin')"

echo
echo "lolos: $pass  gagal: $fail"
[ "$fail" -eq 0 ]
