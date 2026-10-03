#!/usr/bin/env bash
# Uji endpoint manajemen aplikasi terhadap API yang sedang berjalan.
# Pakai: bash prisma/seed-data/applications.smoke.sh [base_url]
BASE="${1:-http://localhost:3000/api}"
APP='X-App-Code: seloko'
pass=0; fail=0

j() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval("o"+process.argv[1]);console.log(v===undefined?"":v)}catch{console.log("")}})' "$1"; }

check() { # label harapan aktual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-50s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  GAGAL %-50s harap %s, dapat %s\n' "$1" "$2" "$3"; fi
}

login() { # identity password
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -H "$APP" \
    -d "{\"identity\":\"$1\",\"password\":\"$2\"}" | j '.data.accessToken'
}

echo "== Persiapan: login =="
SU=$(login superadmin 'SelokoBapenda@2025!')
VIEWER=$(login viewer.only 'Seloko@2025!')
check "token superadmin didapat" true "$([ -n "$SU" ] && echo true || echo false)"
check "token viewer.only didapat" true "$([ -n "$VIEWER" ] && echo true || echo false)"

AUTH="Authorization: Bearer $SU"
VAUTH="Authorization: Bearer $VIEWER"

echo
echo "== Guard =="
check "tanpa token → 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/applications" -H "$APP")"
check "tanpa X-App-Code → 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/applications" -H "$AUTH")"
check "viewer tanpa application:create → 403" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/applications" \
     -H "$VAUTH" -H "$APP" -H 'Content-Type: application/json' \
     -d '{"code":"uji-403","name":"Uji","audience":"INTERNAL"}')"

echo
echo "== List & detail =="
LIST=$(curl -s "$BASE/applications" -H "$AUTH" -H "$APP")
check "list → 5 aplikasi" 5 "$(echo "$LIST" | j '.meta.total')"
check "list membawa counts.permissions" true \
  "$(echo "$LIST" | j '.data[0].counts.permissions > 0')"
check "filter isActive=false → 1" 1 \
  "$(curl -s "$BASE/applications?isActive=false" -H "$AUTH" -H "$APP" | j '.meta.total')"
check "search 'lapak' → 2" 2 \
  "$(curl -s "$BASE/applications?search=lapak" -H "$AUTH" -H "$APP" | j '.meta.total')"

SELOKO_ID=$(curl -s "$BASE/applications?search=seloko&limit=100" -H "$AUTH" -H "$APP" \
  | j '.data.find(a=>a.code==="seloko").id')
DETAIL=$(curl -s "$BASE/applications/$SELOKO_ID" -H "$AUTH" -H "$APP")
check "detail seloko → 23 permission" 23 "$(echo "$DETAIL" | j '.data.counts.permissions')"
check "detail seloko → 13 menu" 13 "$(echo "$DETAIL" | j '.data.counts.menuItems')"
check "detail membawa permissionsByModule" true \
  "$(echo "$DETAIL" | j '.data.permissionsByModule.length > 0')"
check "role superadmin punya permissionCount" true \
  "$(echo "$DETAIL" | j '.data.roles.find(r=>r.name==="superadmin").permissionCount > 0')"
check "id acak → 404" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' \
     "$BASE/applications/00000000-0000-7000-8000-000000000000" -H "$AUTH" -H "$APP")"
check "id bukan uuid → 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/applications/bukan-uuid" -H "$AUTH" -H "$APP")"

echo
echo "== Validasi create =="
post() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/applications" \
  -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' -d "$1"; }
check "kode huruf besar → 400" 400 "$(post '{"code":"Uji-Besar","name":"Uji"}')"
check "kode terlalu pendek → 400" 400 "$(post '{"code":"a","name":"Uji"}')"
check "baseUrl bukan URL → 400" 400 "$(post '{"code":"uji-url","name":"Uji","audience":"INTERNAL","baseUrl":"bukan"}')"
check "kode sudah dipakai → 409" 409 "$(post '{"code":"seloko","name":"Duplikat","audience":"INTERNAL"}')"

echo
echo "== Siklus hidup =="
CREATED=$(curl -s -X POST "$BASE/applications" -H "$AUTH" -H "$APP" \
  -H 'Content-Type: application/json' \
  -d '{"code":"uji-siklus","name":"Uji Siklus","audience":"PUBLIC","baseUrl":"https://uji.test","icon":"flask"}')
NEW_ID=$(echo "$CREATED" | j '.data.id')
check "create → id terbit" true "$([ -n "$NEW_ID" ] && echo true || echo false)"
check "create → baseUrl tersimpan" "https://uji.test" "$(echo "$CREATED" | j '.data.baseUrl')"

check "patch name → 200" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/applications/$NEW_ID" \
     -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' -d '{"name":"Uji Siklus v2"}')"
check "patch body kosong → 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/applications/$NEW_ID" \
     -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' -d '{}')"
# zod membuang field tak dikenal, jadi "code" di body tidak berefek apa pun.
check "patch code diabaikan (kode tetap)" "uji-siklus" \
  "$(curl -s -X PATCH "$BASE/applications/$NEW_ID" -H "$AUTH" -H "$APP" \
     -H 'Content-Type: application/json' \
     -d '{"code":"kode-baru","name":"Uji Siklus v3"}' | j '.data.code')"

check "nonaktifkan → isActive false" false \
  "$(curl -s -X PATCH "$BASE/applications/$NEW_ID/activate" -H "$AUTH" -H "$APP" \
     -H 'Content-Type: application/json' -d '{"isActive":false}' | j '.data.isActive')"
check "hapus → 200" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/applications/$NEW_ID" -H "$AUTH" -H "$APP")"
check "sudah terhapus → 404" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/applications/$NEW_ID" -H "$AUTH" -H "$APP")"

echo
echo "== Pengaman =="
check "nonaktifkan 'seloko' → 403" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/applications/$SELOKO_ID/activate" \
     -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' -d '{"isActive":false}')"
check "hapus 'seloko' → 403" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/applications/$SELOKO_ID" -H "$AUTH" -H "$APP")"

PROFILE_ID=$(curl -s "$BASE/applications?search=bapenda&limit=100" -H "$AUTH" -H "$APP" \
  | j '.data.find(a=>a.code==="bapenda-profile").id')
check "hapus app yang masih punya penugasan → 409" 409 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/applications/$PROFILE_ID" -H "$AUTH" -H "$APP")"

echo
echo "$([ "$fail" = 0 ] && echo '✅' || echo '❌') $pass ok, $fail gagal"
[ "$fail" = 0 ] || exit 1
