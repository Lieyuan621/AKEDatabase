AKEData telah pindah ke domain www.akedata.wiki. Domain lama, akedata.top, kini dialihkan ke sini.

# Catatan Pembaruan Versi AKEData

### v1.2.2

Nilai mentah dan rumus kini dibuka dalam popover persisten saat angka diklik, menggantikan tooltip tertunda saat kursor diarahkan. Mengklik nilai lain mengganti isi; mengklik area kosong halaman atau menekan Esc menutup popover. Posisi diperbarui saat menggulir atau mengubah ukuran, mendukung perangkat seluler dan papan ketik, serta tidak mengubah gaya visual angka.

Memperbaiki handler klik induk pada beberapa modul yang mencegah klik mouse nyata membuka popover. Nilai skill `chr_0032_lizhiyan` yang tampil sebagai `[object Object]` juga diperbaiki.

### v1.2.1

Memperbaiki masalah yang dapat menyebabkan beberapa gambar game keliru diminta dari `www.akedata.wiki` setelah berpindah modul atau Service Worker dimulai ulang. Jalur gambar kini ditulis ulang secara sinkron ke `data.akedata.wiki` saat dimasukkan ke halaman.

Service Worker kini memulihkan asal data dan revisi data bersama dari URL pendaftarannya. Perutean gambar tetap benar meskipun browser menghentikan lalu memulai ulang Worker. Ikon situs juga dimuat langsung dari asal data.

Menambahkan penguraian data musuh `LevelScriptData` ke perhitungan atribut Dungeon, Contingency Contract, dan Echoes of War. Musuh, level, dan Buff saat muncul yang ditentukan langsung dalam skrip, serta Buff bersyarat dari spawner, kini ikut dihitung. Stage tanpa SpawnerConfig juga dapat dihitung dengan benar. Pemuatan awal Buff kondisi Contingency Contract dan perhitungan ulang setelah kondisi berubah juga telah diperbaiki.

Meningkatkan tooltip nilai mentah. Nilai tanpa perubahan perhitungan tetap menampilkan nilai asli; nilai yang diubah oleh atribut, Buff, kondisi kontrak, atau ekspresi kini menampilkan nilai asli, parameter substitusi, rumus lengkap, dan hasil akhir. Pelacakan rumus mencakup Dungeon, Contingency Contract, Echoes of War, musuh, serta ekspresi karakter, senjata, perlengkapan, dan item.

### v1.2.0

Menambahkan perbandingan data antarversi game. Saat `Latest` dipilih, situs otomatis membandingkannya dengan Hotfix terakhir dari versi game sebelumnya. Entri baru selalu ditempatkan di depan dan diberi tag; tag perubahan serta Diff detail dapat diaktifkan melalui opsi eksperimental di pengaturan global yang secara default nonaktif.

Diff detail hanya membandingkan informasi yang benar-benar ditampilkan di halaman, menandai penghapusan dengan merah dan penambahan dengan hijau, serta mengabaikan field tersembunyi. Aktivitas tidak termasuk dalam deteksi entri baru. Perlengkapan dan medali dibandingkan berdasarkan ID individual, dan set atau kategorinya juga diberi tag. Bingkai kartu tetap mengikuti warna rarity.

### v1.2.0-pre2

Pemetaan Attribute lengkap telah diperbarui dengan ID 93–100 dan disinkronkan ke `maps.json` untuk seluruh 14 bahasa.

Modul musuh dan dungeon kini menggunakan parameter resistansi elemen baru (ID 94–99). ID koefisien resistansi lama 80–85 tidak lagi ditampilkan pada kartu atribut, ringkasan modifier, maupun tooltip Buff terkait.

### v1.1.9

Menambahkan modul khusus tantangan permanen “Gema Perang”, dengan tampilan per musim dan rotasi untuk stage, tingkat kesulitan, gelar peringkat, hadiah merit, dan petunjuk resmi. Modul ini juga menampilkan gelombang musuh, peta posisi spawn, Buff saat spawn, serta atribut yang disesuaikan dengan level, lengkap dengan pergantian gelombang dan sorotan peta yang saling terhubung.

### v1.1.8

