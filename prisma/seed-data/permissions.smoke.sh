#!/usr/bin/env bash
# Uji endpoint manajemen permission terhadap API yang sedang berjalan.
#
# CATATAN: uji ini MENGHAPUS permission sungguhan di aplikasi `lapak-jambi-web`.
# Jalankan `npm run db:seed` sesudahnya untuk memulihkannya (seeder membuat
# ulang permission yang hilang dan memulihkan pemetaan role lewat kode).
#
# Pakai: bash prisma/seed-data/permissions.smoke.sh [base_url]
BASE="${1:-http://localhost:3000/api}"
APP='X-App-Code: seloko'
PW='Seloko@2025!'
pass=0; fail=0

j() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval(process.argv[1]);console.log(v===undefined?"":v)}catch(e){console.log("ERR:"+e.message)}})' "$1"; }

check() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-54s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  GAGAL %-54s harap %s, dapat %s\n' "$1" "$2" "$3"; fi
}

token() {
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
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/permissions" -H "$APP")"
VIEWER=$(token viewer.only seloko)
check "viewer tanpa permission:create → 403" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/permissions" \
     -H "Authorization: Bearer $VIEWER" -H "$APP" -H "$JSON" \
     -d '{"applicationId":"00000000-0000-7000-8000-000000000000","code":"x:y","name":"Uji","module":"Uji"}')"

echo
echo "== List & filter =="
SELOKO=$(get '/applications?search=seloko&limit=100' | j 'o.data.find(a=>a.code==="seloko").id')
LAPAK=$(get '/applications?search=lapak-jambi-web&limit=100' | j 'o.data.find(a=>a.code==="lapak-jambi-web").id')
ALL=$(get '/permissions?limit=200')
check "tanpa filter → 81 permission (seed)" 81 "$(echo "$ALL" | j 'o.meta.total')"
check "list membawa roleCount" true "$(echo "$ALL" | j 'o.data.every(p=>"roleCount" in p)')"
check "list membawa menuCount" true "$(echo "$ALL" | j 'o.data.every(p=>"menuCount" in p)')"
check "list membawa applicationCode" true "$(echo "$ALL" | j 'o.data.every(p=>!!p.applicationCode)')"
check "filter applicationId → 23 milik seloko" 23 \
  "$(get "/permissions?applicationId=$SELOKO&limit=200" | j 'o.meta.total')"
check "filter applicationId → semua app benar" true \
  "$(get "/permissions?applicationId=$SELOKO&limit=200" | j 'o.data.every(p=>p.applicationCode==="seloko")')"
check "filter module → hanya modul itu" true \
  "$(get "/permissions?applicationId=$SELOKO&module=Pengguna&limit=200" | j 'o.data.every(p=>p.module==="Pengguna")')"
check "search kode 'user:list' → ketemu" "user:list" \
  "$(get '/permissions?search=user%3Alist&limit=200' | j 'o.data.find(p=>p.code==="user:list").code')"
check "search nama (huruf kecil) → case-insensitive" true \
  "$(get '/permissions?search=melihat%20daftar&limit=200' | j 'o.meta.total > 0')"

echo
echo "== Daftar modul (isi dropdown) =="
MODS=$(get "/permissions/modules?applicationId=$SELOKO")
check "modul seloko → 3" 3 "$(echo "$MODS" | j 'o.data.length')"
check "modul membawa jumlah permission" true \
  "$(echo "$MODS" | j 'o.data.every(m=>m.permissionCount > 0)')"
check "total permission antar modul = 23" 23 \
  "$(echo "$MODS" | j 'o.data.reduce((n,m)=>n+m.permissionCount,0)')"
check "aplikasi tidak ada → daftar kosong" 0 \
  "$(get '/permissions/modules?applicationId=00000000-0000-7000-8000-000000000000' | j 'o.data.length')"

echo
echo "== Detail: siapa & apa yang memakai permission ini =="
PERM_ID=$(get "/permissions?applicationId=$SELOKO&module=Pengguna&limit=200" | j 'o.data.find(p=>p.code==="user:list").id')
DETAIL=$(get "/permissions/$PERM_ID")
check "detail → code benar" "user:list" "$(echo "$DETAIL" | j 'o.data.code')"
check "detail membawa daftar role" true "$(echo "$DETAIL" | j 'o.data.roles.length > 0')"
check "detail membawa daftar menu" true "$(echo "$DETAIL" | j 'o.data.menus.length > 0')"
check "menuCount = panjang daftar menu" true \
  "$(echo "$DETAIL" | j 'o.data.menuCount === o.data.menus.length')"
check "roleCount = panjang daftar role" true \
  "$(echo "$DETAIL" | j 'o.data.roleCount === o.data.roles.length')"
check "id acak → 404" 404 "$(code "$BASE/permissions/00000000-0000-7000-8000-000000000000")"

echo
echo "== Validasi create =="
post() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/permissions" -H "$AUTH" -H "$APP" -H "$JSON" -d "$1"; }
check "kode tanpa titik dua → 400" 400 "$(post "{\"applicationId\":\"$SELOKO\",\"code\":\"userlist\",\"name\":\"Uji\",\"module\":\"Uji\"}")"
check "kode huruf besar → 400" 400 "$(post "{\"applicationId\":\"$SELOKO\",\"code\":\"User:List\",\"name\":\"Uji\",\"module\":\"Uji\"}")"
check "kode spasi → 400" 400 "$(post "{\"applicationId\":\"$SELOKO\",\"code\":\"user list\",\"name\":\"Uji\",\"module\":\"Uji\"}")"
check "aksi kosong ('user:') → 400" 400 "$(post "{\"applicationId\":\"$SELOKO\",\"code\":\"user:\",\"name\":\"Uji\",\"module\":\"Uji\"}")"
check "module kosong → 400" 400 "$(post "{\"applicationId\":\"$SELOKO\",\"code\":\"uji:baca\",\"name\":\"Uji\",\"module\":\"\"}")"
check "aplikasi tidak ada → 400" 400 \
  "$(post '{"applicationId":"00000000-0000-7000-8000-000000000000","code":"uji:baca","name":"Uji","module":"Uji"}')"

echo
echo "== Siklus hidup =="
CREATED=$(curl -s -X POST "$BASE/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"applicationId\":\"$SELOKO\",\"code\":\"uji:baca\",\"name\":\"Membaca Uji\",\"module\":\"Uji\"}")
NEW_ID=$(echo "$CREATED" | j 'o.data.id')
check "create → id terbit" true "$([ -n "$NEW_ID" ] && echo true || echo false)"
check "create → created_at terisi" true "$(echo "$CREATED" | j '!!o.data.createdAt')"
check "kode sudah ada → 409" 409 \
  "$(post "{\"applicationId\":\"$SELOKO\",\"code\":\"uji:baca\",\"name\":\"Lain\",\"module\":\"Uji\"}")"
# Kode sama di aplikasi LAIN harus boleh — unique-nya (app_id, code).
check "kode sama di aplikasi lain → 201" 201 \
  "$(post "{\"applicationId\":\"$LAPAK\",\"code\":\"uji:baca\",\"name\":\"Membaca Uji\",\"module\":\"Uji\"}")"

check "patch nama → berubah" "Membaca Uji v2" \
  "$(curl -s -X PATCH "$BASE/permissions/$NEW_ID" -H "$AUTH" -H "$APP" -H "$JSON" \
     -d '{"name":"Membaca Uji v2"}' | j 'o.data.name')"
check "patch modul → berubah" "Uji Baru" \
  "$(curl -s -X PATCH "$BASE/permissions/$NEW_ID" -H "$AUTH" -H "$APP" -H "$JSON" \
     -d '{"module":"Uji Baru"}' | j 'o.data.module')"
check "patch body kosong → 400" 400 \
  "$(code -X PATCH "$BASE/permissions/$NEW_ID" -H "$JSON" -d '{}')"
# `code` tidak ada di skema update — zod strip, jadi tidak mengubah apa pun.
check "patch mencoba ubah code → diabaikan" "uji:baca" \
  "$(curl -s -X PATCH "$BASE/permissions/$NEW_ID" -H "$AUTH" -H "$APP" -H "$JSON" \
     -d '{"code":"ganti:kode"}' -o /dev/null -w '%{http_code}' >/dev/null; get "/permissions/$NEW_ID" | j 'o.data.code')"

echo
echo "== Hapus permission tanpa pemakai =="
DEL=$(curl -s -X DELETE "$BASE/permissions/$NEW_ID" -H "$AUTH" -H "$APP")
check "hapus → revokedFromRoles 0" 0 "$(echo "$DEL" | j 'o.data.revokedFromRoles')"
check "hapus → unguardedMenus 0" 0 "$(echo "$DEL" | j 'o.data.unguardedMenus')"
check "sudah terhapus → 404" 404 "$(code "$BASE/permissions/$NEW_ID")"

echo
echo "== Isolasi aplikasi tetap utuh =="
check "permission lapak masih ada" true \
  "$(get '/permissions?applicationId='"$LAPAK"'&limit=200' | j 'o.data.some(p=>p.code==="uji:baca")')"

echo
echo "== Dampak hapus permission yang DIPAKAI (lapak-jambi-web) =="
# Pilih permission yang dipakai role sekaligus menjaga menu sidebar di lapak.
# (lapak bergerak di ranah product/merchant/order — bukan user:*)
TARGET=$(get "/permissions?applicationId=$LAPAK&search=product%3Alist&limit=200" | j 'o.data.find(p=>p.code==="product:list").id')
check "target ditemukan" true "$([ -n "$TARGET" ] && echo true || echo false)"
BEFORE=$(get "/permissions/$TARGET")
ROLES=$(echo "$BEFORE" | j 'o.data.roleCount')
MENUS=$(echo "$BEFORE" | j 'o.data.menuCount')
check "target dipakai ≥1 role" true "$([ "$ROLES" -ge 1 ] && echo true || echo false)"
check "target dipakai ≥1 menu" true "$([ "$MENUS" -ge 1 ] && echo true || echo false)"

DEL2=$(curl -s -X DELETE "$BASE/permissions/$TARGET" -H "$AUTH" -H "$APP")
check "hapus → revokedFromRoles = jumlah role" "$ROLES" "$(echo "$DEL2" | j 'o.data.revokedFromRoles')"
check "hapus → unguardedMenus = jumlah menu" "$MENUS" "$(echo "$DEL2" | j 'o.data.unguardedMenus')"

# Menu yang menunjuk permission itu kini permission_id NULL → tidak lagi terbatas.
MENU_ID=$(echo "$BEFORE" | j 'o.data.menus[0].id')
MENU=$(curl -s "$BASE/menus/$MENU_ID" -H "$AUTH" -H "$APP")
check "menu yatim → permissionId null" null "$(echo "$MENU" | j 'o.data?.permissionId ?? null')"

echo
echo "== Cache: izin yang dihapus harus LANGSUNG hilang =="
# Buat permission baru, pasang ke role, buktikan akses 200 → hapus permission →
# harus langsung 403, bukan menunggu TTL 5 menit.
NEWPERM=$(curl -s -X POST "$BASE/permissions" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"applicationId\":\"$SELOKO\",\"code\":\"cache:uji\",\"name\":\"Uji Cache\",\"module\":\"Uji\"}" | j 'o.data.id')
VIEWER_ROLE=$(get "/roles?applicationId=$SELOKO&search=viewer&limit=100" | j 'o.data[0].id')
# Guard butuh kode yang benar-benar dipakai route; pakai user:list milik seloko.
UL=$(get "/permissions?applicationId=$SELOKO&search=user%3Alist&limit=200" | j 'o.data[0].id')
USER_ID=$(get '/users?search=tanpa.role' | j 'o.data[0].id')
UJI_ROLE=$(curl -s -X POST "$BASE/roles" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"applicationId\":\"$SELOKO\",\"name\":\"uji-cache-perm\",\"permissionIds\":[\"$UL\"]}" | j 'o.data.id')
UAR=$(curl -s -X POST "$BASE/users/$USER_ID/roles" -H "$AUTH" -H "$APP" -H "$JSON" \
  -d "{\"applicationId\":\"$SELOKO\",\"roleId\":\"$UJI_ROLE\"}" | j 'o.data.id')
T=$(token tanpa.role seloko)
UAUTH="Authorization: Bearer $T"
ucode() { curl -s -o /dev/null -w '%{http_code}' "$BASE/users" -H "$UAUTH" -H "$APP"; }
check "izin aktif → 200" 200 "$(ucode)"
check "ulang (dari cache) → 200" 200 "$(ucode)"
curl -s -o /dev/null -X DELETE "$BASE/permissions/$UL" -H "$AUTH" -H "$APP"
check "permission dihapus → LANGSUNG 403" 403 "$(ucode)"
# CABUT PENUGASAN DULU: hapus role yang masih dipegang pengguna dijawab 409,
# sehingga rolenya tertinggal di DB kalau urutannya terbalik.
curl -s -o /dev/null -X DELETE "$BASE/users/$USER_ID/roles/$UAR" -H "$AUTH" -H "$APP"
curl -s -o /dev/null -X DELETE "$BASE/roles/$UJI_ROLE" -H "$AUTH" -H "$APP"

# Bersihkan sisa uji di lapak. Permission yang terhapus dipulihkan `db:seed`
# (seeder membuat ulang permission hilang dan menautkan ulang role & menu).
curl -s -o /dev/null -X DELETE "$BASE/permissions/$(get "/permissions?applicationId=$LAPAK&search=uji%3Abaca&limit=200" | j 'o.data[0].id')" -H "$AUTH" -H "$APP"
curl -s -o /dev/null -X DELETE "$BASE/permissions/$NEWPERM" -H "$AUTH" -H "$APP"

echo
echo "== Tidak meninggalkan role uji =="
check "role uji-cache-perm ikut terhapus" 404 "$(code "$BASE/roles/$UJI_ROLE")"

echo
echo "== Pulihkan fixture =="
# Uji ini MENGHAPUS permission sungguhan (user:list seloko, product:list lapak),
# jadi ia WAJIB memulihkannya sendiri. Tanpa ini setiap smoke test lain yang
# berjalan sesudahnya gagal karena fixture-nya bolong — kegagalan yang
# menyesatkan karena tampak seperti bug di modul yang sama sekali lain.
# Seeder membuat ulang permission hilang lalu menautkan ulang role dan menu
# lewat kode, jadi pemulihannya menyeluruh.
if npm run --silent db:seed >/dev/null 2>&1; then
  pass=$((pass+1)); printf '  ok    %-54s %s\n' "db:seed memulihkan fixture" "ok"
else
  fail=$((fail+1)); printf '  GAGAL %-54s db:seed gagal\n' "db:seed memulihkan fixture"
fi
check "permission seloko kembali 23" 23 \
  "$(get "/permissions?applicationId=$SELOKO&limit=200" | j 'o.meta.total')"
check "permission lapak kembali 23" 23 \
  "$(get "/permissions?applicationId=$LAPAK&limit=200" | j 'o.meta.total')"
check "user:list seloko hidup lagi" true \
  "$(get "/permissions?applicationId=$SELOKO&search=user%3Alist&limit=200" | j 'o.meta.total > 0')"

echo
echo "$([ "$fail" = 0 ] && echo '✅' || echo '❌') $pass ok, $fail gagal"
[ "$fail" = 0 ] || exit 1
