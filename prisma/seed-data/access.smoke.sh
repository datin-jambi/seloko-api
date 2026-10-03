#!/usr/bin/env bash
# Uji model akses Fase 1: akun INTERNAL vs PUBLIC, pintu masuk seloko, dan
# pagar lintas aplikasi di requirePermission.
#
# Pakai: bash prisma/seed-data/access.smoke.sh [base_url]
BASE="${1:-http://localhost:3000/api}"
PW='Seloko@2025!'
pass=0; fail=0

j() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval(process.argv[1]);console.log(v===undefined?"":v)}catch(e){console.log("ERR:"+e.message)}})' "$1"; }

check() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-58s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  GAGAL %-58s harap %s, dapat %s\n' "$1" "$2" "$3"; fi
}

login()      { curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -H "X-App-Code: $2" -d "{\"identity\":\"$1\",\"password\":\"${3:-$PW}\"}"; }
login_code() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -H "X-App-Code: $2" -d "{\"identity\":\"$1\",\"password\":\"${3:-$PW}\"}"; }
token()      { login "$@" | j 'o.data.accessToken'; }
hit()        { curl -s -o /dev/null -w '%{http_code}' "$BASE$1" -H "Authorization: Bearer $2" -H "X-App-Code: $3"; }

echo "== Pegawai: hanya lewat aplikasi INTERNAL =="
check "editor.profil @seloko (role hanya di bapenda) → 200" 200 "$(login_code editor.profil seloko)"
# Di aplikasi PUBLIC login hanya mencari di antara akun warga, jadi pegawai
# "tidak ada" di sana → 401 generik. Sengaja bukan 403 "akun pegawai dilarang":
# itu akan membocorkan ke aplikasi publik bahwa email tsb milik pegawai.
check "editor.profil @bapenda-profile (app PUBLIC) → 401"   401 "$(login_code editor.profil bapenda-profile)"
check "verifikator.lapak @seloko → 200"                    200 "$(login_code verifikator.lapak seloko)"
check "verifikator.lapak @lapak-jambi-web → 401"           401 "$(login_code verifikator.lapak lapak-jambi-web)"
check "superadmin @lapak-jambi-web (tetap akun pegawai) → 401" 401 \
  "$(login_code superadmin lapak-jambi-web 'SelokoBapenda@2025!')"
# Pesan 401 harus identik dengan akun yang tidak ada — tak ada beda yang bisa diintip.
check "pesan sama dengan akun tak dikenal" "$(login nobody@x.id lapak-jambi-web | j 'o.message')" \
  "$(login editor.profil@gmail.com lapak-jambi-web | j 'o.message')"
check "tanpa.role @seloko (tak ada penugasan di mana pun) → 403" 403 "$(login_code tanpa.role seloko)"
check "role.kedaluwarsa @seloko → 403"                     403 "$(login_code role.kedaluwarsa seloko)"
check "role.mati @seloko → 403"                            403 "$(login_code role.mati seloko)"

echo
echo "== Warga: hanya aplikasi PUBLIC tempat ia terdaftar =="
check "warga.pedagang @lapak-jambi-web → 200"   200 "$(login_code warga.pedagang@gmail.com lapak-jambi-web)"
check "warga.pedagang @seloko → 401 (tidak ada akun pegawai)" 401 "$(login_code warga.pedagang@gmail.com seloko)"
check "warga.pedagang @bapenda-profile (belum daftar) → 403" 403 \
  "$(login_code warga.pedagang@gmail.com bapenda-profile)"
check "warga tak bisa login pakai username" 401 "$(login_code warga.pedagang lapak-jambi-web)"
WARGA=$(login warga.pedagang@gmail.com lapak-jambi-web)
check "token warga: accountType PUBLIC" PUBLIC "$(echo "$WARGA" | j 'o.data.user.accountType')"
check "token warga: username null" null "$(echo "$WARGA" | j 'String(o.data.user.username)')"

