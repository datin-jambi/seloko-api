#!/usr/bin/env bash
# Uji endpoint manajemen role terhadap API yang sedang berjalan.
# Pakai: bash prisma/seed-data/roles.smoke.sh [base_url]
BASE="${1:-http://localhost:3000/api}"
APP='X-App-Code: seloko'
PW='Seloko@2025!'
pass=0; fail=0

# Ekspresi memakai `o` sebagai akar JSON, mis. 'o.data.length'.
j() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval(process.argv[1]);console.log(v===undefined?"":v)}catch(e){console.log("ERR:"+e.message)}})' "$1"; }

check() { # label harapan aktual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-52s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  GAGAL %-52s harap %s, dapat %s\n' "$1" "$2" "$3"; fi
}

token() { # identity app password
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -H "X-App-Code: $2" -d "{\"identity\":\"$1\",\"password\":\"${3:-$PW}\"}" | j 'o.data.accessToken'
}

SU=$(token superadmin seloko 'SelokoBapenda@2025!')
AUTH="Authorization: Bearer $SU"
JSON='Content-Type: application/json'

get()  { curl -s "$BASE$1" -H "$AUTH" -H "$APP"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@" -H "$AUTH" -H "$APP"; }

echo "== Guard =="
check "tanpa token → 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/roles" -H "$APP")"
VIEWER=$(token viewer.only seloko)
check "viewer tanpa role:create → 403" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/roles" \
     -H "Authorization: Bearer $VIEWER" -H "$APP" -H "$JSON" \
     -d '{"applicationId":"00000000-0000-7000-8000-000000000000","name":"uji"}')"

echo
echo "== List & filter =="
LIST=$(get /roles)
check "list → 28 role (seed, termasuk pedagang)" 28 "$(echo "$LIST" | j 'o.meta.total')"
check "list membawa permissionCount" true "$(echo "$LIST" | j 'o.data.every(r=>"permissionCount" in r)')"
check "list membawa userCount" true "$(echo "$LIST" | j 'o.data.every(r=>"userCount" in r)')"
check "list membawa applicationCode" true "$(echo "$LIST" | j 'o.data.every(r=>!!r.applicationCode)')"
check "filter isSystemRole=true → semua sistem" true \
  "$(get '/roles?isSystemRole=true&limit=100' | j 'o.data.every(r=>r.isSystemRole)')"
check "filter isActive=false → ada isinya" true \
  "$(get '/roles?isActive=false&limit=100' | j 'o.meta.total > 0')"
check "search 'verifikator' → ada" true \
  "$(get '/roles?search=verifikator&limit=100' | j 'o.meta.total > 0')"

SELOKO_APP=$(get '/applications?search=seloko&limit=100' | j 'o.data.find(a=>a.code==="seloko").id')
LAPAK_APP=$(get '/applications?search=lapak-jambi-web&limit=100' | j 'o.data.find(a=>a.code==="lapak-jambi-web").id')
check "filter applicationId → hanya app itu" true \
  "$(get "/roles?applicationId=$SELOKO_APP&limit=100" | j 'o.data.every(r=>r.applicationCode==="seloko")')"

echo
echo "== Detail: daftar centang permission =="
VIEW_ROLE=$(get "/roles?applicationId=$SELOKO_APP&search=viewer&limit=100" | j 'o.data[0].id')
DETAIL=$(get "/roles/$VIEW_ROLE")
check "detail membawa permissionsByModule" true "$(echo "$DETAIL" | j 'o.data.permissionsByModule.length > 0')"
check "detail memuat SELURUH permission app (23)" 23 \
  "$(echo "$DETAIL" | j 'o.data.permissionsByModule.reduce((n,m)=>n+m.permissions.length,0)')"
check "sebagian granted=true" true \
  "$(echo "$DETAIL" | j 'o.data.permissionsByModule.some(m=>m.permissions.some(p=>p.granted))')"
check "sebagian granted=false (viewer readonly)" true \
  "$(echo "$DETAIL" | j 'o.data.permissionsByModule.some(m=>m.permissions.some(p=>!p.granted))')"
check "detail membawa userCount" true "$(echo "$DETAIL" | j 'o.data.userCount >= 0')"
check "id acak → 404" 404 "$(code "$BASE/roles/00000000-0000-7000-8000-000000000000")"

