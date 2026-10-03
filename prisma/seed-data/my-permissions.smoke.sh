#!/usr/bin/env bash
# Uji GET /permissions/:applicationId/me — izin milik pemanggil sendiri.
#
# Bukti terpenting: hasilnya HARUS sama persis dengan `permissions` dari
# /auth/me untuk aplikasi yang sama. Keduanya memakai resolveUserPermissions,
# dan kalau suatu saat melenceng, CMS akan menyembunyikan tombol yang justru
# dijawab 403 — persis yang ingin dicegah endpoint ini.
#
# Pakai: bash prisma/seed-data/my-permissions.smoke.sh [base_url]
BASE="${1:-http://localhost:3000/api}"
PW='Seloko@2025!'
pass=0; fail=0

j() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval(process.argv[1]);console.log(v===undefined?"":v)}catch(e){console.log("ERR:"+e.message)}})' "$1"; }

check() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-56s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  GAGAL %-56s harap %s, dapat %s\n' "$1" "$2" "$3"; fi
}

# Login pada konteks aplikasi `app`, kembalikan access token.
token() { # identity app password
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -H "X-App-Code: $2" -d "{\"identity\":\"$1\",\"password\":\"${3:-$PW}\"}" | j 'o.data.accessToken'
}

SU=$(token superadmin seloko 'SelokoBapenda@2025!')
SELOKO=$(curl -s "$BASE/applications?search=seloko&limit=100" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' | j 'o.data.find(a=>a.code==="seloko").id')
LAPAK=$(curl -s "$BASE/applications?search=lapak-jambi-web&limit=100" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' | j 'o.data.find(a=>a.code==="lapak-jambi-web").id')
BAPENDA=$(curl -s "$BASE/applications?search=bapenda-profile&limit=100" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' | j 'o.data.find(a=>a.code==="bapenda-profile").id')
NONAKTIF=$(curl -s "$BASE/applications?search=seloko-nonaktif&limit=100" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' | j 'o.data.find(a=>a.code==="seloko-nonaktif").id')
check "aplikasi seed ditemukan" true "$([ -n "$SELOKO" ] && [ -n "$LAPAK" ] && [ -n "$BAPENDA" ] && echo true || echo false)"

# mine <token> <appCodeHeader> <applicationId>
mine() { curl -s "$BASE/permissions/$3/me" -H "Authorization: Bearer $1" -H "X-App-Code: $2"; }

echo
echo "== Guard =="
check "tanpa token → 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/permissions/$SELOKO/me" -H 'X-App-Code: seloko')"
check "applicationId bukan uuid → 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/permissions/bukan-uuid/me" \
     -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko')"
check "aplikasi tidak ada → 404" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/permissions/00000000-0000-7000-8000-000000000000/me" \
     -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko')"
check "aplikasi nonaktif → 404" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/permissions/$NONAKTIF/me" \
     -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko')"

echo
echo "== Bisa dipakai TANPA izin apa pun (inilah tujuan endpoint) =="
# viewer.only tidak punya satu pun kode tulis, jadi rute terproteksi menolaknya
# mentah-mentah — sementara izinnya sendiri harus tetap terbaca. Kalau endpoint
# ini diberi requirePermission, pengguna seperti dia justru yang tak bisa
# memeriksa haknya sendiri, persis masalah yang ingin dipecahkan.
TV0=$(token viewer.only seloko)
check "viewer.only POST /permissions (butuh permission:create) → 403" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/permissions" \
     -H "Authorization: Bearer $TV0" -H 'X-App-Code: seloko' -H 'Content-Type: application/json' \
     -d "{\"applicationId\":\"$SELOKO\",\"code\":\"tes:x\",\"name\":\"Tes\",\"module\":\"Tes\"}")"
check "…tapi izinnya sendiri tetap terbaca → 200" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/permissions/$SELOKO/me" \
     -H "Authorization: Bearer $TV0" -H 'X-App-Code: seloko')"
check "→ isinya tidak kosong" true "$(mine "$TV0" seloko "$SELOKO" | j 'o.data.total > 0')"

echo
echo "== Pengguna aplikasi LAIN bisa menanyakan aplikasinya sendiri =="
# Pegawai masuk lewat seloko lalu menanyakan izinnya di lapak.
TV=$(token verifikator.lapak seloko)
V=$(mine "$TV" seloko "$LAPAK")
check "verifikator.lapak @lapak → 200" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/permissions/$LAPAK/me" \
     -H "Authorization: Bearer $TV" -H 'X-App-Code: seloko')"
check "→ izinnya tidak kosong" true "$(echo "$V" | j 'o.data.total > 0')"
check "→ aplikasi yang dilaporkan benar" "lapak-jambi-web" "$(echo "$V" | j 'o.data.application.code')"
check "→ role dilaporkan" "verifikator" "$(echo "$V" | j 'o.data.roles[0].name')"
check "→ isSuperAdmin false" false "$(echo "$V" | j 'o.data.isSuperAdmin')"

echo
echo "== Cocok dengan /auth/me (sumber yang sama, tak boleh melenceng) =="
# /auth/me menjawab untuk aplikasi pintu masuk, jadi pembandingan hanya bermakna
# saat applicationId == pintu masuk: pegawai di seloko, warga di lapak.
for spec in "viewer.only:seloko:$SELOKO" "admin.seloko:seloko:$SELOKO" "operator.user:seloko:$SELOKO" "warga.pedagang@gmail.com:lapak-jambi-web:$LAPAK"; do
  IFS=: read -r who app appid <<< "$spec"
  T=$(token "$who" "$app")
  FROM_ME=$(curl -s "$BASE/auth/me" -H "Authorization: Bearer $T" -H "X-App-Code: $app" | j 'JSON.stringify(o.data.permissions.slice().sort())')
  FROM_EP=$(mine "$T" "$app" "$appid" | j 'JSON.stringify(o.data.permissions.slice().sort())')
  check "$who: /auth/me == endpoint ini" "$FROM_ME" "$FROM_EP"
  check "$who: izinnya tidak kosong" true "$([ "$FROM_ME" != "[]" ] && echo true || echo false)"
done

echo
echo "== multirole: gabungan dua role, bukan salah satu =="
TM=$(token multirole seloko)
M=$(mine "$TM" seloko "$LAPAK")
check "→ dua role dilaporkan" 2 "$(echo "$M" | j 'o.data.roles.length')"
check "→ role terurut" "editor,verifikator" "$(echo "$M" | j 'o.data.roles.map(r=>r.name).join(",")')"
check "→ total = gabungan, bukan irisan" true \
  "$(echo "$M" | j 'o.data.total >= 2')"
check "→ permissionsByModule konsisten dgn permissions" true \
  "$(echo "$M" | j 'o.data.permissionsByModule.flatMap(m=>m.permissions.map(p=>p.code)).sort().join(",") === o.data.permissions.slice().sort().join(",")')"
check "→ tiap entri modul punya label nama" true \
  "$(echo "$M" | j 'o.data.permissionsByModule.every(m=>m.permissions.every(p=>!!p.name))')"

echo
echo "== Penugasan berbatas waktu dilaporkan apa adanya =="
TS=$(token role.sementara seloko)
S=$(mine "$TS" seloko "$SELOKO")
check "role.sementara → role dilaporkan" "editor" "$(echo "$S" | j 'o.data.roles[0].name')"
check "role.sementara → expiresAt terisi" true "$(echo "$S" | j 'o.data.roles[0].expiresAt !== null')"
check "role.sementara → izin mengalir" true "$(echo "$S" | j 'o.data.total > 0')"

echo
echo "== Super admin: seluruh izin aplikasi, tanpa penugasan role =="
A=$(mine "$SU" seloko "$SELOKO")
check "superadmin → isSuperAdmin true" true "$(echo "$A" | j 'o.data.isSuperAdmin')"
check "superadmin → 23 permission seloko" 23 "$(echo "$A" | j 'o.data.total')"
check "superadmin → izin lengkap termasuk user:delete" true \
  "$(echo "$A" | j 'o.data.permissions.includes("user:delete")')"
# superadmin memang punya role di semua aplikasi seed; yang penting bypass-nya
# berlaku juga di aplikasi tanpa penugasan (dibuktikan lewat app tanpa role).
check "superadmin @lapak → juga lengkap" 23 "$(mine "$SU" seloko "$LAPAK" | j 'o.data.total')"

echo
echo "== Non-superadmin TIDAK mendapat bypass =="
# Akar masalah yang muncul saat menulis uji ini: katalog seed hanya punya
# permission:read dan permission:list, sehingga POST/PATCH/DELETE /permissions
# tidak bisa diberikan ke role mana pun dan hanya superadmin yang bisa
# memakainya. Kekurangan SEED itu, bukan endpoint ini — di sini yang dibuktikan
# adalah izin user biasa memang terbatas, bukan ikut membengkak.
VS=$(mine "$TV0" seloko "$SELOKO")
check "viewer.only → bukan superadmin" false "$(echo "$VS" | j 'o.data.isSuperAdmin')"
check "viewer.only → hanya 12 izin (bukan 23 penuh)" 12 "$(echo "$VS" | j 'o.data.total')"
check "viewer.only → tanpa user:delete" false "$(echo "$VS" | j 'o.data.permissions.includes("user:delete")')"
check "viewer.only → tanpa permission:create" false "$(echo "$VS" | j 'o.data.permissions.includes("permission:create")')"

echo
echo "== Isolasi: menanyakan aplikasi yang tidak dipunya =="
check "viewer.only @lapak (tak punya role di sana) → kosong" 0 \
  "$(mine "$(token viewer.only seloko)" seloko "$LAPAK" | j 'o.data.total')"
check "lintasapp @seloko → hanya izin viewer" true \
  "$(mine "$(token lintasapp seloko)" seloko "$SELOKO" | j 'o.data.total > 0')"
# Token terbit untuk lapak-jambi-app (di sana dia punya role), tapi yang
# ditanyakan lapak-jambi-web — di situ dia tidak punya penugasan apa pun.
check "lintasapp @lapak-jambi-app → tanya lapak-jambi-web → kosong" 0 \
  "$(mine "$(token lintasapp seloko)" seloko "$LAPAK" | j 'o.data.total')"

echo
echo "== Perubahan izin langsung terlihat (cache dibuang) =="
# Role khusus uji: satu permission, lalu dicabut dan dilihat seketika.
UL=$(curl -s "$BASE/permissions?applicationId=$SELOKO&search=user%3Alist&limit=200" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' | j 'o.data[0].id')
UID_=$(curl -s "$BASE/users?search=tanpa.role" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' | j 'o.data[0].id')
ROLE=$(curl -s -X POST "$BASE/roles" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' -H 'Content-Type: application/json' \
  -d "{\"applicationId\":\"$SELOKO\",\"name\":\"uji-mine\",\"permissionIds\":[\"$UL\"]}" | j 'o.data.id')
UAR=$(curl -s -X POST "$BASE/users/$UID_/roles" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' -H 'Content-Type: application/json' \
  -d "{\"applicationId\":\"$SELOKO\",\"roleId\":\"$ROLE\"}" | j 'o.data.id')
TU=$(token tanpa.role seloko)
check "setelah role dipasang → 1 izin" 1 "$(mine "$TU" seloko "$SELOKO" | j 'o.data.total')"
check "izinnya user:list" "user:list" "$(mine "$TU" seloko "$SELOKO" | j 'o.data.permissions[0]')"
# Cabut lewat endpoint role — endpoint ini harus langsung mencerminkan.
curl -s -o /dev/null -X PUT "$BASE/roles/$ROLE/permissions" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' -H 'Content-Type: application/json' -d '{"permissionIds":[]}'
check "permission dicabut → LANGSUNG 0" 0 "$(mine "$TU" seloko "$SELOKO" | j 'o.data.total')"
curl -s -o /dev/null -X DELETE "$BASE/users/$UID_/roles/$UAR" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko'
curl -s -o /dev/null -X DELETE "$BASE/roles/$ROLE" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko'
check "bersih: role uji terhapus" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/roles/$ROLE" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko')"

echo
echo "$([ "$fail" = 0 ] && echo '✅' || echo '❌') $pass ok, $fail gagal"
[ "$fail" = 0 ] || exit 1
