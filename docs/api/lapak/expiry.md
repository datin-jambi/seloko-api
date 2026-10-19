# Worker Kedaluwarsa — `/api/lapak/expiry`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/expiry` · **Jumlah endpoint:** 5
- **Sumber kode:** `src/modules/lapak/expiry/expiry.routes.ts`
- **Proses terjadwal:** `src/workers/lapak-expiry.worker.ts`
- **Fase:** 2 (LJ-2.8)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/status` | `order:read` | Ringkasan kedaluwarsa (**tanpa mengubah data**) |
| `POST` | `/run` | `order:update` | Jalankan worker sekarang |
| `GET` | `/runs` | `order:read` | Riwayat run |
| `GET` | `/runs/:id` | `order:read` | Detail satu run |
| `DELETE` | `/runs` | `order:update` | Bersihkan riwayat lama |

## Tiga Pembersihan

Worker menjalankan tiga fungsi yang sudah ada di modulnya masing-masing:

| Langkah | Fungsi | Efek |
|---|---|---|
| 1 | `releaseExpiredHolds()` | HOLD lampau → `RELEASED` (slot bebas) |
| 2 | `expireOverduePayments()` | Pembayaran & pesanan → `KEDALUWARSA`, SKRD → `CANCELLED` |
| 3 | `expireOverdueTickets()` | Tiket lewat `validUntil` → `KEDALUWARSA` |

**Berurutan, bukan paralel:** pelepasan HOLD lebih dulu agar slot sudah bebas ketika pesanan ditandai kedaluwarsa.

## Tiga Jaminan

### 1. Hanya satu run berjalan

```sql
CREATE UNIQUE INDEX "uq_lapak_expiry_runs_running"
  ON "lapak_expiry_runs"("lock_key")
  WHERE "status" = 'RUNNING';
```

Ditegakkan **di database**, bukan hanya di kode. Dua proses/instance yang menjalankan worker bersamaan → `INSERT` kedua gagal `P2002` → `409`.

Pengecekan di kode saja tidak cukup: dua proses bisa lolos pengecekan pada saat yang sama.

### 2. Setiap run tercatat

`lapak_expiry_runs` menyimpan: job, status, jumlah baris yang diubah per jenis, pemicu, error, mulai/selesai, dan durasi.

Worker ini **mengubah status pesanan, SKRD, dan slot** — perubahan yang tidak tercatat tidak bisa ditelusuri.

### 3. Idempoten lintas-run

Ketiga fungsi pembersih memakai `WHERE` berbasis waktu/status, jadi run kedua pada data yang sama mengubah **0 baris**. Diuji nyata di smoke.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `force` | body | boolean | Jalankan meski ada run lain RUNNING (run lama → `TERPUTUS`) |
| `status` | query | enum | Filter riwayat: `RUNNING`\|`SUKSES`\|`GAGAL`\|`TERPUTUS` |
| `page` / `limit` | query | int | Paginasi riwayat |
| `id` | param | uuid | ID run |
| `olderThanDays` | query | int 1–3650 | Simpan run N hari terakhir (default 30) |

## 1. Status — Tanpa Mengubah Data

`GET /api/lapak/expiry/status`

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Status kedaluwarsa",
  "data": {
    "running": false,
    "currentRunId": null,
    "pending": { "holds": 2, "payments": 1, "tickets": 0 },
    "lastRun": {
      "id": "01a15280-...", "job": "lapak-expiry", "status": "SUKSES",
      "releasedHolds": 2, "expiredPayments": 1, "expiredTickets": 0,
      "triggeredBy": "01a15280-...", "error": null,
      "startedAt": "2026-10-23T09:00:00.000Z",
      "finishedAt": "2026-10-23T09:00:00.412Z",
      "durationMs": 412
    }
  }
}
```

`pending` menghitung baris yang **sudah** lewat batas tapi **belum** diproses — operator tahu apakah perlu menjalankan worker sekarang.

**Aman dipanggil berkali-kali** — tidak mengubah apa pun (diuji).

