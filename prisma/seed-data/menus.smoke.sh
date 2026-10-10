#!/usr/bin/env bash
# Uji endpoint manajemen dan sidebar menu terhadap API yang sedang berjalan.
# Pakai: bash prisma/seed-data/menus.smoke.sh [base_url]
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
OP_USER=$(login operator.user 'Seloko@2025!')
check "token superadmin didapat" true "$([ -n "$SU" ] && echo true || echo false)"
check "token viewer.only didapat" true "$([ -n "$VIEWER" ] && echo true || echo false)"
check "token operator.user didapat" true "$([ -n "$OP_USER" ] && echo true || echo false)"

AUTH="Authorization: Bearer $SU"
VAUTH="Authorization: Bearer $VIEWER"
OP_AUTH="Authorization: Bearer $OP_USER"

echo
echo "== Guard =="
check "tanpa token → 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/menus" -H "$APP")"
check "tanpa X-App-Code → 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/menus" -H "$AUTH")"
check "viewer tanpa application:update di POST → 403" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/menus" \
     -H "$VAUTH" -H "$APP" -H 'Content-Type: application/json' \
     -d '{"applicationId":"00000000-0000-0000-0000-000000000000","code":"test","label":"Test"}')"

echo
echo "== GET /menus/me (Sidebar Front-End) =="
ME_SU=$(curl -s "$BASE/menus/me" -H "$AUTH" -H "$APP")
check "/menus/me superadmin success=true" true "$(echo "$ME_SU" | j '.success')"
check "/menus/me superadmin root items = 5" 5 "$(echo "$ME_SU" | j '.data.menus.length')"
check "/menus/me superadmin bawa anak 'pengguna'" 3 \
  "$(echo "$ME_SU" | j '.data.menus.find(m=>m.code==="pengguna").items.length')"

ME_VIEWER=$(curl -s "$BASE/menus/me" -H "$VAUTH" -H "$APP")
# viewer.only tidak punya user:create sehingga pengguna.tambah harus hilang
check "viewer tidak melihat pengguna.tambah (user:create)" false \
  "$(echo "$ME_VIEWER" | j '.data.menus.find(m=>m.code==="pengguna").items.some(i=>i.code==="pengguna.tambah")')"

# operator.user punya user:create sehingga pengguna.tambah harus muncul
ME_OP=$(curl -s "$BASE/menus/me" -H "$OP_AUTH" -H "$APP")
check "operator.user melihat pengguna.tambah (user:create)" true \
  "$(echo "$ME_OP" | j '.data.menus.find(m=>m.code==="pengguna").items.some(i=>i.code==="pengguna.tambah")')"

echo
echo "== GET /menus (CMS Flat & Tree) =="
SELOKO_ID=$(curl -s "$BASE/applications?search=seloko&limit=100" -H "$AUTH" -H "$APP" \
  | j '.data.find(a=>a.code==="seloko").id')

CMS_LIST=$(curl -s "$BASE/menus?applicationId=$SELOKO_ID&limit=100" -H "$AUTH" -H "$APP")
check "CMS list seloko total > 10" true "$(echo "$CMS_LIST" | j '.meta.total > 10')"
check "CMS list punya applicationName" true "$(echo "$CMS_LIST" | j '.data[0].applicationName ? true : false')"

CMS_TREE=$(curl -s "$BASE/menus?applicationId=$SELOKO_ID&tree=true" -H "$AUTH" -H "$APP")
check "CMS tree root = 5" 5 "$(echo "$CMS_TREE" | j '.data.length')"
check "CMS tree root pertama 'dasbor'" "dasbor" "$(echo "$CMS_TREE" | j '.data[0].code')"

echo
echo "== GET /menus/:id (Detail) =="
FIRST_ID=$(echo "$CMS_LIST" | j '.data[0].id')
DETAIL=$(curl -s "$BASE/menus/$FIRST_ID" -H "$AUTH" -H "$APP")
check "detail menu success=true" true "$(echo "$DETAIL" | j '.success')"
check "detail menu bawa application object" true "$(echo "$DETAIL" | j '.data.application.code ? true : false')"

echo
echo "== POST, PATCH, REORDER, DELETE (Siklus CRUD) =="
# Buat menu baru
CREATE_RES=$(curl -s -X POST "$BASE/menus" \
  -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' \
  -d "{\"applicationId\":\"$SELOKO_ID\",\"code\":\"smoke.uji\",\"label\":\"Menu Smoke Test\",\"path\":\"/smoke-test\",\"sortOrder\":99}")
NEW_ID=$(echo "$CREATE_RES" | j '.data.id')
check "buat menu baru berhasil (201)" true "$([ -n "$NEW_ID" ] && echo true || echo false)"

# Coba buat lagi dengan kode sama (harus conflict 409)
CONFLICT_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/menus" \
  -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' \
  -d "{\"applicationId\":\"$SELOKO_ID\",\"code\":\"smoke.uji\",\"label\":\"Duplikat\",\"path\":\"/dup\"}")
check "kode menu duplikat → 409" 409 "$CONFLICT_CODE"

# Update label
UPDATE_RES=$(curl -s -X PATCH "$BASE/menus/$NEW_ID" \
  -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' \
  -d '{"label":"Menu Diperbarui","sortOrder":100}')
check "update menu label diperbarui" "Menu Diperbarui" "$(echo "$UPDATE_RES" | j '.data.label')"

# Toggle active/inactive
DEACT_RES=$(curl -s -X PATCH "$BASE/menus/$NEW_ID/activate" \
  -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' \
  -d '{"isActive":false}')
check "nonaktifkan menu isActive=false" false "$(echo "$DEACT_RES" | j '.data.isActive')"

# Reorder
REORDER_RES=$(curl -s -X PATCH "$BASE/menus/reorder" \
  -H "$AUTH" -H "$APP" -H 'Content-Type: application/json' \
  -d "{\"applicationId\":\"$SELOKO_ID\",\"items\":[{\"id\":\"$NEW_ID\",\"sortOrder\":50}]}")
check "reorder updatedCount >= 1" true "$(echo "$REORDER_RES" | j '.data.updatedCount >= 1')"

# Hapus menu
DEL_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/menus/$NEW_ID" \
  -H "$AUTH" -H "$APP")
check "delete menu → 200" 200 "$DEL_CODE"

# Pastikan sudah terhapus
GET_AFTER_DEL=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/menus/$NEW_ID" \
  -H "$AUTH" -H "$APP")
check "menu terhapus di-GET → 404" 404 "$GET_AFTER_DEL"

echo
printf '%s %d ok, %d gagal\n' "$([ "$fail" -eq 0 ] && echo '✅' || echo '❌')" "$pass" "$fail"
exit "$fail"
