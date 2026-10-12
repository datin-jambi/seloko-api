# 📋 Master PRD Index & Super App Architecture — SELOKO API

Dokumen ini adalah **Living Product Requirement Document (PRD)** terpusat untuk ekosistem **SELOKO API (BPKPD Provinsi Jambi)**. 

---

## 🏛️ Visi Produk: Super App & Multi-Tenancy Gateway BPKPD Jambi

SELOKO API dibangun bukan hanya untuk satu website, melainkan sebagai **Pondasi Super App & Identity Engine Terpusat** Pemerintah Provinsi Jambi. Sistem ini mengisolasi logika bisnis, hak akses, dan konten ke dalam multi-tenant yang fleksibel namun terpusat pada satu database dan identity provider.

```text
                               ┌───────────────────────────┐
                               │   SELOKO IDENTITY ENGINE  │
                               │  (Users, RBAC, Apps, Auth) │
                               └─────────────┬─────────────┘
                                             │
             ┌───────────────────────────────┼───────────────────────────────┐
             │                               │                               │
             ▼                               ▼                               ▼
    [bapenda-profile]               [lapak-jambi-web]               [simpad-pajak-api]
 (Portal Resmi Bapenda)         (Marketplace UMKM Daerah)        (Sistem Pendapatan Pajak)
 - UPTD Samsat & Peta           - Katalog Lapak & Produk         - Pajak Kendaraan (PKB)
 - Banner Promosi               - Verifikasi Pedagang            - Pajak Air & BBNKB
 - Artikel Berita               - Transaksi Pembayaran           - Simulasi & Retribusi
 - Regulasi & FAQ               - Tracking Pengiriman            - Rekonsiliasi Bank
```

---

## 📑 Daftar PRD per Domain Aplikasi

PRD dipisahkan secara modular per domain/aplikasi agar mudah di-scaling saat sistem berkembang:

| No | Dokumen PRD | Kode Aplikasi | Lingkup & Fitur Utama | Status Saat Ini |
|:---:|:---|:---:|:---|:---:|
| **1** | [**`01-seloko-identity.prd.md`**](./01-seloko-identity.prd.md) | `seloko` | Core Platform: Multi-Tenancy, Auth JWT & Token Reuse Detection, Dynamic RBAC, User Management (Internal vs Public), Sidebar Menus, Centralized ImageKit Storage. | ✅ **Stabil (Production Ready)** |
| **2** | [**`02-bapenda-profile.prd.md`**](./02-bapenda-profile.prd.md) | `bapenda-profile` | Portal Publik & CMS (rebuild dari `Bapenda-Jambi-Profile`): UPTD Samsat, Banners, Berita (konten universal `type=NEWS`), Halaman Profil, Galeri, FAQ, Regulasi. | 🟡 **Fase Pengerjaan (Modul 4: Halaman Profil)** |
| **3** | *`03-simpad-pajak.prd.md`* *(Upcoming)* | `simpad` | Layanan Perpajakan: Cek Pajak Kendaraan, E-Samsat Gateway, Simulasi Pajak, Rekonsiliasi Bank Jambi. | ⏳ *Rencana Masa Depan* |
| **4** | *`04-lapak-jambi.prd.md`* *(Upcoming)* | `lapak-jambi` | E-Commerce Daerah: Produk UMKM, Pedagang, Pembayaran Digital, Integrasi Pengiriman. | ⏳ *Rencana Masa Depan* |

---

## 🔄 Aturan "Living Document" untuk AI Agent & Developer

Dokumen PRD di folder ini **BUKAN dokumen statis**, melainkan dokumen hidup yang mencerminkan pemikiran arsitektural dan hasil diskusi:

1. **Wajib Sinkron Saat Diskusi Modul Baru:**
   - Setiap kali terjadi diskusi eksplorasi fitur baru di chat, AI Agent **wajib otomatis memperbarui dokumen PRD terkait** (menambahkan skema data baru, alur logika, atau persyaratan bisnis) sehingga ide tidak hilang saat sesi ditutup.
2. **Pembaruan Status Bertahap:**
   - Setelah modul selesai diimplementasikan dan lolos uji smoke runner, agen wajib mengupdate status fitur di tabel PRD dari `⏳ Planned` / `🟡 In Progress` menjadi `✅ Completed`.
3. **Upscaling Domain Baru:**
   - Ketika pimpinan/pengembang ingin menambah aplikasi baru ke dalam Super App (misal: modul pajak daerah baru), cukup buat berkas `XX-<nama-domain>.prd.md` mengikuti struktur template yang ada.