## 2. Jalankan Worker

`POST /api/lapak/expiry/run`

```json
{ "force": false }
```

```json
{
  "data": {
    "id": "01a15280-...", "job": "lapak-expiry", "status": "SUKSES",
    "releasedHolds": 2, "expiredPayments": 1, "expiredTickets": 0,
    "triggeredBy": "01a15280-...", "error": null,
    "startedAt": "2026-10-23T09:00:00.000Z",
    "finishedAt": "2026-10-23T09:00:00.412Z",
    "durationMs": 412
  }
}
```

**`409`** bila ada run lain yang sedang berjalan dan `force: false`. Memaksa dengan `force: true` akan menandai run lama `TERPUTUS` lebih dulu.

## 3. Run yang Menggantung

Bila proses mati di tengah run, baris tertinggal `RUNNING` dan menghalangi run berikutnya.

**Penanganan otomatis:** run `RUNNING` yang lebih tua dari **10 menit** ditandai `TERPUTUS` di awal setiap run baru.

**Penanganan manual:** `force: true`.

## 4. Riwayat & Housekeeping

`GET /api/lapak/expiry/runs?status&page&limit`

`DELETE /api/lapak/expiry/runs?olderThanDays=30`

**Run `RUNNING` tidak pernah dihapus** — ia penanda worker sedang bekerja. Menghapusnya akan memungkinkan dua worker berjalan bersamaan.

## Proses Terjadwal

```bash
npx tsx src/workers/lapak-expiry.worker.ts
```

| Env | Default | Keterangan |
|---|---|---|
| `LAPAK_EXPIRY_INTERVAL_MS` | `300000` (5 menit) | Interval antar run |

**Kenapa proses terpisah, bukan `setInterval` di server:** bila API di-scale menjadi beberapa instance, setiap instance akan menjalankan worker sendiri. Lock DB mencegah tumpang tindih, tetapi lebih bersih memisahkan beban latar dari jalur permintaan pengguna.

### Shutdown rapi

`SIGTERM`/`SIGINT` menunggu run yang sedang berjalan selesai sebelum keluar — agar tidak meninggalkan status `RUNNING` menggantung.

### Log hemat

Worker hanya mencetak log bila **ada yang berubah**. Tanpa ini, log akan terisi satu baris setiap 5 menit selamanya.

### Lock dipegang run lain bukan kegagalan

Bila proses lain sedang berjalan, worker hanya mencetak "lewati" — bukan error. Dua instance yang hidup bersamaan adalah keadaan normal.

## Yang TIDAK dilakukan Worker

| Hal | Alasan |
|---|---|
| Menghapus data lama | Worker ini hanya mengubah status; data transaksi disimpan untuk audit |
| Melepas slot saat pesanan kedaluwarsa | Slot dilepas oleh langkah HOLD (langkah 1), bukan langkah 2 — satu tempat mengatur slot |
| Mengembalikan nomor SKRD | **Gapless**: nomor yang sudah terbit tidak pernah dipakai ulang |
| Mengirim notifikasi | Menyusul (email/WA) |

## Urutan Efek yang Terjaga

```
HOLD lampau → RELEASED (slot bisa dipesan lagi)
Pembayaran lampau → KEDALUWARSA
Pesanan terkait → KEDALUWARSA
SKRD terkait → CANCELLED (nomor tetap terpakai)
Tiket lewat masa berlaku → KEDALUWARSA
```

Diuji end-to-end: nomor SKRD yang dibatalkan **tidak dipakai ulang** oleh pesanan berikutnya.

---

## 🎉 Fase 2 (Transaksi) SELESAI

| LJ-2.1 | LJ-2.2 | LJ-2.3 | LJ-2.4 | LJ-2.5 | LJ-2.6 | LJ-2.7 | LJ-2.8 |
|---|---|---|---|---|---|---|---|
| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Alur lengkap: **katalog → keranjang → reservasi → checkout → SKRD → bayar → tiket → pakai → kedaluwarsa**.