echo
echo "== Validasi create =="
post() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/roles" -H "$AUTH" -H "$APP" -H "$JSON" -d "$1"; }
check "nama huruf besar → 400" 400 "$(post "{\"applicationId\":\"$SELOKO_APP\",\"name\":\"Editor\"}")"
check "nama pakai spasi → 400" 400 "$(post "{\"applicationId\":\"$SELOKO_APP\",\"name\":\"nama role\"}")"
check "applicationId bukan uuid → 400" 400 "$(post '{"applicationId":"x","name":"uji-role"}')"
check "aplikasi tidak ada → 400" 400 \
  "$(post '{"applicationId":"00000000-0000-7000-8000-000000000000","name":"uji-role"}')"
check "nama sudah dipakai → 409" 409 "$(post "{\"applicationId\":\"$SELOKO_APP\",\"name\":\"editor\"}")"

# Permission milik aplikasi LAIN harus ditolak — ini yang menjaga isolasi RBAC.
LAPAK_PERM=$(get "/roles?applicationId=$LAPAK_APP&search=admin&limit=100" | j 'o.data[0].id')
LAPAK_PERM_ID=$(get "/roles/$LAPAK_PERM" | j 'o.data.permissionsByModule[0].permissions[0].id')
check "permission milik app lain → 400" 400 \
  "$(post "{\"applicationId\":\"$SELOKO_APP\",\"name\":\"uji-silang\",\"permissionIds\":[\"$LAPAK_PERM_ID\"]}")"

echo
echo "== Siklus hidup =="
P1=$(echo "$DETAIL" | j 'o.data.permissionsByModule[0].permissions[0].id')
P2=$(echo "$DETAIL" | j 'o.data.permissionsByModule[0].permissions[1].id')
CREATED=$(curl -s -X POST "$BASE/roles" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"applicationId\":\"$SELOKO_APP\",\"name\":\"uji-siklus\",\"description\":\"Role uji\",\"permissionIds\":[\"$P1\",\"$P2\"]}")
NEW_ID=$(echo "$CREATED" | j 'o.data.id')
check "create → id terbit" true "$([ -n "$NEW_ID" ] && echo true || echo false)"
check "create → 2 permission" 2 "$(echo "$CREATED" | j 'o.data.permissionCount')"
check "create → isSystemRole false" false "$(echo "$CREATED" | j 'o.data.isSystemRole')"

check "patch deskripsi → 200" 200 \
  "$(code -X PATCH "$BASE/roles/$NEW_ID" -H "$JSON" -d '{"description":"Diperbarui"}')"
check "patch body kosong → 400" 400 \
  "$(code -X PATCH "$BASE/roles/$NEW_ID" -H "$JSON" -d '{}')"
check "rename ke nama terpakai → 409" 409 \
  "$(code -X PATCH "$BASE/roles/$NEW_ID" -H "$JSON" -d '{"name":"editor"}')"
check "rename → nama berubah" "uji-siklus-2" \
  "$(curl -s -X PATCH "$BASE/roles/$NEW_ID" -H "$AUTH" -H "$APP" -H "$JSON" \
     -d '{"name":"uji-siklus-2"}' | j 'o.data.name')"

echo
echo "== Setel permission (menyeluruh, bukan tambahan) =="
SET=$(curl -s -X PUT "$BASE/roles/$NEW_ID/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"permissionIds\":[\"$P2\"]}")
check "set 1 permission → revoked 1" 1 "$(echo "$SET" | j 'o.data.revoked')"
check "set 1 permission → total 1" 1 "$(echo "$SET" | j 'o.data.total')"
check "set kosong → semua dicabut" 0 \
  "$(curl -s -X PUT "$BASE/roles/$NEW_ID/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
     -d '{"permissionIds":[]}' | j 'o.data.total')"
check "set permission app lain → 400" 400 \
  "$(code -X PUT "$BASE/roles/$NEW_ID/permissions" -H "$JSON" -d "{\"permissionIds\":[\"$LAPAK_PERM_ID\"]}")"
check "duplikat id dianggap satu" 1 \
  "$(curl -s -X PUT "$BASE/roles/$NEW_ID/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
     -d "{\"permissionIds\":[\"$P1\",\"$P1\"]}" | j 'o.data.total')"