echo
echo "== Email sama, dua akun berbeda =="
# viewer.only@gmail.com dimiliki pegawai DAN warga. Aplikasi yang dituju yang
# memilih baris mana — bukan urutan baris di tabel.
P=$(login viewer.only@gmail.com seloko)
W=$(login viewer.only@gmail.com lapak-jambi-web)
check "@seloko → akun pegawai"     INTERNAL "$(echo "$P" | j 'o.data.user.accountType')"
check "@lapak  → akun warga"       PUBLIC   "$(echo "$W" | j 'o.data.user.accountType')"
check "dua akun, dua id berbeda"   true \
  "$([ "$(echo "$P" | j 'o.data.user.id')" != "$(echo "$W" | j 'o.data.user.id')" ] && echo true || echo false)"

echo
echo "== Pagar lintas aplikasi di requirePermission =="
TW=$(echo "$WARGA" | j 'o.data.accessToken')
# Modul inti milik seloko. Warga tidak boleh menjangkaunya dari lapak, apa pun
# izin yang ia punya di lapak.
check "warga token lapak → GET /users (modul seloko) → 403"        403 "$(hit /users "$TW" lapak-jambi-web)"
check "warga token lapak → GET /roles → 403"                       403 "$(hit /roles "$TW" lapak-jambi-web)"
check "warga token lapak → GET /applications → 403"                403 "$(hit /applications "$TW" lapak-jambi-web)"
# Token warga dipakai dengan header seloko → ditolak authenticate (appCode beda).
check "warga token lapak + header seloko → 403"                    403 "$(hit /users "$TW" seloko)"
# Rute auth-only tetap terbuka untuk warga.
check "warga GET /applications/me → 200"                           200 "$(hit /applications/me "$TW" lapak-jambi-web)"
check "warga GET /auth/me → 200"                                   200 "$(hit /auth/me "$TW" lapak-jambi-web)"
check "warga /applications/me → hanya lapak-jambi-web" "lapak-jambi-web" \
  "$(curl -s "$BASE/applications/me" -H "Authorization: Bearer $TW" -H 'X-App-Code: lapak-jambi-web' | j 'o.data.map(a=>a.code).join()')"

echo
echo "== Pegawai mengelola modul inti dari seloko =="
TE=$(token editor.profil seloko)
check "editor.profil (tanpa role seloko) GET /users → 403"  403 "$(hit /users "$TE" seloko)"
check "editor.profil /applications/me → bapenda-profile" "bapenda-profile" \
  "$(curl -s "$BASE/applications/me" -H "Authorization: Bearer $TE" -H 'X-App-Code: seloko' | j 'o.data.map(a=>a.code).join()')"
TA=$(token admin.seloko seloko)
check "admin.seloko GET /users → 200"                      200 "$(hit /users "$TA" seloko)"

echo
echo "== Penugasan role: audience harus cocok =="
SU=$(token superadmin seloko 'SelokoBapenda@2025!')
AUTH="Authorization: Bearer $SU"
get() { curl -s "$BASE$1" -H "$AUTH" -H 'X-App-Code: seloko'; }
LAPAK=$(get '/applications?search=lapak-jambi-web' | j 'o.data.find(a=>a.code==="lapak-jambi-web").id')
SELOKO=$(get '/applications?search=seloko' | j 'o.data.find(a=>a.code==="seloko").id')
PEDAGANG=$(get "/roles?applicationId=$LAPAK&search=pedagang" | j 'o.data[0].id')
VERIF=$(get "/roles?applicationId=$LAPAK&search=verifikator" | j 'o.data[0].id')
WID=$(echo "$WARGA" | j 'o.data.user.id')
TANPA=$(get '/users?search=tanpa.role' | j 'o.data[0].id')
assign() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/users/$1/roles" -H "$AUTH" -H 'X-App-Code: seloko' \
  -H 'Content-Type: application/json' -d "{\"applicationId\":\"$2\",\"roleId\":\"$3\"}"; }
