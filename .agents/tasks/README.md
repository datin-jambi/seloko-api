# 🧭 Pipeline Tugas — Penjelasan & Aturan

Folder ini menyimpan **pipeline tugas per aplikasi**: daftar pekerjaan berurutan, kecil, dan dapat diverifikasi, sehingga siapa pun (developer atau AI Agent) tahu **sudah sampai mana, apa berikutnya, dan cara membuktikan selesai**.

| Berkas | Aplikasi | PRD |
|---|---|---|
| [`lapak-jambi.md`](./lapak-jambi.md) | `lapak-jambi-web` | [`../prd/04-lapak-jambi.prd.md`](../prd/04-lapak-jambi.prd.md) |

## Aturan
1. **Satu tugas = satu unit kerja kecil** (umumnya satu modul/tabel) dengan ID tetap, mis. `LJ-1.2`. ID tidak pernah dipakai ulang; tugas batal ditandai `⛔`.
2. **Status:** `⏳` belum · `🟡` dikerjakan · `✅` selesai · `⛔` batal/diganti. Hanya **satu** tugas `🟡` dalam satu waktu.
3. **Mulai tugas** hanya bila semua kolom *Butuh* sudah `✅`.
4. **Selesai** = kolom *Bukti* lolos (typecheck/test/smoke yang disebut) **dan** PRD terkait diperbarui. Tulis satu baris di *Log* (tanggal, ID, bukti singkat, catatan). Jangan menandai ✅ tanpa menjalankan buktinya.
5. **Debugging:** setiap tugas punya suite smoke sendiri (`npm run db:smoke -- <nama>`) atau `*.check.ts`, sehingga regresi bisa ditelusuri ke satu tugas.
6. **Perubahan rencana** (tugas baru, urutan berubah) dicatat di sini dalam perubahan yang sama, bukan hanya di chat.
7. Status ringkas tiap fase disalin ke roadmap di `AGENTS.md`.