Menambahkan mode debug dan penyegaran paksa cache web; memperbaiki node atribut karakter dan parsing biaya pengembangan berdasarkan deskripsi item; mengalihkan tipe aktivitas ke ActivityTagTable; membaca style dan istilah rich text langsung dari TableCfg; serta menambahkan tombol beranda di sidebar untuk modul yang memiliki halaman awal.

### v1.1.6

Menambahkan pengumuman dalam situs dan hitung mundur pembaruan, mengadaptasi kelompok skill dua wujud Jue, mengoptimalkan petunjuk pemuatan, serta menghapus banyak modul v2 yang telah dihentikan.

### v1.1.5

Meluncurkan kerangka multibahasa yang mendukung pergantian bahasa untuk antarmuka, modul, opsi filter, dan pemetaan data, sekaligus menambahkan kumpulan awal sumber daya multibahasa.

### v1.1.4

Memperbaiki parameter versi permintaan data, memisahkan versi penyegaran sumber daya aplikasi dan data publik, serta menyatukan penentuan versi cache halaman dan Service Worker.

### v1.1.3

Menambahkan efek penggunaan consumable dan resep crafting pada modul item, melengkapi relasi material dan hasil, gaya detail, serta adaptasi data v3 terkait.

### v1.1.2

Menambahkan pintu masuk ringkasan berbentuk kartu berkelompok untuk modul karakter, senjata, musuh, perlengkapan, aktivitas, item, dungeon, medali, penelitian, dan modul lainnya.

### v1.1.1

Mendesain ulang filter kategori item dengan dukungan pelipatan dan jumlah hasil filter, sekaligus meningkatkan deduplikasi permintaan, cache IndexedDB, dan tampilan progres pemuatan data.

### v1.1.0

Meluncurkan lapisan adaptasi data v3 berbasis TableCfg dan Json untuk modul kueri utama, serta menambahkan mekanisme penonaktifan modul dan cache berkas data besar.

### v1.0.31

Sempat menambahkan pergantian antarmuka Mandarin-Inggris, direktori data, dan konfigurasi internasionalisasi terkait, tetapi fitur tersebut kemudian di-rollback sepenuhnya dan tidak dilanjutkan pada tahap ini.

### v1.0.30

Menambahkan pembungkus cache permintaan terpadu dan mengalihkan setiap halaman ke akeFetch untuk memuat data, sehingga mengurangi permintaan berulang dan mengoptimalkan pemuatan saat berpindah modul.

### v1.0.29

Memisahkan script tertanam dari halaman utama dan setiap modul ke direktori plugin/js, serta memusatkan pengelolaan routing, pengaturan, perhitungan atribut, dan controller modul.

### v1.0.28

Menambahkan petunjuk nilai mentah untuk parameter di sebagian besar modul, serta memperbaiki perhitungan HP monster dan kesalahan tampilan "pengurangan semua damage".

### v1.0.27

Menambahkan visualisasi wave monster pada Contingency Contract dengan koordinat spawn, pergantian wave, dan sorotan tertaut, serta memperbaiki statistik penggabungan untuk wave berulang.

### v1.0.26

Menambahkan pemeriksaan atribut musuh pada Contingency Contract, dengan perhitungan dan tampilan atribut aktual berdasarkan level, Buff saat spawn, serta tag kontrak yang dipilih.

### v1.0.25

Memuat awal dan membuka modul Contingency Contract yang dibatasi Token, dengan dukungan pencarian season, kondisi dan konflik tag, skor, reward, misi, serta tampilan shop.

### v1.0.24

Memperbarui tampilan skill karakter v2, memperbaiki urutan Combo Skill dan Ultimate Skill, serta mempertahankan parameter penting seperti cooldown dan konsumsi energi.

### v1.0.23

Membuka resmi modul penelitian, meningkatkan Markdown, syntax highlighting, indeks daftar isi, navigasi anchor, dan pratinjau gambar, serta menambahkan artikel penelitian mekanisme.

### v1.0.22

Menambahkan pembatasan akses modul dan konten berbasis Token, dengan dukungan persistensi Token, penambahan massal, penghapusan, serta pemuatan awal konten yang dilindungi.

### v1.0.21

Menambahkan koefisien physical abnormal damage dan arts abnormal damage pada tabel pertumbuhan atribut karakter v2, dengan presisi berbeda sesuai mode tampilan.