check "role pedagang punya audience PUBLIC" PUBLIC "$(get "/roles/$PEDAGANG" | j 'o.data.audience')"
check "warga diberi role pegawai (verifikator) → 400" 400 "$(assign "$WID" "$LAPAK" "$VERIF")"
check "pegawai diberi role warga (pedagang) → 400"    400 "$(assign "$TANPA" "$LAPAK" "$PEDAGANG")"
check "buat role PUBLIC di aplikasi INTERNAL → 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/roles" -H "$AUTH" -H 'X-App-Code: seloko' \
     -H 'Content-Type: application/json' -d "{\"applicationId\":\"$SELOKO\",\"name\":\"uji-warga\",\"audience\":\"PUBLIC\"}")"

echo
echo "== Daftar user terpisah per jenis akun =="
check "filter accountType=PUBLIC → 2 warga"  2 "$(get '/users?accountType=PUBLIC' | j 'o.meta.total')"
check "filter PUBLIC → semuanya warga" true "$(get '/users?accountType=PUBLIC' | j 'o.data.every(u=>u.accountType==="PUBLIC")')"
# Nama unik per run: user yang di-soft-delete tetap memegang username-nya.
U="uji.akses.$(date +%s)"
NEWU="{\"username\":\"$U\",\"email\":\"$U@bapenda-jambi.go.id\",\"fullName\":\"Uji Akses\",\"password\":\"Seloko@2025!\""
check "POST /users selalu membuat pegawai" INTERNAL \
  "$(curl -s -X POST "$BASE/users" -H "$AUTH" -H 'X-App-Code: seloko' -H 'Content-Type: application/json' \
     -d "$NEWU,\"accountType\":\"PUBLIC\"}" | j 'o.data.accountType')"
UJI=$(get "/users?search=$U" | j 'o.data[0].id')
curl -s -o /dev/null -X DELETE "$BASE/users/$UJI" -H "$AUTH" -H 'X-App-Code: seloko'
# Username milik akun soft-deleted tetap terpegang unique index — harus 409, bukan 500.
check "buat ulang username yang di-soft-delete → 409" 409 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/users" -H "$AUTH" -H 'X-App-Code: seloko' -H 'Content-Type: application/json' \
     -d "$NEWU}")"

echo
echo "== Pengaturan aplikasi =="
APP=$(get "/applications/$LAPAK")
check "lapak audience PUBLIC"          PUBLIC "$(echo "$APP" | j 'o.data.audience')"
check "lapak settings.seo terisi"      "%s | Lapak Jambi" "$(echo "$APP" | j 'o.data.settings.seo.titleTemplate')"
check "lapak logoUrl terisi"           true "$(echo "$APP" | j '!!o.data.logoUrl')"
patch() { curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/applications/$LAPAK" -H "$AUTH" -H 'X-App-Code: seloko' -H 'Content-Type: application/json' -d "$1"; }
check "settings key asing → 400"       400 "$(patch '{"settings":{"branding":{"primaryColour":"#000000"}}}')"
check "warna bukan hex → 400"          400 "$(patch '{"settings":{"branding":{"primaryColor":"orange"}}}')"
check "audience tak bisa diubah (di-strip)" PUBLIC \
  "$(curl -s -X PATCH "$BASE/applications/$LAPAK" -H "$AUTH" -H 'X-App-Code: seloko' -H 'Content-Type: application/json' \
     -d '{"name":"Lapak Jambi Web","audience":"INTERNAL"}' | j 'o.data.audience')"
check "buat app tanpa audience → 400"  400 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/applications" -H "$AUTH" -H 'X-App-Code: seloko' \
     -H 'Content-Type: application/json' -d '{"code":"uji-tanpa-audience","name":"Uji"}')"

echo
echo "$([ "$fail" = 0 ] && echo '✅' || echo '❌') $pass ok, $fail gagal"
[ "$fail" = 0 ] || exit 1