echo
echo "== Cabut satu permission =="
# Pasang dua izin lagi supaya ada yang bisa dicabut satu-satu.
curl -s -o /dev/null -X PUT "$BASE/roles/$NEW_ID/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"permissionIds\":[\"$P1\",\"$P2\"]}"
REVOKED=$(curl -s -X DELETE "$BASE/roles/$NEW_ID/permissions/$P1" -H "$AUTH" -H "$APP")
check "cabut 1 dari 2 → sisa 1" 1 "$(echo "$REVOKED" | j 'o.data.remaining')"
check "detail mencerminkan pencabutan" 1 \
  "$(get "/roles/$NEW_ID" | j 'o.data.permissionsByModule.flatMap(m=>m.permissions).filter(p=>p.granted).length')"
# Mencabut yang sudah tidak dipegang harus 404, bukan 200 palsu.
check "cabut yang tidak dipegang → 404" 404 \
  "$(code -X DELETE "$BASE/roles/$NEW_ID/permissions/$P1")"
check "cabut dari role tidak ada → 404" 404 \
  "$(code -X DELETE "$BASE/roles/00000000-0000-7000-8000-000000000000/permissions/$P1")"
check "permissionId bukan uuid → 400" 400 \
  "$(code -X DELETE "$BASE/roles/$NEW_ID/permissions/bukan-uuid")"
check "cabut sisa terakhir → sisa 0" 0 \
  "$(curl -s -X DELETE "$BASE/roles/$NEW_ID/permissions/$P2" -H "$AUTH" -H "$APP" | j 'o.data.remaining')"

check "nonaktifkan → isActive false" false \
  "$(curl -s -X PATCH "$BASE/roles/$NEW_ID/activate" -H "$AUTH" -H "$APP" -H "$JSON" \
     -d '{"isActive":false}' | j 'o.data.isActive')"
check "hapus → 200" 200 "$(code -X DELETE "$BASE/roles/$NEW_ID")"
check "sudah terhapus → 404" 404 "$(code "$BASE/roles/$NEW_ID")"

echo
echo "== Pengaman role sistem =="
SYS_ROLE=$(get "/roles?applicationId=$SELOKO_APP&search=superadmin&limit=100" | j 'o.data[0].id')
check "rename role sistem → 403" 403 \
  "$(code -X PATCH "$BASE/roles/$SYS_ROLE" -H "$JSON" -d '{"name":"ganti-nama"}')"
check "nonaktifkan role sistem → 403" 403 \
  "$(code -X PATCH "$BASE/roles/$SYS_ROLE/activate" -H "$JSON" -d '{"isActive":false}')"
check "hapus role sistem → 403" 403 "$(code -X DELETE "$BASE/roles/$SYS_ROLE")"
check "deskripsi role sistem tetap boleh → 200" 200 \
  "$(code -X PATCH "$BASE/roles/$SYS_ROLE" -H "$JSON" -d '{"description":"Akses penuh seluruh fitur aplikasi"}')"

echo
echo "== Hapus role yang masih dipegang =="
HELD=$(get "/roles?applicationId=$SELOKO_APP&limit=100" | j 'o.data.find(r=>r.userCount>0 && !r.isSystemRole)?.id ?? ""')
if [ -n "$HELD" ]; then
  check "role masih dipegang → 409" 409 "$(code -X DELETE "$BASE/roles/$HELD")"
else
  # Seluruh role seed adalah role sistem; buat role non-sistem lalu tugaskan.
  TMP=$(curl -s -X POST "$BASE/roles" -H "$AUTH" -H "$APP" -H "$JSON" \
    -d "{\"applicationId\":\"$SELOKO_APP\",\"name\":\"uji-dipegang\"}" | j 'o.data.id')
  UID_=$(get '/users?search=tanpa.role' | j 'o.data[0].id')
  curl -s -o /dev/null -X POST "$BASE/users/$UID_/roles" -H "$AUTH" -H "$APP" -H "$JSON" \
    -d "{\"applicationId\":\"$SELOKO_APP\",\"roleId\":\"$TMP\"}"
  check "role masih dipegang → 409" 409 "$(code -X DELETE "$BASE/roles/$TMP")"
  # Bersihkan: cabut penugasan lalu hapus role.
  UAR=$(get "/users/$UID_" | j 'o.data.roles.find(r=>r.roleId==="'"$TMP"'").id')
  curl -s -o /dev/null -X DELETE "$BASE/users/$UID_/roles/$UAR" -H "$AUTH" -H "$APP"
  check "setelah dicabut, hapus → 200" 200 "$(code -X DELETE "$BASE/roles/$TMP")"
fi

echo
echo "$([ "$fail" = 0 ] && echo '✅' || echo '❌') $pass ok, $fail gagal"
[ "$fail" = 0 ] || exit 1
