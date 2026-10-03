#!/usr/bin/env bash
# Uji GET /applications/me — daftar aplikasi milik user yang sedang login.
# Pakai: bash prisma/seed-data/me-applications.smoke.sh [base_url]
BASE="${1:-http://localhost:3000/api}"
PW='Seloko@2025!'
pass=0; fail=0

# Ekspresi memakai `o` sebagai akar JSON, mis. 'o.data.length'. Ditulis penuh
# (bukan disisipkan otomatis) supaya operator seperti `in` dan `!==` bisa dipakai.
j() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval(process.argv[1]);console.log(v===undefined?"":v)}catch(e){console.log("ERR:"+e.message)}})' "$1"; }

check() { # label harapan aktual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-50s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  GAGAL %-50s harap %s, dapat %s\n' "$1" "$2" "$3"; fi
}

token() { # identity app password
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -H "X-App-Code: $2" -d "{\"identity\":\"$1\",\"password\":\"${3:-$PW}\"}" | j 'o.data.accessToken'
}

me() { # token app -> body
  curl -s "$BASE/applications/me" -H "Authorization: Bearer $1" -H "X-App-Code: $2"
}

echo "== Guard =="
check "tanpa token → 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/applications/me" -H 'X-App-Code: seloko')"
check "tanpa X-App-Code → 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/applications/me")"

echo
echo "== Super admin: seluruh aplikasi aktif =="
SU=$(token superadmin seloko 'SelokoBapenda@2025!')
SU_BODY=$(me "$SU" seloko)
# 5 aplikasi di-seed, 1 di antaranya isActive=false
check "superadmin → 4 aplikasi aktif" 4 "$(echo "$SU_BODY" | j 'o.data.length')"
check "superadmin → tanpa seloko-nonaktif" false \
  "$(echo "$SU_BODY" | j 'o.data.some(a=>a.code==="seloko-nonaktif")')"
check "superadmin → roles kosong (bypass)" true \
  "$(echo "$SU_BODY" | j 'o.data.every(a=>a.roles.length===0)')"
check "entri membawa baseUrl" true "$(echo "$SU_BODY" | j 'o.data.every(a=>"baseUrl" in a)')"
check "entri membawa icon" true "$(echo "$SU_BODY" | j 'o.data.every(a=>"icon" in a)')"
check "isActive tidak dibocorkan" false "$(echo "$SU_BODY" | j '"isActive" in o.data[0]')"
check "counts tidak dibocorkan" false "$(echo "$SU_BODY" | j '"counts" in o.data[0]')"

echo
echo "== Satu aplikasi =="
# Pegawai selalu masuk lewat seloko; launcher-nya memuat aplikasi yang ia kelola.
ED=$(token editor.profil seloko)
ED_BODY=$(me "$ED" seloko)
check "editor.profil → 1 aplikasi" 1 "$(echo "$ED_BODY" | j 'o.data.length')"
check "editor.profil → bapenda-profile" "bapenda-profile" "$(echo "$ED_BODY" | j 'o.data[0].code')"
check "editor.profil → role 'editor'" "editor" "$(echo "$ED_BODY" | j 'o.data[0].roles.join()')"
check "editor.profil → permanen (expiresAt null)" true \
  "$(echo "$ED_BODY" | j 'o.data[0].expiresAt === null')"

echo
echo "== Lintas aplikasi =="
LA=$(token lintasapp seloko)
LA_BODY=$(me "$LA" seloko)
check "lintasapp → 3 aplikasi" 3 "$(echo "$LA_BODY" | j 'o.data.length')"
check "lintasapp → urut per kode" true \
  "$(echo "$LA_BODY" | j 'JSON.stringify(o.data.map(a=>a.code))===JSON.stringify(o.data.map(a=>a.code).sort())')"

echo
echo "== Multi-role di satu aplikasi =="
# multirole punya DUA role di lapak-jambi-web (editor + verifikator).
MR=$(token multirole seloko)
MR_BODY=$(me "$MR" seloko)
# Dua role di aplikasi yang sama harus tampil sebagai SATU entri, roles digabung.
check "multirole → 1 aplikasi" 1 "$(echo "$MR_BODY" | j 'o.data.length')"
check "multirole → aplikasi tidak terduplikasi" true \
  "$(echo "$MR_BODY" | j 'new Set(o.data.map(a=>a.code)).size === o.data.length')"
check "multirole → 2 role digabung" 2 \
  "$(echo "$MR_BODY" | j 'o.data.find(a=>a.code==="lapak-jambi-web").roles.length')"

echo
echo "== Akses yang tidak berlaku =="
# role.kedaluwarsa & role.mati tidak bisa login, jadi dipinjam token superadmin
# untuk memastikan keduanya memang tidak punya aplikasi: dicek lewat /users.
EXPIRED_ID=$(curl -s "$BASE/users?search=role.kedaluwarsa" -H "Authorization: Bearer $SU" -H 'X-App-Code: seloko' | j 'o.data[0].id')
check "role.kedaluwarsa ada di DB" true "$([ -n "$EXPIRED_ID" ] && echo true || echo false)"

# role.sementara masih berlaku → punya 1 aplikasi dengan expiresAt terisi
TMP=$(token role.sementara seloko)
TMP_BODY=$(me "$TMP" seloko)
check "role.sementara → 1 aplikasi" 1 "$(echo "$TMP_BODY" | j 'o.data.length')"
check "role.sementara → expiresAt terisi" true \
  "$(echo "$TMP_BODY" | j 'o.data[0].expiresAt !== null')"

echo
echo "== Konsisten dengan izin =="
# Tiap aplikasi di launcher pegawai harus punya izin yang terbaca dari seloko —
# kalau tidak, kartunya terbuka ke layar yang semuanya 403.
for ID in $(echo "$LA_BODY" | j 'o.data.map(a=>a.id).join(" ")'); do
  check "lintasapp punya izin di $ID" true \
    "$(curl -s "$BASE/permissions/$ID/me" -H "Authorization: Bearer $LA" -H 'X-App-Code: seloko' | j 'o.data.total > 0')"
done

echo
echo "== Warga: hanya aplikasi tempat ia terdaftar =="
W=$(token warga.pedagang@gmail.com lapak-jambi-web)
W_BODY=$(me "$W" lapak-jambi-web)
check "warga.pedagang → 1 aplikasi" 1 "$(echo "$W_BODY" | j 'o.data.length')"
check "warga.pedagang → lapak-jambi-web/pedagang" "lapak-jambi-web/pedagang" \
  "$(echo "$W_BODY" | j 'o.data[0].code+"/"+o.data[0].roles.join()')"

echo
echo "$([ "$fail" = 0 ] && echo '✅' || echo '❌') $pass ok, $fail gagal"
[ "$fail" = 0 ] || exit 1