### v1.0.20

Menyesuaikan urutan dan beberapa nama atribut detail musuh, memajukan entri interrupt resistance dan execution, serta menyeragamkan istilah pada entri bonus damage.

### v1.0.19

Menambahkan tampilan equipment ID pada modul perlengkapan, merapikan gaya v2 karakter, senjata, dan perlengkapan, serta memperbaiki warna atribut dan pemilihan nilai pertumbuhan.

### v1.0.18

Menambahkan deep link untuk modul dan entri, menyinkronkan address bar saat navigasi dan menangani konten tersembunyi atau tidak ada, sekaligus melengkapi tampilan tipe koreksi atribut karakter.

### v1.0.17

Merilis resmi senjata v2 dengan pencarian senjata serta tampilan data mendetail untuk atribut level, material breakthrough, potential, dan skill.

### v1.0.16

Merilis resmi perlengkapan v2, menampilkan komponen berdasarkan set beserta atribut utama dan subatribut, set skill, resep crafting, jaminan precision forging, serta informasi enhancement.

### v1.0.15

Merilis resmi dungeon v2 dengan detail seri dungeon, reward, dan musuh, serta parsing konfigurasi spawn dan Buff untuk menampilkan wave dan atribut setelah koreksi.

### v1.0.14

Merilis resmi musuh v2 dengan pencarian, daftar mobile, atribut level, varian musuh, koreksi atribut, resistance, dan informasi stagger.

### v1.0.13

Merilis resmi karakter v2, merombak informasi atribut, skill, talent, potential, dan pertumbuhan karakter, serta memperbaiki tampilan trait, gambar, dan node.

### v1.0.12

Meningkatkan timeline SkillData v2 dengan filter action, flowchart cabang kondisi, visibilitas node, dan petunjuk durasi frame, serta memperbaiki sebagian nilai monster.

### v1.0.11

Menambahkan tampilan debug SkillData v2 tersembunyi yang menyajikan logika skill melalui timeline dan action node, serta mendukung pencarian dan pemeriksaan data mentah.

### v1.0.10

Melanjutkan perombakan karakter v2 dengan membangun detail karakter baru dan menghubungkan data karakter lengkap, sekaligus menyempurnakan pemetaan field dan struktur tampilan.

### v1.0.9

Menambahkan modul kueri SpawnerConfig untuk menelusuri data spawner berdasarkan scene dan konfigurasi, serta menyesuaikan pintu masuk kueri BuffData dan SkillData.

### v1.0.8

Menambahkan modul kueri BuffData dan SkillData dengan penelusuran manifest, pencarian, dan tampilan detail, sebagai pintu masuk penelitian data pertempuran tingkat dasar.

### v1.0.7

Menambahkan kueri informasi aktivitas, menyesuaikan tampilan default tag karakter dan mendukung tag khusus Rossi, sekaligus menambahkan statistik kunjungan situs.

### v1.0.6

Menambahkan daftar sponsor beserta gayanya pada halaman Tentang, sehingga tampilan informasi apresiasi proyek menjadi lebih lengkap.

### v1.0.5

Menyelesaikan adaptasi mobile untuk modul utama karakter, senjata, musuh, perlengkapan, item, dungeon, achievement, dan lainnya, termasuk ketiga tema.

### v1.0.4

Menambahkan fungsi filter pada modul karakter, senjata, dan item, serta merombak area filter daftar agar pencarian di antara banyak entri lebih efisien.

### v1.0.3

Menambahkan antarmuka kueri item dan mendaftarkan modul item, dengan dukungan daftar item, detail, serta tampilan informasi dasar terkait.

### v1.0.2

Menambahkan ikon skill dan tampilan base skill pada halaman karakter, termasuk tipe facility, level skill, deskripsi, dan syarat unlock, serta memperbaiki data terkait.

### v1.0.1

Memperbaiki tampilan data atribut tetap musuh yang tidak normal, sekaligus menyempurnakan informasi musuh pada halaman dungeon.

### v1.0.0

AKEData 1.0 resmi diluncurkan dengan penyempurnaan terpusat pada konten kueri dungeon, serta menaikkan versi proyek dari 0.99 menjadi 1.0.
