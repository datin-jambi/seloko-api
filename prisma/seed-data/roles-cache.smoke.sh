#!/usr/bin/env bash
# Bukti perubahan permission role langsung berlaku — tidak tertahan cache Redis.
#
# resolveUserPermissions menyimpan hasilnya 5 menit. Tanpa invalidasi, izin yang
# baru dicabut masih meloloskan request selama itu. Uji ini memakai permission
# nyata (user:list) dan endpoint nyata (/users) supaya yang dibuktikan adalah
# perilaku guard, bukan isi tabel.
BASE="${1:-http://localhost:3000/api}"
APP='X-App-Code: seloko'
PW='Seloko@2025!'
pass=0; fail=0

j() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval(process.argv[1]);console.log(v===undefined?"":v)}catch(e){console.log("ERR:"+e.message)}})' "$1"; }

check() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-52s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  GAGAL %-52s harap %s, dapat %s\n' "$1" "$2" "$3"; fi
}

token() {
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -H "X-App-Code: $2" -d "{\"identity\":\"$1\",\"password\":\"${3:-$PW}\"}" | j 'o.data.accessToken'
}

SU=$(token superadmin seloko 'SelokoBapenda@2025!')
AUTH="Authorization: Bearer $SU"
JSON='Content-Type: application/json'
get() { curl -s "$BASE$1" -H "$AUTH" -H "$APP"; }

APP_ID=$(get '/applications?search=seloko&limit=100' | j 'o.data.find(a=>a.code==="seloko").id')
USER_ID=$(get '/users?search=tanpa.role' | j 'o.data[0].id')

# Role khusus uji dengan tepat satu permission: user:list.
PERMS=$(get "/roles?applicationId=$APP_ID&search=viewer&limit=100" | j 'o.data[0].id')
USER_LIST=$(get "/roles/$PERMS" \
  | j 'o.data.permissionsByModule.flatMap(m=>m.permissions).find(p=>p.code==="user:list").id')

echo "== Persiapan: role 'uji-cache' dengan user:list =="
ROLE=$(curl -s -X POST "$BASE/roles" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"applicationId\":\"$APP_ID\",\"name\":\"uji-cache\",\"permissionIds\":[\"$USER_LIST\"]}" | j 'o.data.id')
check "role dibuat" true "$([ -n "$ROLE" ] && echo true || echo false)"

UAR=$(curl -s -X POST "$BASE/users/$USER_ID/roles" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"applicationId\":\"$APP_ID\",\"roleId\":\"$ROLE\"}" | j 'o.data.id')
check "role ditugaskan ke tanpa.role" true "$([ -n "$UAR" ] && echo true || echo false)"

T=$(token tanpa.role seloko)
UAUTH="Authorization: Bearer $T"
ucode() { curl -s -o /dev/null -w '%{http_code}' "$BASE/users" -H "$UAUTH" -H "$APP"; }

echo
echo "== Izin berlaku, lalu cache terisi =="
check "GET /users → 200" 200 "$(ucode)"
# Panggilan kedua dilayani dari cache Redis — inilah yang harus dibatalkan.
check "GET /users lagi (dari cache) → 200" 200 "$(ucode)"

echo
echo "== Cabut permission → harus LANGSUNG 403 =="
curl -s -o /dev/null -X PUT "$BASE/roles/$ROLE/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d '{"permissionIds":[]}'
check "setelah permission dicabut → 403" 403 "$(ucode)"

echo
echo "== Pasang kembali → harus LANGSUNG 200 =="
curl -s -o /dev/null -X PUT "$BASE/roles/$ROLE/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"permissionIds\":[\"$USER_LIST\"]}"
check "setelah permission dipasang → 200" 200 "$(ucode)"

echo
echo "== Cabut lewat DELETE satu permission → harus LANGSUNG 403 =="
# Jalur pencabutan tunggal harus membuang cache sama seperti PUT.
check "DELETE permission → sisa 0" 0 \
  "$(curl -s -X DELETE "$BASE/roles/$ROLE/permissions/$USER_LIST" -H "$AUTH" -H "$APP" | j 'o.data.remaining')"
check "setelah DELETE permission → 403" 403 "$(ucode)"

curl -s -o /dev/null -X PUT "$BASE/roles/$ROLE/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"permissionIds\":[\"$USER_LIST\"]}"
check "dipasang kembali → 200" 200 "$(ucode)"

echo
echo "== Nonaktifkan role → harus LANGSUNG 403 =="
curl -s -o /dev/null -X PATCH "$BASE/roles/$ROLE/activate" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d '{"isActive":false}'
check "role nonaktif → 403" 403 "$(ucode)"
# Role mati juga mencabut akses aplikasi: login baru harus ditolak.
check "role nonaktif → login ditolak 403" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/login" \
     -H "$JSON" -H "$APP" -d "{\"identity\":\"tanpa.role\",\"password\":\"$PW\"}")"

curl -s -o /dev/null -X PATCH "$BASE/roles/$ROLE/activate" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d '{"isActive":true}'
check "role diaktifkan → 200 lagi" 200 "$(ucode)"

echo
echo "== Bersihkan =="
curl -s -o /dev/null -X DELETE "$BASE/users/$USER_ID/roles/$UAR" -H "$AUTH" -H "$APP"
check "role dihapus" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/roles/$ROLE" -H "$AUTH" -H "$APP")"
check "tanpa.role kembali tanpa akses" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/login" \
     -H "$JSON" -H "$APP" -d "{\"identity\":\"tanpa.role\",\"password\":\"$PW\"}")"

echo
echo "$([ "$fail" = 0 ] && echo '✅' || echo '❌') $pass ok, $fail gagal"
[ "$fail" = 0 ] || exit 1
